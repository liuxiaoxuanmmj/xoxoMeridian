import type { AgentTool, ToolExecutionContext } from "@/agent/types";

type WeatherInput = {
  city?: string;
  includeForecast?: boolean;
};

type CacheEntry<T> = { value: T; expiresAt: number };

const LOCATION_CACHE = new Map<string, CacheEntry<QWeatherLocation>>();
const WEATHER_CACHE = new Map<string, CacheEntry<QWeatherSnapshot>>();

const LOCATION_TTL_MS = 24 * 60 * 60 * 1000;
const WEATHER_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

function evictOldest<K, V>(map: Map<K, CacheEntry<V>>, max: number) {
  if (map.size <= max) return;
  const oldest = map.keys().next().value;
  if (oldest !== undefined) map.delete(oldest);
}

const FETCH_TIMEOUT_MS = 8000;

type QWeatherLocation = {
  id: string;
  name: string;
  adm1?: string;
  adm2?: string;
  country?: string;
  tz?: string;
  lat?: string;
  lon?: string;
};

type QWeatherNow = {
  obsTime: string;
  temp: string;
  feelsLike: string;
  text: string;
  windDir: string;
  windScale: string;
  windSpeed: string;
  humidity: string;
  precip: string;
  pressure: string;
  vis: string;
  cloud?: string;
  icon?: string;
};

type QWeatherDaily = {
  fxDate: string;
  tempMax: string;
  tempMin: string;
  textDay: string;
  textNight: string;
  windDirDay?: string;
  windScaleDay?: string;
  humidity?: string;
  precip?: string;
  uvIndex?: string;
};

type QWeatherSnapshot = {
  location: QWeatherLocation;
  now: QWeatherNow;
  daily?: QWeatherDaily[];
};

type WeatherSnapshotResult = ReturnType<typeof formatSnapshot> | ReturnType<typeof mockWeather>;

export async function fetchWeatherSnapshot(
  cityInput: string,
  includeForecast = false
): Promise<WeatherSnapshotResult> {
  const city = cityInput.trim();
  if (!city) throw new Error("city is required.");

  const provider = process.env.WEATHER_PROVIDER ?? "mock";
  const apiKey = process.env.WEATHER_API_KEY ?? "";

  if (provider !== "qweather") {
    console.warn(
      `[weather.get] using mock — WEATHER_PROVIDER="${provider}" (need "qweather")`
    );
    return mockWeather(city, `WEATHER_PROVIDER=${provider}`);
  }
  if (!apiKey) {
    console.warn("[weather.get] using mock — WEATHER_API_KEY is empty");
    return mockWeather(city, "WEATHER_API_KEY missing");
  }

  try {
    return await getQWeather(city, includeForecast, apiKey);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[weather.get] qweather call failed, falling back to mock: ${reason}`);
    return mockWeather(city, reason);
  }
}

export function createWeatherTool(): AgentTool<WeatherInput> {
  return {
    name: "weather.get",
    description:
      "Get current weather (and optional 3-day forecast) via QWeather. Falls back to a mock when WEATHER_PROVIDER is not 'qweather' or credentials are missing.",
    schema: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "City name in Chinese or English. Defaults to the partner participant's city."
        },
        includeForecast: {
          type: "boolean",
          description: "When true, also fetch the 3-day forecast."
        }
      }
    },
    async execute(input: WeatherInput, context: ToolExecutionContext) {
      const city = input.city?.trim() || inferPartnerCity(context) || "Beijing";
      return fetchWeatherSnapshot(city, Boolean(input.includeForecast));
    }
  };
}

function inferPartnerCity(context: ToolExecutionContext) {
  return context.runtimeContext.participants[1]?.user.profile?.city;
}

function mockWeather(city: string, fallbackReason?: string) {
  return {
    provider: "mock" as const,
    city,
    condition: "partly cloudy",
    temperatureC: 16,
    advice: "带一件薄外套，晚上可能会凉一点。",
    fallbackReason
  };
}

async function getQWeather(city: string, includeForecast: boolean, apiKey: string) {
  const apiHost = (process.env.QWEATHER_API_HOST || "devapi.qweather.com").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const geoHost = (process.env.QWEATHER_GEOAPI_HOST || "geoapi.qweather.com").replace(/^https?:\/\//, "").replace(/\/$/, "");

  const cacheKey = `${apiHost}|${city}|${includeForecast ? "fc" : "now"}`;
  const cached = WEATHER_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return formatSnapshot(cached.value);
  }

  const location = await resolveLocation(city, apiKey, geoHost);
  const now = await fetchWeatherNow(location.id, apiKey, apiHost);
  const daily = includeForecast ? await fetchWeather3d(location.id, apiKey, apiHost) : undefined;

  const snapshot: QWeatherSnapshot = { location, now, daily };
  evictOldest(WEATHER_CACHE, MAX_CACHE_SIZE);
  WEATHER_CACHE.set(cacheKey, { value: snapshot, expiresAt: Date.now() + WEATHER_TTL_MS });
  return formatSnapshot(snapshot);
}

async function resolveLocation(city: string, apiKey: string, geoHost: string): Promise<QWeatherLocation> {
  const cacheKey = `${geoHost}|${city.toLowerCase()}`;
  const cached = LOCATION_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // Dedicated QWeather hosts (e.g. xxx.re.qweatherapi.com) serve GeoAPI under
  // /geo/v2/..., while the legacy geoapi.qweather.com serves it under /v2/...
  const isDedicated = !/^geoapi\.qweather\.com$/i.test(geoHost);
  const geoPath = isDedicated ? "/geo/v2/city/lookup" : "/v2/city/lookup";

  const url = `https://${geoHost}${geoPath}?location=${encodeURIComponent(city)}&number=1&lang=zh`;
  const data = await qweatherFetch<{ code: string; location?: QWeatherLocation[] }>(url, apiKey);
  const first = data.location?.[0];
  if (!first?.id) {
    throw new Error(`QWeather city lookup returned no result for "${city}" (code=${data.code})`);
  }

  evictOldest(LOCATION_CACHE, MAX_CACHE_SIZE);
  LOCATION_CACHE.set(cacheKey, { value: first, expiresAt: Date.now() + LOCATION_TTL_MS });
  return first;
}

async function fetchWeatherNow(locationId: string, apiKey: string, apiHost: string): Promise<QWeatherNow> {
  const url = `https://${apiHost}/v7/weather/now?location=${encodeURIComponent(locationId)}&lang=zh&unit=m`;
  const data = await qweatherFetch<{ code: string; now?: QWeatherNow }>(url, apiKey);
  if (!data.now) {
    throw new Error(`QWeather weather/now returned no payload (code=${data.code})`);
  }
  return data.now;
}

async function fetchWeather3d(locationId: string, apiKey: string, apiHost: string): Promise<QWeatherDaily[]> {
  const url = `https://${apiHost}/v7/weather/3d?location=${encodeURIComponent(locationId)}&lang=zh&unit=m`;
  const data = await qweatherFetch<{ code: string; daily?: QWeatherDaily[] }>(url, apiKey);
  return data.daily ?? [];
}

async function qweatherFetch<T extends { code: string }>(url: string, apiKey: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "X-QW-Api-Key": apiKey,
        Accept: "application/json"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`QWeather request failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as T;
    if (data.code !== "200") {
      throw new Error(`QWeather API error code=${data.code}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function formatSnapshot(snapshot: QWeatherSnapshot) {
  const { location, now, daily } = snapshot;
  const tempC = toNumber(now.temp);
  const feelsC = toNumber(now.feelsLike);

  return {
    provider: "qweather" as const,
    city: location.name,
    region: [location.adm2, location.adm1, location.country].filter(Boolean).join(" / "),
    locationId: location.id,
    timezone: location.tz,
    condition: now.text,
    temperatureC: tempC,
    feelsLikeC: feelsC,
    humidityPercent: toNumber(now.humidity),
    wind: {
      direction: now.windDir,
      scale: now.windScale,
      speedKmh: toNumber(now.windSpeed)
    },
    precipitationMm: toNumber(now.precip),
    pressureHpa: toNumber(now.pressure),
    visibilityKm: toNumber(now.vis),
    observedAt: now.obsTime,
    forecast: daily?.map((d) => ({
      date: d.fxDate,
      tempMaxC: toNumber(d.tempMax),
      tempMinC: toNumber(d.tempMin),
      textDay: d.textDay,
      textNight: d.textNight,
      humidityPercent: d.humidity ? toNumber(d.humidity) : undefined,
      precipitationMm: d.precip ? toNumber(d.precip) : undefined,
      uvIndex: d.uvIndex ? toNumber(d.uvIndex) : undefined
    })),
    advice: buildAdvice(now, daily)
  };
}

function toNumber(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function buildAdvice(now: QWeatherNow, daily?: QWeatherDaily[]) {
  const parts: string[] = [];
  const temp = toNumber(now.temp);
  if (temp !== undefined) {
    if (temp <= 5) parts.push("外面挺冷，记得穿厚外套。");
    else if (temp <= 12) parts.push("有点凉，加件薄外套合适。");
    else if (temp >= 30) parts.push("天气炎热，注意防晒补水。");
  }
  const precip = toNumber(now.precip);
  if (precip !== undefined && precip > 0) {
    parts.push("正在下雨，出门带把伞。");
  } else if (daily?.[0]?.precip && (toNumber(daily[0].precip) ?? 0) > 0) {
    parts.push("今天预计有降水，可以备一把伞。");
  }
  if (parts.length === 0) parts.push("天气还行，开心一天。");
  return parts.join(" ");
}

export const __testing = {
  LOCATION_CACHE,
  WEATHER_CACHE,
  formatSnapshot
};
