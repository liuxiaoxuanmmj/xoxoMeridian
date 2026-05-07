import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createWeatherTool, __testing } from "@/agent/tools/weather-tool";

const BASE_CTX = {
  taskId: "task-1",
  roomId: "room-1",
  agentId: "agent-1",
  requestedById: "user-1",
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
