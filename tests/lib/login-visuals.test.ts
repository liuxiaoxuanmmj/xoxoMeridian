import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FALLBACK_LOGIN_VISUALS,
  LoginVisualsManifestSchema,
  getLoginVisualsForTest,
  resetLoginVisualsCacheForTest,
} from "@/lib/login-visuals";

const validManifest = {
  version: 1,
  intervalMs: 8000,
  items: [
    {
      id: "login-01",
      imageUrl: "https://cdn.example.com/login/login-01.jpg",
      theme: {
        accent: "#3a5b22",
        accentHover: "#2e4a1a",
        gradientFrom: "#f5f1e9",
        gradientTo: "#dbe6cf",
        overlay: "rgba(255,255,255,0.12)",
      },
    },
  ],
};

function jsonFetch(body: unknown) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch;
}

afterEach(() => {
  resetLoginVisualsCacheForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LoginVisualsManifestSchema", () => {
  it("accepts a valid manifest and defaults intervalMs", () => {
    const result = LoginVisualsManifestSchema.parse({
      version: 1,
      items: validManifest.items,
    });

    expect(result).toEqual({
      version: 1,
      intervalMs: 7000,
      items: validManifest.items,
    });
  });

  it("rejects non-hex theme colors", () => {
    const result = LoginVisualsManifestSchema.safeParse({
      ...validManifest,
      items: [
        {
          ...validManifest.items[0],
          theme: {
            ...validManifest.items[0].theme,
            accent: "#3a5b2",
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects rgba values with out-of-range channels or alpha", () => {
    const badChannel = LoginVisualsManifestSchema.safeParse({
      ...validManifest,
      items: [
        {
          ...validManifest.items[0],
          theme: {
            ...validManifest.items[0].theme,
            overlay: "rgba(256,255,255,0.12)",
          },
        },
      ],
    });
    const badAlpha = LoginVisualsManifestSchema.safeParse({
      ...validManifest,
      items: [
        {
          ...validManifest.items[0],
          theme: {
            ...validManifest.items[0].theme,
            overlay: "rgba(255,255,255,1.1)",
          },
        },
      ],
    });

    expect(badChannel.success).toBe(false);
    expect(badAlpha.success).toBe(false);
  });
});

describe("getLoginVisualsForTest", () => {
  it("returns fallback when manifest URL is empty", async () => {
    const fetchImpl = jsonFetch(validManifest);

    await expect(
      getLoginVisualsForTest({
        manifestUrl: "",
        fetchImpl,
        ttlSeconds: 300,
      })
    ).resolves.toEqual(FALLBACK_LOGIN_VISUALS);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns fallback when fetch fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(
      getLoginVisualsForTest({
        manifestUrl: "https://cdn.example.com/login/manifest.json",
        fetchImpl,
        ttlSeconds: 300,
      })
    ).resolves.toEqual(FALLBACK_LOGIN_VISUALS);
    expect(errorSpy).toHaveBeenCalledWith(
      "[login-visuals] falling back to default visuals",
      { reason: "fetch_failed" }
    );
  });

  it("returns fallback when manifest JSON cannot be parsed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("invalid json");
      },
    })) as unknown as typeof fetch;

    await expect(
      getLoginVisualsForTest({
        manifestUrl: "https://cdn.example.com/login/manifest.json",
        fetchImpl,
        ttlSeconds: 300,
      })
    ).resolves.toEqual(FALLBACK_LOGIN_VISUALS);
    expect(errorSpy).toHaveBeenCalledWith(
      "[login-visuals] falling back to default visuals",
      { reason: "invalid_json" }
    );
  });

  it("returns fallback when manifest validation fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = jsonFetch({ ...validManifest, version: 2 });

    await expect(
      getLoginVisualsForTest({
        manifestUrl: "https://cdn.example.com/login/manifest.json",
        fetchImpl,
        ttlSeconds: 300,
      })
    ).resolves.toEqual(FALLBACK_LOGIN_VISUALS);
    expect(errorSpy).toHaveBeenCalledWith(
      "[login-visuals] falling back to default visuals",
      { reason: "validation_failed", issueCount: expect.any(Number) }
    );
  });

  it("does not cache failed fetches", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validManifest,
      }) as unknown as typeof fetch;

    const first = await getLoginVisualsForTest({
      manifestUrl: "https://cdn.example.com/login/manifest.json",
      fetchImpl,
      ttlSeconds: 60,
    });
    const second = await getLoginVisualsForTest({
      manifestUrl: "https://cdn.example.com/login/manifest.json",
      fetchImpl,
      ttlSeconds: 60,
    });

    expect(first).toEqual(FALLBACK_LOGIN_VISUALS);
    expect(second).toEqual(validManifest);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      "[login-visuals] falling back to default visuals",
      { reason: "fetch_failed", status: 500 }
    );
  });

  it("aborts slow manifest fetches and returns fallback", async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_input: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;

      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;

    const resultPromise = getLoginVisualsForTest({
      manifestUrl: "https://cdn.example.com/login/manifest.json",
      fetchImpl,
      ttlSeconds: 60,
      timeoutMs: 10,
    });

    expect(signal).toBeDefined();
    await vi.advanceTimersByTimeAsync(10);

    await expect(resultPromise).resolves.toEqual(FALLBACK_LOGIN_VISUALS);
    expect(signal?.aborted).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      "[login-visuals] falling back to default visuals",
      { reason: "timeout" }
    );
  });

  it("caches successful fetches for the configured TTL", async () => {
    let now = 1_000;
    const fetchImpl = jsonFetch(validManifest);
    const first = await getLoginVisualsForTest({
      manifestUrl: "https://cdn.example.com/login/manifest.json",
      fetchImpl,
      ttlSeconds: 60,
      nowMs: () => now,
    });

    now = 30_000;
    const second = await getLoginVisualsForTest({
      manifestUrl: "https://cdn.example.com/login/manifest.json",
      fetchImpl,
      ttlSeconds: 60,
      nowMs: () => now,
    });

    expect(first).toEqual(validManifest);
    expect(second).toEqual(validManifest);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://cdn.example.com/login/manifest.json", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });
});
