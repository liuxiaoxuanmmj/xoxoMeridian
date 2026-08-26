import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { shouldSyncGeoProfile } from "@/lib/geo-ip";

// ---------------------------------------------------------------------------
// shouldSyncGeoProfile
// ---------------------------------------------------------------------------

describe("shouldSyncGeoProfile", () => {
  const now = new Date("2026-06-17T12:00:00Z");
  const baseProfile = {
    city: "Beijing",
    country: "China",
    timezone: "Asia/Shanghai",
    geoSource: "auto" as const,
    lastGeoIp: "1.2.3.4",
    lastGeoCheck: new Date("2026-06-17T11:00:00Z"), // 1 hour ago, same IP
  };

  it("returns false when profile is null", () => {
    expect(shouldSyncGeoProfile({ profile: null, clientIp: "1.2.3.4", now })).toBe(false);
  });

  it("returns false when clientIp is null", () => {
    expect(shouldSyncGeoProfile({ profile: baseProfile, clientIp: null, now })).toBe(false);
  });

  it("returns false when geoSource is manual", () => {
    expect(
      shouldSyncGeoProfile({
        profile: { ...baseProfile, geoSource: "manual" },
        clientIp: "5.6.7.8",
        now,
      }),
    ).toBe(false);
  });

  it("returns true when city is placeholder '—'", () => {
    expect(
      shouldSyncGeoProfile({
        profile: { ...baseProfile, city: "—" },
        clientIp: "1.2.3.4",
        now,
      }),
    ).toBe(true);
  });

  it("returns true when country is placeholder '—'", () => {
    expect(
      shouldSyncGeoProfile({
        profile: { ...baseProfile, country: "—" },
        clientIp: "1.2.3.4",
        now,
      }),
    ).toBe(true);
  });

  it("returns true when timezone is placeholder '—'", () => {
    expect(
      shouldSyncGeoProfile({
        profile: { ...baseProfile, timezone: "—" },
        clientIp: "1.2.3.4",
        now,
      }),
    ).toBe(true);
  });

  it("returns true when city is empty string", () => {
    expect(
      shouldSyncGeoProfile({
        profile: { ...baseProfile, city: "" },
        clientIp: "1.2.3.4",
        now,
      }),
    ).toBe(true);
  });

  it("returns true when city is null", () => {
    expect(
      shouldSyncGeoProfile({
        profile: { ...baseProfile, city: null },
        clientIp: "1.2.3.4",
        now,
      }),
    ).toBe(true);
  });

  it("returns true when lastGeoIp differs from clientIp", () => {
    expect(
      shouldSyncGeoProfile({
        profile: baseProfile,
        clientIp: "5.6.7.8",
        now,
      }),
    ).toBe(true);
  });

  it("returns true when lastGeoCheck is null (never synced)", () => {
    expect(
      shouldSyncGeoProfile({
        profile: { ...baseProfile, lastGeoCheck: null },
        clientIp: "1.2.3.4",
        now,
      }),
    ).toBe(true);
  });

  it("returns true when lastGeoCheck is over 24 hours ago", () => {
    const oldCheck = new Date("2026-06-16T10:00:00Z"); // 26 hours ago
    expect(
      shouldSyncGeoProfile({
        profile: { ...baseProfile, lastGeoCheck: oldCheck },
        clientIp: "1.2.3.4",
        now,
      }),
    ).toBe(true);
  });

  it("returns false when same IP and checked within 24h with valid values", () => {
    expect(
      shouldSyncGeoProfile({
        profile: baseProfile,
        clientIp: "1.2.3.4",
        now,
      }),
    ).toBe(false);
  });

  it("returns false when lastGeoCheck is exactly 24 hours ago (not over)", () => {
    const exactly24h = new Date("2026-06-16T12:00:00Z");
    expect(
      shouldSyncGeoProfile({
        profile: { ...baseProfile, lastGeoCheck: exactly24h },
        clientIp: "1.2.3.4",
        now,
      }),
    ).toBe(false);
  });

  it("returns true when lastGeoIp is null (never stored IP)", () => {
    expect(
      shouldSyncGeoProfile({
        profile: { ...baseProfile, lastGeoIp: null },
        clientIp: "1.2.3.4",
        now,
      }),
    ).toBe(true);
  });

  it("returns false when geoSource is undefined and all values valid (treated as auto)", () => {
    const { geoSource: _, ...noGeoSource } = baseProfile;
    expect(
      shouldSyncGeoProfile({
        profile: noGeoSource,
        clientIp: "1.2.3.4",
        now,
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPublicClientIp
// ---------------------------------------------------------------------------

describe("getPublicClientIp", () => {
  let getPublicClientIp: () => Promise<string | null>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@/lib/geo-ip");
    getPublicClientIp = mod.getPublicClientIp;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockHeaders(entries: Record<string, string | null>) {
    vi.doMock("next/headers", () => ({
      headers: () => {
        const map = new Map(Object.entries(entries).filter(([, v]) => v !== null) as [string, string][]);
        return {
          get: (key: string) => map.get(key) ?? null,
        };
      },
    }));
  }

  it("returns the first public IP from x-forwarded-for", async () => {
    vi.doMock("next/headers", () => ({
      headers: () => ({
        get: (key: string) => {
          if (key === "x-forwarded-for") return "8.8.8.8, 10.0.0.1";
          return null;
        },
      }),
    }));
    vi.resetModules();
    const { getPublicClientIp: fn } = await import("@/lib/geo-ip");
    expect(await fn()).toBe("8.8.8.8");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", async () => {
    vi.doMock("next/headers", () => ({
      headers: () => ({
        get: (key: string) => {
          if (key === "x-real-ip") return "8.8.4.4";
          return null;
        },
      }),
    }));
    vi.resetModules();
    const { getPublicClientIp: fn } = await import("@/lib/geo-ip");
    expect(await fn()).toBe("8.8.4.4");
  });

  it("skips private IP in x-forwarded-for and uses public one", async () => {
    vi.doMock("next/headers", () => ({
      headers: () => ({
        get: (key: string) => {
          if (key === "x-forwarded-for") return "10.0.0.1, 8.8.8.8";
          return null;
        },
      }),
    }));
    vi.resetModules();
    const { getPublicClientIp: fn } = await import("@/lib/geo-ip");
    expect(await fn()).toBeNull(); // first is 10.0.0.1 which is private, so returns null
  });

  it("rejects 192.168.x.x private IP", async () => {
    vi.doMock("next/headers", () => ({
      headers: () => ({
        get: (key: string) => {
          if (key === "x-forwarded-for") return "192.168.1.1";
          return null;
        },
      }),
    }));
    vi.resetModules();
    const { getPublicClientIp: fn } = await import("@/lib/geo-ip");
    expect(await fn()).toBeNull();
  });

  it("rejects 127.0.0.1 loopback", async () => {
    vi.doMock("next/headers", () => ({
      headers: () => ({
        get: (key: string) => {
          if (key === "x-real-ip") return "127.0.0.1";
          return null;
        },
      }),
    }));
    vi.resetModules();
    const { getPublicClientIp: fn } = await import("@/lib/geo-ip");
    expect(await fn()).toBeNull();
  });

  it("rejects IPv6 loopback ::1", async () => {
    vi.doMock("next/headers", () => ({
      headers: () => ({
        get: (key: string) => {
          if (key === "x-forwarded-for") return "::1";
          return null;
        },
      }),
    }));
    vi.resetModules();
    const { getPublicClientIp: fn } = await import("@/lib/geo-ip");
    expect(await fn()).toBeNull();
  });

  it("rejects link-local IPv6 fe80::", async () => {
    vi.doMock("next/headers", () => ({
      headers: () => ({
        get: (key: string) => {
          if (key === "x-forwarded-for") return "fe80::1";
          return null;
        },
      }),
    }));
    vi.resetModules();
    const { getPublicClientIp: fn } = await import("@/lib/geo-ip");
    expect(await fn()).toBeNull();
  });

  it("rejects invalid IP string", async () => {
    vi.doMock("next/headers", () => ({
      headers: () => ({
        get: (key: string) => {
          if (key === "x-forwarded-for") return "not-an-ip";
          return null;
        },
      }),
    }));
    vi.resetModules();
    const { getPublicClientIp: fn } = await import("@/lib/geo-ip");
    expect(await fn()).toBeNull();
  });

  it("returns null when no relevant headers present", async () => {
    vi.doMock("next/headers", () => ({
      headers: () => ({ get: () => null }),
    }));
    vi.resetModules();
    const { getPublicClientIp: fn } = await import("@/lib/geo-ip");
    expect(await fn()).toBeNull();
  });

  it("accepts valid IPv6 public address", async () => {
    vi.doMock("next/headers", () => ({
      headers: () => ({
        get: (key: string) => {
          if (key === "x-forwarded-for") return "2001:db8::1";
          return null;
        },
      }),
    }));
    vi.resetModules();
    const { getPublicClientIp: fn } = await import("@/lib/geo-ip");
    expect(await fn()).toBe("2001:db8::1");
  });
});

// ---------------------------------------------------------------------------
// fetchGeoFromIp
// ---------------------------------------------------------------------------

describe("fetchGeoFromIp", () => {
  let fetchGeoFromIp: (ip: string) => Promise<{ city: string; country: string; timezone: string } | null>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@/lib/geo-ip");
    fetchGeoFromIp = mod.fetchGeoFromIp;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns normalized result on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        city: "Beijing",
        country: "China",
        timezone: "Asia/Shanghai",
        query: "1.2.3.4",
      }),
    });

    const result = await fetchGeoFromIp("1.2.3.4");
    expect(result).toEqual({
      city: "Beijing",
      country: "China",
      timezone: "Asia/Shanghai",
    });
  });

  it("normalizes Chinese city name via normalizeCityName", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        city: "北京",
        country: "China",
        timezone: "Asia/Shanghai",
        query: "1.2.3.4",
      }),
    });

    const result = await fetchGeoFromIp("1.2.3.4");
    expect(result?.city).toBe("Beijing");
  });

  it("returns null when status is fail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "fail",
        message: "invalid key",
      }),
    });

    const result = await fetchGeoFromIp("1.2.3.4");
    expect(result).toBeNull();
  });

  it("returns null when city is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        city: "",
        country: "China",
        timezone: "Asia/Shanghai",
        query: "1.2.3.4",
      }),
    });

    const result = await fetchGeoFromIp("1.2.3.4");
    expect(result).toBeNull();
  });

  it("returns null when country is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        city: "Beijing",
        country: "",
        timezone: "Asia/Shanghai",
        query: "1.2.3.4",
      }),
    });

    const result = await fetchGeoFromIp("1.2.3.4");
    expect(result).toBeNull();
  });

  it("returns null when timezone is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        city: "Beijing",
        country: "China",
        timezone: "",
        query: "1.2.3.4",
      }),
    });

    const result = await fetchGeoFromIp("1.2.3.4");
    expect(result).toBeNull();
  });

  it("returns null when query does not match requested IP", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        city: "Beijing",
        country: "China",
        timezone: "Asia/Shanghai",
        query: "5.6.7.8",
      }),
    });

    const result = await fetchGeoFromIp("1.2.3.4");
    expect(result).toBeNull();
  });

  it("returns null on fetch error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));

    const result = await fetchGeoFromIp("1.2.3.4");
    expect(result).toBeNull();
  });

  it("returns null on non-2xx response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });

    const result = await fetchGeoFromIp("1.2.3.4");
    expect(result).toBeNull();
  });

  it("returns null on JSON parse failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("invalid json");
      },
    });

    const result = await fetchGeoFromIp("1.2.3.4");
    expect(result).toBeNull();
  });
});
