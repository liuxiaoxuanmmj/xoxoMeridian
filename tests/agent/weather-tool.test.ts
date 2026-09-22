import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { BUILT_IN_TOOL_CONTRACTS } from "@/agent/tool-contracts";
import { createWeatherTool, __testing } from "@/agent/tools/weather-tool";

const BASE_CTX = {
  taskId: "task-1",
  roomId: "room-1",
  agentId: "agent-1",
  requestedById: "u1",
  prisma: {} as never,
  tracer: {} as never,
  runtimeContext: {
    participants: [
      { userId: "u1", user: { displayName: "me", profile: { city: "Shanghai", timezone: "Asia/Shanghai" } } },
      { userId: "u2", user: { displayName: "her", profile: { city: "London", timezone: "Europe/London" } } }
    ]
  } as never
};

function mockFetchSequence(responses: Array<{ status?: number; body: unknown }>) {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i++];
    return {
      ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
      status: r.status ?? 200,
      json: async () => r.body
    } as unknown as Response;
  });
}

describe("weather.get (qweather)", () => {
  const origFetch = global.fetch;
  const origEnv = { ...process.env };

  beforeEach(() => {
    __testing.LOCATION_CACHE.clear();
    __testing.WEATHER_CACHE.clear();
    process.env.WEATHER_PROVIDER = "qweather";
    process.env.WEATHER_API_KEY = "test-key";
    process.env.QWEATHER_API_HOST = "devapi.qweather.com";
    process.env.QWEATHER_GEOAPI_HOST = "geoapi.qweather.com";
  });

  it("defaults to the requester's partner when the requester is second", async () => {
    process.env.WEATHER_PROVIDER = "mock";
    const context = {
      ...BASE_CTX,
      requestedById: "u2",
    };

    const result = (await createWeatherTool().execute({}, context)) as { city: string };

    expect(result.city).toBe("Shanghai");
  });

  it("uses the neutral fallback instead of guessing by position without a requester", async () => {
    process.env.WEATHER_PROVIDER = "mock";
    const context = {
      ...BASE_CTX,
      requestedById: null,
    };

    const result = (await createWeatherTool().execute({}, context)) as { city: string };

    expect(result.city).toBe("Beijing");
  });

  afterEach(() => {
    global.fetch = origFetch;
    process.env = { ...origEnv };
  });

  it("resolves the location and returns formatted current weather", async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: "200",
          location: [
            { id: "101010100", name: "北京", adm1: "北京市", adm2: "北京", country: "中国", tz: "Asia/Shanghai" }
          ]
        }
      },
      {
        body: {
          code: "200",
          now: {
            obsTime: "2026-05-07T10:00+08:00",
            temp: "22",
            feelsLike: "21",
            text: "多云",
            windDir: "东南风",
            windScale: "3",
            windSpeed: "12",
            humidity: "60",
            precip: "0.0",
            pressure: "1013",
            vis: "25"
          }
        }
      }
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    const tool = createWeatherTool();
    const result = (await tool.execute({ city: "北京" }, BASE_CTX)) as {
      provider: string;
      city: string;
      condition: string;
      temperatureC: number;
      humidityPercent: number;
      advice: string;
    };

    expect(result.provider).toBe("qweather");
    expect(result.city).toBe("北京");
    expect(result.condition).toBe("多云");
    expect(result.temperatureC).toBe(22);
    expect(result.humidityPercent).toBe(60);
    expect(result.advice).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const firstUrl = calls[0][0];
    expect(firstUrl).toContain("geoapi.qweather.com/v2/city/lookup");
    expect(firstUrl).toContain("location=%E5%8C%97%E4%BA%AC");
    const headers = calls[0][1].headers as Record<string, string>;
    expect(headers["X-QW-Api-Key"]).toBe("test-key");
  });

  it("reuses the location cache on a second call", async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: "200",
          location: [{ id: "101010100", name: "北京", tz: "Asia/Shanghai" }]
        }
      },
      {
        body: {
          code: "200",
          now: {
            obsTime: "t1",
            temp: "10",
            feelsLike: "9",
            text: "晴",
            windDir: "北风",
            windScale: "2",
            windSpeed: "5",
            humidity: "40",
            precip: "0",
            pressure: "1015",
            vis: "30"
          }
        }
      },
      // second call: weather cache hit expected — no fetch used
      {
        body: {
          code: "200",
          now: { obsTime: "t2", temp: "99", feelsLike: "99", text: "X", windDir: "", windScale: "", windSpeed: "", humidity: "", precip: "", pressure: "", vis: "" }
        }
      }
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    const tool = createWeatherTool();
    const first = (await tool.execute({ city: "北京" }, BASE_CTX)) as { temperatureC: number };
    const second = (await tool.execute({ city: "北京" }, BASE_CTX)) as { temperatureC: number };

    expect(first.temperatureC).toBe(10);
    expect(second.temperatureC).toBe(10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to mock when the API key is missing", async () => {
    process.env.WEATHER_API_KEY = "";
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const tool = createWeatherTool();
    const result = (await tool.execute({ city: "Shanghai" }, BASE_CTX)) as { provider: string };
    expect(result.provider).toBe("mock");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to mock with fallbackReason when the API returns an error code", async () => {
    const fetchMock = mockFetchSequence([{ body: { code: "404", location: [] } }]);
    global.fetch = fetchMock as unknown as typeof fetch;

    const tool = createWeatherTool();
    const result = (await tool.execute({ city: "NowhereXYZ" }, BASE_CTX)) as {
      provider: string;
      fallbackReason?: string;
    };
    expect(result.provider).toBe("mock");
    expect(result.fallbackReason).toMatch(/404|QWeather/);
  });

  it("fetches the 3-day forecast when includeForecast=true", async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: "200", location: [{ id: "101010100", name: "北京", tz: "Asia/Shanghai" }] } },
      {
        body: {
          code: "200",
          now: {
            obsTime: "t",
            temp: "15",
            feelsLike: "14",
            text: "多云",
            windDir: "东风",
            windScale: "2",
            windSpeed: "8",
            humidity: "50",
            precip: "0",
            pressure: "1012",
            vis: "20"
          }
        }
      },
      {
        body: {
          code: "200",
          daily: [
            { fxDate: "2026-05-07", tempMax: "18", tempMin: "10", textDay: "晴", textNight: "多云" },
            { fxDate: "2026-05-08", tempMax: "19", tempMin: "11", textDay: "阴", textNight: "阴" },
            { fxDate: "2026-05-09", tempMax: "20", tempMin: "12", textDay: "小雨", textNight: "小雨" }
          ]
        }
      }
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    const tool = createWeatherTool();
    const result = (await tool.execute({ city: "北京", includeForecast: true }, BASE_CTX)) as {
      forecast: Array<{ date: string; tempMaxC: number; textDay: string }>;
    };

    expect(result.forecast).toHaveLength(3);
    expect(result.forecast[0].textDay).toBe("晴");
    expect(result.forecast[2].tempMaxC).toBe(20);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

const NOW_WEATHER = {
  obsTime: "2026-09-22T18:48+08:00", temp: "28", feelsLike: "29", text: "阴",
  windDir: "东北风", windScale: "4", windSpeed: "23", humidity: "80", precip: "0",
  pressure: "1010", vis: "8"
};

function forecastResponse(days: number[]) {
  return {
    code: "200", updateTime: "2026-09-22T18:30+08:00",
    fxLink: "https://www.qweather.com/weather/sanya-101310201.html",
    daily: days.map((day) => ({
      fxDate: `2026-09-${day}`, tempMax: "33", tempMin: "24", textDay: "多云", textNight: "多云",
      windDirDay: "东风", windScaleDay: "3-4", precip: "2.5"
    }))
  };
}

function tripFetch(daily: unknown) {
  return mockFetchSequence([
    { body: { code: "200", location: [{ id: "101310201", name: "三亚", tz: "Asia/Shanghai" }] } },
    { body: { code: "200", now: NOW_WEATHER, updateTime: NOW_WEATHER.obsTime } },
    { body: daily }
  ]);
}

const TRIP_INPUT = { city: "三亚", startDate: "2026-09-24", endDate: "2026-09-28" };

describe("weather evidence coverage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
    vi.stubEnv("WEATHER_PROVIDER", "qweather");
    vi.stubEnv("WEATHER_API_KEY", "test-key");
    vi.stubEnv("QWEATHER_API_HOST", "devapi.qweather.com");
    vi.stubEnv("QWEATHER_GEOAPI_HOST", "geoapi.qweather.com");
    __testing.LOCATION_CACHE.clear();
    __testing.WEATHER_CACHE.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requests seven days from the query date and preserves all five trip dates with sources", async () => {
    const fetchMock = tripFetch(forecastResponse([22, 23, 24, 25, 26, 27, 28]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createWeatherTool().execute(TRIP_INPUT, BASE_CTX);

    expect(fetchMock.mock.calls).toHaveLength(3);
    expect(fetchMock.mock.calls[2]).toEqual(expect.arrayContaining([expect.stringContaining("/v7/weather/7d?")]));
    expect(result).toMatchObject({
      provider: "qweather", availability: "available", issuedAt: "2026-09-22T18:30+08:00",
      fetchedAt: "2026-09-22T12:00:00.000Z",
      source: { name: "QWeather", url: "https://www.qweather.com/weather/sanya-101310201.html" },
      coverage: {
        requestedStartDate: "2026-09-24", requestedEndDate: "2026-09-28", referenceDate: "2026-09-22",
        forecastDays: 7, missingDates: [],
        availableDates: ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"]
      },
      forecast: expect.arrayContaining([expect.objectContaining({ date: "2026-09-28", tempMaxC: 33, tempMinC: 24,
        textDay: "多云", textNight: "多云", precipitationMm: 2.5,
        wind: { direction: "东风", scale: "3-4" } })])
    });
  });

  it("reports missing target dates instead of counting unrelated forecast dates as coverage", async () => {
    vi.stubGlobal("fetch", tripFetch(forecastResponse([22, 23, 24])));
    const result = await createWeatherTool().execute(TRIP_INPUT, BASE_CTX);
    expect(result).toMatchObject({
      availability: "partial",
      coverage: { missingDates: ["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"] }
    });
  });

  it("retains real current weather and marks missing forecast when the seven-day endpoint rejects access", async () => {
    vi.stubGlobal("fetch", tripFetch({ code: "403" }));
    const result = await createWeatherTool().execute(TRIP_INPUT, BASE_CTX);
    expect(result).toMatchObject({
      provider: "qweather", availability: "partial", temperatureC: 28,
      fallbackReason: expect.stringContaining("403"),
      coverage: { missingDates: ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"] }
    });
  });

  it("bounds the endpoint at seven days and exposes later dates as missing", async () => {
    const fetchMock = tripFetch(forecastResponse([22, 23, 24, 25, 26, 27, 28]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createWeatherTool().execute({ ...TRIP_INPUT, endDate: "2026-09-30" }, BASE_CTX);
    expect(fetchMock.mock.calls[2]).toEqual(expect.arrayContaining([expect.stringContaining("/v7/weather/7d?")]));
    expect(result).toMatchObject({ availability: "partial", coverage: { missingDates: ["2026-09-29", "2026-09-30"] } });
  });

  it("uses the destination date when UTC is still the previous day", async () => {
    vi.setSystemTime(new Date("2026-09-21T23:30:00Z"));
    const fetchMock = tripFetch(forecastResponse([22, 23, 24]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createWeatherTool().execute({ ...TRIP_INPUT, endDate: "2026-09-24" }, BASE_CTX);
    expect(fetchMock.mock.calls[2]).toEqual(expect.arrayContaining([expect.stringContaining("/v7/weather/3d?")]));
    expect(result).toMatchObject({ coverage: { referenceDate: "2026-09-22", forecastDays: 3 } });
  });

  it("keeps fetchedAt on cache hits and re-evaluates the requested coverage", async () => {
    const fetchMock = tripFetch(forecastResponse([22, 23, 24, 25, 26, 27, 28]));
    vi.stubGlobal("fetch", fetchMock);
    const tool = createWeatherTool();
    await tool.execute(TRIP_INPUT, BASE_CTX);
    vi.advanceTimersByTime(1000);
    const result = await tool.execute({ ...TRIP_INPUT, endDate: "2026-09-30" }, BASE_CTX);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ fetchedAt: "2026-09-22T12:00:00.000Z", coverage: { missingDates: ["2026-09-29", "2026-09-30"] } });
  });

  it("returns unavailable without fabricated temperatures when configuration is missing", async () => {
    vi.stubEnv("WEATHER_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await createWeatherTool().execute(TRIP_INPUT, BASE_CTX);
    expect(result).toMatchObject({ provider: "mock", availability: "unavailable", condition: "未知", coverage: {
      availableDates: [], missingDates: ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"]
    } });
    expect(result).not.toHaveProperty("temperatureC");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the persisted task reference time after the host clock advances", async () => {
    vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
    const fetchMock = tripFetch(forecastResponse([22, 23, 24]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createWeatherTool().execute({ ...TRIP_INPUT, endDate: "2026-09-24" }, {
      ...BASE_CTX, referenceTime: "2026-09-22T12:00:00Z"
    });
    expect(result).toMatchObject({ fetchedAt: "2026-09-23T12:00:00.000Z", coverage: { referenceDate: "2026-09-22", forecastDays: 3 } });
  });

  it("keeps evidence metadata through the registry output contract", async () => {
    vi.stubGlobal("fetch", tripFetch(forecastResponse([22, 23, 24, 25, 26, 27, 28])));
    const result = await createWeatherTool().execute(TRIP_INPUT, BASE_CTX);
    expect(BUILT_IN_TOOL_CONTRACTS["weather.get"].outputSchema.parse(result)).toEqual(result);
  });

  it("does not substitute mock data when cancellation interrupts the forecast", async () => {
    const controller = new AbortController();
    const fetchMock = tripFetch(forecastResponse([22, 23, 24]));
    const guardedFetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
      if (String(args[0]).includes("/weather/7d")) {
        controller.abort(new Error("task cancelled"));
        throw controller.signal.reason;
      }
      return Reflect.apply(fetchMock, undefined, args);
    });
    vi.stubGlobal("fetch", guardedFetch);
    await expect(createWeatherTool().execute(TRIP_INPUT, { ...BASE_CTX, signal: controller.signal })).rejects.toThrow("task cancelled");
  });

  it.each([
    { startDate: "2026-02-30", endDate: "2026-03-01" },
    { startDate: "2026-09-28", endDate: "2026-09-24" },
    { startDate: "2026-09-24" },
    { startDate: "2026-09-01", endDate: "2026-10-31" }
  ])("rejects invalid or unbounded date windows before network access: %j", async (range) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createWeatherTool().execute({ city: "三亚", ...range }, BASE_CTX)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
