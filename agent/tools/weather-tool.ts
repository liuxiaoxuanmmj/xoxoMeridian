import type { AgentTool, ToolExecutionContext } from "@/agent/types";

type WeatherInput = {
  city?: string;
};

export function createWeatherTool(): AgentTool<WeatherInput> {
  return {
    name: "weather.get",
    description: "Get weather for a city. Uses a mock adapter unless WEATHER_PROVIDER is configured.",
    schema: {
      type: "object",
      properties: {
        city: { type: "string" }
      }
    },
    async execute(input: WeatherInput, context: ToolExecutionContext) {
      const city = input.city ?? inferPartnerCity(context) ?? "London";

      if (process.env.WEATHER_PROVIDER !== "mock" && process.env.WEATHER_BASE_URL && process.env.WEATHER_API_KEY) {
        const response = await fetch(
          `${process.env.WEATHER_BASE_URL.replace(/\/$/, "")}?city=${encodeURIComponent(city)}&key=${encodeURIComponent(
            process.env.WEATHER_API_KEY
          )}`
        );
        if (!response.ok) {
          throw new Error(`Weather provider failed with status ${response.status}`);
        }

        return {
          provider: process.env.WEATHER_PROVIDER,
          city,
          raw: await response.json()
        };
      }

      return {
        provider: "mock",
        city,
        condition: "partly cloudy",
        temperatureC: 16,
        advice: "带一件薄外套，晚上可能会凉一点。"
      };
    }
  };
}

function inferPartnerCity(context: ToolExecutionContext) {
  return context.runtimeContext.participants[1]?.user.profile?.city;
}
