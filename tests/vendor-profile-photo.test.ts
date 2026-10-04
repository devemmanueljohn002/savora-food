import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Test-only env defaults (DB/S3 never touched by these pure tests).
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-for-vendor-photo";
process.env.APP_URL ??= "http://localhost:3000";

import { ApiError } from "@/server/errors";
import {
  buildCanonicalRequest,
  createPresignedPost,
  presignUrl,
  sha256Hex,
  uriEncode,
  uriEncodePath,
} from "@/server/storage/sigv4";
import {
  canViewPhoto,
  extensionForMime,
  finalizeVendorPhoto,
  isKeyUnderVendorPrefix,
  finalKeyFor,
  parseStagingKey,
  PHOTO_MAX_BYTES,
  sanitizeImage,
  sniffImage,
  stagingKeyFor,
  validateUploadDeclaration,
} from "@/server/storage/photos";

const sharpAvailable = await import("sharp").then(
  () => true,
  () => false,
);
const describeSharp = sharpAvailable ? describe : describe.skip;

const VENDOR = "11111111-1111-4111-8111-111111111111";
const OTHER_VENDOR = "22222222-2222-4222-8222-222222222222";
const PHOTO_UUID = "33333333-3333-4333-8333-333333333333";

describe("upload declaration validation", () => {
  it("accepts JPEG/PNG/WebP within 5 MB", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp"] as const) {
      expect(validateUploadDeclaration(mime, 1024)).toEqual({ contentType: mime, sizeBytes: 1024 });
    }
    expect(validateUploadDeclaration("image/jpeg", PHOTO_MAX_BYTES).sizeBytes).toBe(PHOTO_MAX_BYTES);
  });

  it("rejects anything else before any storage work", () => {
    for (const mime of ["image/gif", "image/svg+xml", "application/pdf", "", null, undefined]) {
      expect(() => validateUploadDeclaration(mime, 100)).toThrowError(ApiError);
    }
    for (const size of [0, -5, 1.5, NaN, "100", null, PHOTO_MAX_BYTES + 1]) {
      expect(() => validateUploadDeclaration("image/jpeg", size)).toThrowError(ApiError);
    }
  });

  it("derives the extension from the validated MIME, never a filename", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/webp")).toBe("webp");
  });
});

describe("server-generated keys", () => {
  it("builds staging and final keys in the required shapes", () => {
    expect(stagingKeyFor(VENDOR, PHOTO_UUID, "jpg")).toBe(`staging/${VENDOR}/${PHOTO_UUID}.jpg`);
    expect(finalKeyFor(VENDOR, PHOTO_UUID, "webp")).toBe(`vendors/${VENDOR}/profile/${PHOTO_UUID}.webp`);
  });

  it("round-trips a valid staging key", () => {
    const key = stagingKeyFor(VENDOR, PHOTO_UUID, "png");
    expect(parseStagingKey(key)).toEqual({ vendorId: VENDOR, uuid: PHOTO_UUID, ext: "png" });
  });

  it("rejects traversal, wrong prefixes, wrong extensions, garbage", () => {
    expect(parseStagingKey(`staging/${VENDOR}/../../etc/passwd`)).toBeNull();
    expect(parseStagingKey(`staging/${VENDOR}/${PHOTO_UUID}.exe`)).toBeNull();
    expect(parseStagingKey(`staging/${VENDOR}/${PHOTO_UUID}.gif`)).toBeNull();
    expect(parseStagingKey(`vendors/${VENDOR}/profile/${PHOTO_UUID}.jpg`)).toBeNull();
    expect(parseStagingKey(`staging/${VENDOR}/not-a-uuid.jpg`)).toBeNull();
    expect(parseStagingKey("")).toBeNull();
    expect(parseStagingKey(null)).toBeNull();
  });

  it("rejects another vendor's staging key at finalize time (no S3 needed)", async () => {
    const otherKey = stagingKeyFor(OTHER_VENDOR, PHOTO_UUID, "jpg");
    await expect(finalizeVendorPhoto({ vendorId: VENDOR, stagingKey: otherKey })).rejects.toThrowError(ApiError);
    await expect(
      finalizeVendorPhoto({ vendorId: VENDOR, stagingKey: `staging/${VENDOR}/../evil.jpg` }),
    ).rejects.toThrowError(ApiError);
  });

  it("confines destructive deletes to the vendor's own prefixes", () => {
    expect(isKeyUnderVendorPrefix(`vendors/${VENDOR}/profile/a.jpg`, VENDOR)).toBe(true);
    expect(isKeyUnderVendorPrefix(`staging/${VENDOR}/b.png`, VENDOR)).toBe(true);
    expect(isKeyUnderVendorPrefix(`vendors/${OTHER_VENDOR}/profile/a.jpg`, VENDOR)).toBe(false);
    expect(isKeyUnderVendorPrefix("orders/whatever", VENDOR)).toBe(false);
  });
});

describe("pure image sniffing", () => {
  const fixture = resolve(__dirname, "fixtures/photo-valid-1x1.png");

  it("recognizes a genuine PNG with dimensions", () => {
    expect(sniffImage(readFileSync(fixture))).toEqual({ format: "png", width: 1, height: 1, hasExif: false });
  });

  it("detects JPEG EXIF segments and reads SOF dimensions", () => {
    // SOI + APP1(Exif, length 16 → 14 data bytes) + SOF0(2x3).
    const exif = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe1, 0x00, 0x10]),
      Buffer.from("Exif\0\0FAKEDATA", "ascii"),
      Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x03, 0x00, 0x02, 0x01, 0x01, 0x11, 0x00]),
    ]);
    expect(sniffImage(exif)).toEqual({ format: "jpg", width: 2, height: 3, hasExif: true });

    // NOTE: JFIF filler is explicit bytes — "\0" + digits would lex as octal.
    const clean = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      Buffer.from([0x4a, 0x46, 0x49, 0x46, 0x00, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]),
      Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x05, 0x00, 0x04, 0x01, 0x01, 0x11, 0x00]),
    ]);
    expect(sniffImage(clean)).toEqual({ format: "jpg", width: 4, height: 5, hasExif: false });
  });

  it("reads WebP VP8X/VP8L canvas sizes", () => {
    const vp8x = Buffer.alloc(30);
    vp8x.write("RIFF", 0);
    vp8x.write("WEBP", 8);
    vp8x.write("VP8X", 12);
    vp8x.writeUInt32LE(10, 16);
    // VP8X data: flags(1) + reserved(3) + width-1(3) + height-1(3).
    vp8x.writeUIntLE(9, 24, 3); // width-1 = 9 → 10
    vp8x.writeUIntLE(19, 27, 3); // height-1 = 19 → 20
    expect(sniffImage(vp8x)).toEqual({ format: "webp", width: 10, height: 20, hasExif: false });
  });

  it("rejects non-images and truncated files", () => {
    expect(sniffImage(Buffer.from("definitely not an image file"))).toBeNull();
    expect(sniffImage(Buffer.from("GIF89a", "ascii"))).toBeNull();
    expect(sniffImage(readFileSync(fixture).subarray(0, 10))).toBeNull();
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull(); // SOI+EOI, no SOF
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe("SigV4 (verified against official AWS vectors)", () => {
  it("builds the official get-vanilla canonical request byte-for-byte", () => {
    const { canonicalRequest, signedHeaders } = buildCanonicalRequest({
      method: "GET",
      path: "/",
      queryParams: [],
      headers: { host: "example.amazonaws.com", "x-amz-date": "20150830T123600Z" },
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
    expect(canonicalRequest).toBe(
      "GET\n/\n\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(signedHeaders).toBe("host;x-amz-date");
    // Official string-to-sign hash from get-vanilla.sts.
    expect(sha256Hex(canonicalRequest)).toBe("bb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63");
  });

  it("matches botocore's S3 presigned-URL signature exactly (full pipeline)", () => {
    const url = presignUrl({
      method: "GET",
      host: "s3.us-west-2.amazonaws.com",
      path: "/mybucket/keyname/.bar",
      credentials: { accessKeyId: "access_key", secretAccessKey: "secret_key" },
      region: "myregion",
      service: "myservice",
      expiresInSeconds: 60,
      now: new Date("2014-01-01T00:00:00Z"),
    });
    const params = new URL(url).searchParams;
    expect(params.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(params.get("X-Amz-Expires")).toBe("60");
    expect(params.get("X-Amz-SignedHeaders")).toBe("host");
    expect(params.get("X-Amz-Signature")).toBe("ac1b8b9e47e8685c5c963d75e35e8741d55251cd955239cc1efad4dc7201db66");
  });

  it("builds a locked-down POST policy (exact key/type/range, short expiry)", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const post = createPresignedPost({
      bucket: "savora-private",
      region: "eu-west-1",
      key: `staging/${VENDOR}/${PHOTO_UUID}.jpg`,
      contentType: "image/jpeg",
      minBytes: 1,
      maxBytes: PHOTO_MAX_BYTES,
      credentials: { accessKeyId: "AKID", secretAccessKey: "SECRET" },
      expiresInSeconds: 300,
      now,
    });
    expect(post.url).toBe("https://savora-private.s3.eu-west-1.amazonaws.com/");
    expect(post.expiresAt).toBe("2026-01-01T00:05:00Z");
    expect(post.fields.key).toBe(`staging/${VENDOR}/${PHOTO_UUID}.jpg`);
    expect(post.fields["Content-Type"]).toBe("image/jpeg");
    expect(post.fields["x-amz-signature"]).toMatch(/^[0-9a-f]{64}$/);
    // No ACL / public-read anywhere: the object inherits the private bucket.
    expect(JSON.stringify(post.fields)).not.toMatch(/acl|public-read/i);
    const policy = JSON.parse(Buffer.from(post.fields.policy, "base64").toString("utf8")) as {
      expiration: string;
      conditions: unknown[];
    };
    expect(policy.expiration).toBe("2026-01-01T00:05:00Z");
    expect(policy.conditions).toContainEqual({ bucket: "savora-private" });
    expect(policy.conditions).toContainEqual({ key: `staging/${VENDOR}/${PHOTO_UUID}.jpg` });
    expect(policy.conditions).toContainEqual({ "Content-Type": "image/jpeg" });
    expect(policy.conditions).toContainEqual(["content-length-range", 1, PHOTO_MAX_BYTES]);
  });

  it("rejects invalid presign inputs", () => {
    const base = {
      method: "GET",
      host: "h",
      path: "/k",
      credentials: { accessKeyId: "a", secretAccessKey: "b" },
      region: "r",
      service: "s3",
    } as const;
    expect(() => presignUrl({ ...base, expiresInSeconds: 0 })).toThrow();
    expect(() => presignUrl({ ...base, expiresInSeconds: 8 * 24 * 3600 })).toThrow();
  });

  it("encodes per AWS rules (space→%20, ~ kept, !'()* upper-hex, / kept in paths)", () => {
    expect(uriEncode("a b~c")).toBe("a%20b~c");
    expect(uriEncode("!'()*")).toBe("%21%27%28%29%2A");
    expect(uriEncodePath("/staging/a b/c.jpg")).toBe("/staging/a%20b/c.jpg");
  });
});

describe("view authorization matrix", () => {
  const target = VENDOR;
  const activeOrder = { vendorId: VENDOR, assigned: true, active: true };

  it("vendor: own photo yes, another vendor no", () => {
    expect(canViewPhoto({ role: "VENDOR", vendorId: VENDOR }, target)).toBe(true);
    expect(canViewPhoto({ role: "VENDOR", vendorId: OTHER_VENDOR }, target)).toBe(false);
  });

  it("admin: yes", () => {
    expect(canViewPhoto({ role: "ADMIN" }, target)).toBe(true);
  });

  it("assigned rider on an active order for this vendor: yes", () => {
    expect(canViewPhoto({ role: "RIDER", riderId: "r1", order: activeOrder }, target)).toBe(true);
  });

  it("unrelated rider / wrong vendor / unassigned / inactive order: no", () => {
    expect(canViewPhoto({ role: "RIDER", riderId: "r1", order: null }, target)).toBe(false);
    expect(
      canViewPhoto({ role: "RIDER", riderId: "r1", order: { ...activeOrder, vendorId: OTHER_VENDOR } }, target),
    ).toBe(false);
    expect(
      canViewPhoto({ role: "RIDER", riderId: "r1", order: { ...activeOrder, assigned: false } }, target),
    ).toBe(false);
    expect(
      canViewPhoto({ role: "RIDER", riderId: "r1", order: { ...activeOrder, active: false } }, target),
    ).toBe(false);
  });
});

describeSharp("sharp decode + sanitize (needs native sharp)", () => {
  const fixture = resolve(__dirname, "fixtures/photo-valid-1x1.png");

  it("accepts a genuine PNG and keeps it tiny", async () => {
    const out = await sanitizeImage(readFileSync(fixture));
    expect(out.ext).toBe("png");
    expect(out.buffer.byteLength).toBeGreaterThan(0);
    expect(sniffImage(out.buffer)?.format).toBe("png");
  });

  it("rejects bytes that are not a real image", async () => {
    await expect(sanitizeImage(Buffer.from("not an image at all"))).rejects.toThrowError(ApiError);
  });

  it("strips EXIF: output of an EXIF-bearing JPEG carries no Exif segment", async () => {
    const sharp = (await import("sharp")).default;
    // Build a real EXIF-carrying JPEG via sharp itself, then sanitize it.
    const exifJpeg = await sharp(readFileSync(fixture))
      .withMetadata({ exif: { IFD0: { Copyright: "savora-test" } } })
      .jpeg()
      .toBuffer();
    expect(sniffImage(exifJpeg)?.hasExif).toBe(true);
    const clean = await sanitizeImage(exifJpeg);
    expect(sniffImage(clean.buffer)?.hasExif).toBe(false);
  });

  it("caps very short expiries for expired-URL checks", () => {
    const url = presignUrl({
      method: "GET",
      host: "b.s3.r.amazonaws.com",
      path: "/k",
      credentials: { accessKeyId: "a", secretAccessKey: "b" },
      region: "r",
      service: "s3",
      expiresInSeconds: 1,
    });
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("1");
  });
});

describe("logging hygiene (no secret material in messages)", () => {
  it("never includes credentials in S3 error text", async () => {
    // requireS3Config message names variables, never values.
    vi.stubEnv("S3_BUCKET", "");
    const { requireS3Config } = await import("@/server/storage/s3");
    try {
      requireS3Config();
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      // Names the missing VARIABLE names (actionable) but never key material.
      expect(message).toContain("S3_BUCKET");
      expect(message).not.toMatch(/AKIA[0-9A-Z]{16}/);
      expect(message).not.toMatch(/[A-Za-z0-9/+=]{40}/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
