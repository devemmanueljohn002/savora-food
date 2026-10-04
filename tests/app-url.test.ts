import { afterEach, describe, expect, it, vi } from "vitest";

// getEnv() caches on first read, so each case re-imports a fresh module with
// its own stubbed environment.
async function freshEnv(env: Record<string, string | undefined>) {
  vi.resetModules();
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const mod = await import("@/server/env");
  return {
    getEnv: mod.getEnv,
    restore() {
      for (const key of Object.keys(env)) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key] as string;
      }
      vi.resetModules();
    },
  };
}

const BASE = {
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  JWT_SECRET: "test-secret-for-app-url",
};

describe("APP_URL (base URL for outgoing email links)", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("throws a clear error when APP_URL is not set (no silent localhost links)", async () => {
    const ctx = await freshEnv({ ...BASE, APP_URL: undefined });
    try {
      expect(() => ctx.getEnv()).toThrowError("APP_URL is not set");
    } finally {
      ctx.restore();
    }
  });

  it("strips trailing slashes so links never double-slash", async () => {
    const ctx = await freshEnv({ ...BASE, APP_URL: "https://app.savora.food///" });
    try {
      expect(ctx.getEnv().appUrl).toBe("https://app.savora.food");
    } finally {
      ctx.restore();
    }
  });

  it("warns when production APP_URL is not https", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    const ctx = await freshEnv({ ...BASE, APP_URL: "http://app.savora.food" });
    try {
      expect(ctx.getEnv().appUrl).toBe("http://app.savora.food");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("must be https"));
    } finally {
      ctx.restore();
      vi.unstubAllEnvs();
      warn.mockRestore();
    }
  });

  it("stays quiet for https in production", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    const ctx = await freshEnv({ ...BASE, APP_URL: "https://app.savora.food" });
    try {
      expect(ctx.getEnv().appUrl).toBe("https://app.savora.food");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      ctx.restore();
      vi.unstubAllEnvs();
      warn.mockRestore();
    }
  });
});
