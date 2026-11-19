import { useState } from "react";
import { useTool } from "plugmcp/view";

// This file is the view for the tool named get_weather. The file name is the link.

interface Weather {
  city: string;
  country: string;
  tempC: number;
  windKmh: number;
  sky: string;
}

export default function WeatherCard() {
  const { output, isPending, isError, text, theme, callTool, sendMessage } = useTool<Weather>();
  const [other, setOther] = useState<Weather | null>(null);
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);

  const dark = theme === "dark";
  const ink = dark ? "#F2EFE9" : "#141414";
  const muted = dark ? "#8D8984" : "#6B6762";
  const line = dark ? "#2A2A2A" : "#E2DFD9";
  const sheet = dark ? "#141414" : "#FFFFFF";

  if (isPending) return <p style={{ color: muted, padding: 16, margin: 0 }}>Checking the weather</p>;
  if (isError) return <p style={{ color: "#F87171", padding: 16, margin: 0 }}>{text}</p>;

  const shown = other ?? output;
  if (!shown) return null;

  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (!city.trim()) return;
    setBusy(true);
    // A view can call any tool on its own server.
    const result = await callTool<Weather>("get_weather", { city });
    if (result.output) setOther(result.output);
    setBusy(false);
  }

  return (
    <div style={{ color: ink, background: sheet, border: `1px solid ${line}`, borderRadius: 14, padding: 20, maxWidth: 380 }}>
      <div style={{ color: muted, fontSize: 13 }}>
        {shown.city}, {shown.country}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 4 }}>
        <div style={{ fontSize: 52, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{shown.tempC}°</div>
        <div style={{ fontSize: 16 }}>{shown.sky}</div>
      </div>
      <div style={{ color: muted, fontSize: 13, marginTop: 6 }}>Wind {shown.windKmh} km/h</div>

      <form onSubmit={check} style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Another city"
          aria-label="Another city"
          style={{ flex: 1, minWidth: 0, background: "transparent", color: ink, border: `1px solid ${line}`, borderRadius: 10, padding: "8px 10px", font: "inherit" }}
        />
        <button
          type="submit"
          disabled={busy}
          style={{ background: ink, color: sheet, border: 0, borderRadius: 10, padding: "8px 14px", font: "inherit", fontWeight: 500, cursor: "pointer" }}
        >
          {busy ? "Checking" : "Check"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => void sendMessage(`What should I wear in ${shown.city} today?`)}
        style={{ marginTop: 10, background: "none", border: 0, padding: 0, color: "#0099FF", font: "inherit", cursor: "pointer" }}
      >
        Ask what to wear
      </button>
    </div>
  );
}
