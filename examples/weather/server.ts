import { createServer } from "plugmcp";
import { z } from "zod";

// Before you build: someone may already run the server you need.
// Search 70,000+ at https://plugmcp.ai/mcp or run `plugmcp search <words>`.

const server = createServer({
  name: "weather",
  description: "Current weather for any city, with a card the user can see.",
  instructions: "Use get_weather whenever the user asks about weather in a place.",
});

server.tool(
  {
    name: "get_weather",
    description: "Current temperature, wind and sky for a city. Shows a weather card.",
    input: z.object({ city: z.string().describe("City name, for example Lisbon") }),
    // The view fetches nothing itself, so it needs no outside domains.
  },
  async ({ city }) => {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`,
    ).then((r) => r.json() as Promise<{ results?: Array<{ name: string; country: string; latitude: number; longitude: number }> }>);
    const place = geo.results?.[0];
    if (!place) throw new Error(`No city found called "${city}".`);

    const forecast = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,wind_speed_10m,weather_code`,
    ).then((r) => r.json() as Promise<{ current: { temperature_2m: number; wind_speed_10m: number; weather_code: number } }>);

    const code = forecast.current.weather_code;
    const sky = code === 0 ? "Clear" : code <= 3 ? "Partly cloudy" : code <= 48 ? "Fog" : code <= 67 ? "Rain" : code <= 77 ? "Snow" : code <= 82 ? "Showers" : "Storm";

    // Return a plain object. The model reads it as JSON and the view gets it as `output`.
    return {
      city: place.name,
      country: place.country,
      tempC: Math.round(forecast.current.temperature_2m),
      windKmh: Math.round(forecast.current.wind_speed_10m),
      sky,
    };
  },
);

export default server;
