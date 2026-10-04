import { randomUUID } from "node:crypto";
import { ApiError } from "../errors";
import { db } from "../db";
import {
  deleteObject,
  getObjectBuffer,
  headObject,
  presignedGetUrl,
  putObjectBuffer,
  requireS3Config,
  type S3Config,
} from "./s3";
import { createPresignedPost } from "./sigv4";

/**
 * Vendor profile-photo service. Recognition/profile image ONLY — never
 * described as "verified", never compared to government ID photos.
 *
 * Flow: presigned POST → browser uploads to staging/ → finalize validates
 * (HEAD + genuine-decodable-image check + sharp re-encode with EXIF strip) →
 * sanitized copy written to vendors/{id}/profile/ → DB stores the key only.
 */

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIN_BYTES = 1;
export const PHOTO_UPLOAD_EXPIRY_SECONDS = 300;
export const PHOTO_VIEW_EXPIRY_SECONDS = 300;
export const PHOTO_MAX_DIMENSION = 1024;

const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type PhotoMime = keyof typeof MIME_TO_EXT;
export type PhotoExt = (typeof MIME_TO_EXT)[PhotoMime];

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Declared upload attributes. Throws before any S3/paid work on bad input. */
export function validateUploadDeclaration(
  contentType: unknown,
  sizeBytes: unknown,
): { contentType: PhotoMime; sizeBytes: number } {
  if (typeof contentType !== "string" || !(contentType in MIME_TO_EXT)) {
    throw ApiError.validation("Only JPEG, PNG or WebP images are allowed.");
  }
  if (typeof sizeBytes !== "number" || !Number.isInteger(sizeBytes) || sizeBytes < 1) {
    throw ApiError.validation("Invalid file size.");
  }
  if (sizeBytes > PHOTO_MAX_BYTES) {
    throw ApiError.validation("Image must be 5 MB or smaller.");
  }
  return { contentType: contentType as PhotoMime, sizeBytes };
}

export function extensionForMime(mime: PhotoMime): PhotoExt {
  return MIME_TO_EXT[mime];
}

/** Server-generated keys only — the client filename never appears anywhere. */
export function stagingKeyFor(vendorId: string, photoUuid: string, ext: PhotoExt): string {
  return `staging/${vendorId}/${photoUuid}.${ext}`;
}

export function finalKeyFor(vendorId: string, photoUuid: string, ext: PhotoExt): string {
  return `vendors/${vendorId}/profile/${photoUuid}.${ext}`;
}

export function newPhotoUuid(): string {
  return randomUUID();
}

const STAGING_KEY_RE = new RegExp(`^staging\\/(${UUID_RE})\\/(${UUID_RE})\\.(jpg|png|webp)$`);

export function parseStagingKey(key: unknown): { vendorId: string; uuid: string; ext: PhotoExt } | null {
  if (typeof key !== "string") return null;
  const match = STAGING_KEY_RE.exec(key);
  if (!match) return null;
  return { vendorId: match[1], uuid: match[2], ext: match[3] as PhotoExt };
}

/**
 * Cleanup guard: destructive deletes only ever run under the vendor's own
 * prefixes, so a bug or confused input can never erase another key.
 */
export function isKeyUnderVendorPrefix(key: string, vendorId: string): boolean {
  return key.startsWith(`staging/${vendorId}/`) || key.startsWith(`vendors/${vendorId}/`);
}

// ── Pure image sniffing (magic bytes + dimensions, zero dependencies) ───────

export type SniffedImage = {
  format: "jpg" | "png" | "webp";
  width: number;
  height: number;
  /** JPEG APP1 Exif segment or WebP EXIF chunk present. */
  hasExif: boolean;
};

function readU16BE(buffer: Buffer, offset: number): number {
  return buffer.readUInt16BE(offset);
}

function sniffPng(buffer: Buffer): SniffedImage | null {
  // 8-byte signature, then IHDR chunk: length(4) type(4) width(4) height(4).
  if (buffer.byteLength < 24) return null;
  if (buffer.readUInt32BE(8) !== 13 || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0 || width > 100000 || height > 100000) return null;
  return { format: "png", width, height, hasExif: false };
}

function sniffJpeg(buffer: Buffer): SniffedImage | null {
  if (buffer.byteLength < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  let hasExif = false;
  // Walk segments: FF marker, 2-byte length; SOF0/1/2 hold dimensions.
  while (offset + 4 <= buffer.byteLength) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > buffer.byteLength) return null;
    const length = readU16BE(buffer, offset + 2);
    if (length < 2 || offset + 2 + length > buffer.byteLength) return null;
    if (marker === 0xe1 && buffer.toString("ascii", offset + 4, offset + 10) === "Exif\0\0") {
      hasExif = true;
    }
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 7) return null;
      const height = readU16BE(buffer, offset + 5);
      const width = readU16BE(buffer, offset + 7);
      if (width === 0 || height === 0) return null;
      return { format: "jpg", width, height, hasExif };
    }
    // SOS (start of scan): entropy data follows; no SOF found before it.
    if (marker === 0xda) return null;
    offset += 2 + length;
  }
  return null;
}

function sniffWebp(buffer: Buffer): SniffedImage | null {
  // RIFF....WEBP, then chunks: VP8_ (lossy), VP8L (lossless), VP8X (extended).
  if (buffer.byteLength < 12) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  let offset = 12;
  let hasExif = false;
  while (offset + 8 <= buffer.byteLength) {
    const fourcc = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (dataStart > buffer.byteLength) return null;
    if (fourcc === "VP8 ") {
      if (dataStart + 10 > buffer.byteLength) return null;
      // Frame tag (3 bytes) + start code 9D 012A + 14-bit width/height.
      if (buffer[dataStart + 3] !== 0x9d || buffer[dataStart + 4] !== 0x01 || buffer[dataStart + 5] !== 0x2a) {
        return null;
      }
      const width = buffer.readUInt16LE(dataStart + 6) & 0x3fff;
      const height = buffer.readUInt16LE(dataStart + 8) & 0x3fff;
      if (width === 0 || height === 0) return null;
      return { format: "webp", width, height, hasExif };
    }
    if (fourcc === "VP8L") {
      if (dataStart + 5 > buffer.byteLength || buffer[dataStart] !== 0x2f) return null;
      const bits = buffer.readUInt32LE(dataStart + 1);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return { format: "webp", width, height, hasExif };
    }
    if (fourcc === "VP8X") {
      if (dataStart + 10 > buffer.byteLength) return null;
      const width = buffer.readUIntLE(dataStart + 4, 3) + 1;
      const height = buffer.readUIntLE(dataStart + 7, 3) + 1;
      if (width === 0 || height === 0) return null;
      return { format: "webp", width, height, hasExif };
    }
    if (fourcc === "EXIF") hasExif = true;
    offset = dataStart + size + (size % 2);
  }
  return null;
}

/** Fast genuine-image pre-check. The authoritative check is sharp decode (failOnError). */
export function sniffImage(buffer: Buffer): SniffedImage | null {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 12) return null;
  return sniffPng(buffer) ?? sniffJpeg(buffer) ?? sniffWebp(buffer) ?? null;
}

// ── Sharp sanitization (lazy: sharp is unavailable on some dev machines) ─────

export type SanitizedImage = { buffer: Buffer; ext: PhotoExt };

/**
 * Authoritative validation + sanitization: sharp must genuinely decode the
 * file (rejects malformed files disguised as images), EXIF orientation is
 * applied via .rotate(), output is resized inside 1024px and re-encoded
 * WITHOUT metadata — so EXIF/GPS cannot survive. sharp strips metadata by
 * default; only .withMetadata() would preserve it, which we never call.
 */
export async function sanitizeImage(buffer: Buffer): Promise<SanitizedImage> {
  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default;
  } catch {
    throw ApiError.internal(
      "Image processing is unavailable on this server. The photo cannot be validated right now — try again later.",
    );
  }
  let pipeline: import("sharp").Sharp;
  try {
    pipeline = sharp(buffer, { failOnError: true }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
      throw ApiError.validation("Only JPEG, PNG or WebP images are allowed.");
    }
    const ext: PhotoExt = meta.format === "png" ? "png" : meta.format === "webp" ? "webp" : "jpg";
    const out = await pipeline
      .resize({ width: PHOTO_MAX_DIMENSION, height: PHOTO_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .toFormat(meta.format, meta.format === "jpeg" ? { quality: 82 } : {})
      .toBuffer();
    return { buffer: out, ext };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.validation("That file is not a valid image. Upload a real JPEG, PNG or WebP photo.");
  }
}

// ── View authorization (pure decision table; DB lookups happen in routes) ────

export type PhotoViewer =
  | { role: "VENDOR"; vendorId: string }
  | { role: "ADMIN" }
  | { role: "RIDER"; riderId: string; order: { vendorId: string; assigned: boolean; active: boolean } | null };

/** Matrix: vendor→own only, admin→yes, assigned rider on active order→yes, everything else→no. */
export function canViewPhoto(viewer: PhotoViewer, targetVendorId: string): boolean {
  switch (viewer.role) {
    case "VENDOR":
      return viewer.vendorId === targetVendorId;
    case "ADMIN":
      return true;
    case "RIDER": {
      const order = viewer.order;
      return (
        order !== null &&
        order.vendorId === targetVendorId &&
        order.assigned === true &&
        order.active === true
      );
    }
  }
}

// ── DB helpers ───────────────────────────────────────────────────────────────

export async function getVendorPhotoKey(vendorId: string): Promise<string | null> {
  const rows = await db()<{ profile_photo_key: string | null }[]>`
    SELECT profile_photo_key FROM vendors WHERE id = ${vendorId} LIMIT 1
  `;
  return rows[0]?.profile_photo_key ?? null;
}

export async function recordPhotoCleanup(vendorId: string, key: string, reason: string): Promise<void> {
  await db()`
    INSERT INTO vendor_photo_cleanups (vendor_id, s3_key, reason)
    VALUES (${vendorId}, ${key}, ${reason})
  `;
}

// ── Finalize orchestration ───────────────────────────────────────────────────

export type FinalizeResult = { profilePhotoKey: string; replaced: boolean };

/**
 * Validate-and-promote a staged upload. Order of operations (each step gated
 * on the previous): prefix check → HEAD → download → sniff → sharp
 * sanitize → PUT final → DB update → delete staging → delete old photo.
 * The DB row is only ever pointed at a validated, sanitized object.
 */
export async function finalizeVendorPhoto(input: {
  vendorId: string;
  stagingKey: string;
  config?: S3Config;
}): Promise<FinalizeResult> {
  const parsed = parseStagingKey(input.stagingKey);
  if (!parsed || parsed.vendorId !== input.vendorId) {
    // Covers: wrong shape, path traversal, ext mismatch, another vendor's key.
    throw ApiError.validation("Invalid upload reference. Start the upload again.");
  }
  const config = input.config ?? requireS3Config();

  const head = await headObject(config, input.stagingKey).catch((error: unknown) => {
    throw ApiError.internal(error instanceof Error ? error.message : "Storage lookup failed.");
  });
  if (!head.exists) {
    throw ApiError.validation("Upload not found or expired. Start the upload again.");
  }
  if (!head.sizeBytes || head.sizeBytes > PHOTO_MAX_BYTES) {
    await deleteObject(config, input.stagingKey).catch(() => undefined);
    throw ApiError.validation("Image must be 5 MB or smaller.");
  }
  if (head.contentType && head.contentType !== mimeForExt(parsed.ext)) {
    await deleteObject(config, input.stagingKey).catch(() => undefined);
    throw ApiError.validation("Uploaded file type does not match. Start the upload again.");
  }

  const staged = await getObjectBuffer(config, input.stagingKey).catch((error: unknown) => {
    if ((error as { code?: string }).code === "S3_NOT_FOUND") {
      throw ApiError.validation("Upload not found or expired. Start the upload again.");
    }
    throw ApiError.internal(error instanceof Error ? error.message : "Storage download failed.");
  });
  const sniffed = sniffImage(staged.buffer);
  if (!sniffed || sniffed.format !== parsed.ext) {
    await deleteObject(config, input.stagingKey).catch(() => undefined);
    throw ApiError.validation("That file is not a valid image. Upload a real JPEG, PNG or WebP photo.");
  }

  const sanitized = await sanitizeImage(staged.buffer);
  const finalKey = finalKeyFor(input.vendorId, newPhotoUuid(), sanitized.ext);
  await putObjectBuffer(config, finalKey, sanitized.buffer, mimeForExt(sanitized.ext)).catch(
    (error: unknown) => {
      throw ApiError.internal(error instanceof Error ? error.message : "Storage write failed.");
    },
  );

  // Swap the DB reference under a row lock so two concurrent finalizes cannot
  // orphan each other. On failure the new object is removed (prefix-guarded)
  // or recorded; never left unmanaged silently.
  let previousKey: string | null = null;
  try {
    previousKey = await db().begin(async (tx) => {
      const locked = await tx<{ profile_photo_key: string | null }[]>`
        SELECT profile_photo_key FROM vendors WHERE id = ${input.vendorId} FOR UPDATE
      `;
      await tx`UPDATE vendors SET profile_photo_key = ${finalKey}, updated_at = NOW() WHERE id = ${input.vendorId}`;
      return locked[0]?.profile_photo_key ?? null;
    });
  } catch (error) {
    if (isKeyUnderVendorPrefix(finalKey, input.vendorId)) {
      await deleteObject(config, finalKey).catch(async () => {
        await recordPhotoCleanup(input.vendorId, finalKey, "db_update_failed_delete_failed").catch(() => undefined);
      });
    }
    throw ApiError.internal(error instanceof Error ? error.message : "Could not save the photo.");
  }

  // New reference is live: staging object is now garbage.
  await deleteObject(config, input.stagingKey).catch(async () => {
    await recordPhotoCleanup(input.vendorId, input.stagingKey, "staging_delete_failed").catch(() => undefined);
  });

  // Old photo goes last — a failed delete must never invalidate the new one.
  let replaced = false;
  if (previousKey && previousKey !== finalKey && isKeyUnderVendorPrefix(previousKey, input.vendorId)) {
    replaced = true;
    await deleteObject(config, previousKey).catch(async () => {
      await recordPhotoCleanup(input.vendorId, previousKey as string, "old_photo_delete_failed").catch(
        () => undefined,
      );
    });
  }

  return { profilePhotoKey: finalKey, replaced };
}

function mimeForExt(ext: PhotoExt): PhotoMime {
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

/** Short-lived view URL after the route has authorized the requester. */
export function viewUrlFor(config: S3Config, key: string): { url: string; expiresAt: string } {
  const url = presignedGetUrl(config, key, PHOTO_VIEW_EXPIRY_SECONDS);
  return { url, expiresAt: new Date(Date.now() + PHOTO_VIEW_EXPIRY_SECONDS * 1000).toISOString() };
}

/** Presigned POST for the browser upload step. */
export function uploadPostFor(
  config: S3Config,
  vendorId: string,
  contentType: PhotoMime,
): { url: string; fields: Record<string, string>; key: string; expiresAt: string; maxBytes: number } {
  const key = stagingKeyFor(vendorId, newPhotoUuid(), extensionForMime(contentType));
  const post = createPresignedPost({
    bucket: config.bucket,
    region: config.region,
    key,
    contentType,
    minBytes: PHOTO_MIN_BYTES,
    maxBytes: PHOTO_MAX_BYTES,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    expiresInSeconds: PHOTO_UPLOAD_EXPIRY_SECONDS,
  });
  return { url: post.url, fields: post.fields, key, expiresAt: post.expiresAt, maxBytes: PHOTO_MAX_BYTES };
}
