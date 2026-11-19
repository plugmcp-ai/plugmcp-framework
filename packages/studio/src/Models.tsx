import { IconKey, IconLock } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { Settings } from "./api";
import { useStudio } from "./state";
import { errorText } from "./ui";

const KEY_PAGES: Record<string, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  google: "https://aistudio.google.com/apikey",
  openrouter: "https://openrouter.ai/keys",
};

const modelCache = new Map<string, string[]>();

/** The models a provider offers for the saved key. Asked once per provider. */
export function useModels(provider: string | undefined, ready: boolean) {
  const [models, setModels] = useState<string[]>(provider ? (modelCache.get(provider) ?? []) : []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setError(null);
    if (!provider || !ready) return setModels([]);
    const hit = modelCache.get(provider);
    if (hit) return setModels(hit);
    let live = true;
    setLoading(true);
    api
      .models(provider)
      .then((next) => {
        modelCache.set(provider, next.models);
        if (live) setModels(next.models);
      })
      .catch((cause: unknown) => live && setError(errorText(cause)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [provider, ready]);
  return { models, error, loading };
}

export const forgetModels = (provider: string) => modelCache.delete(provider);

/** Two small selects: provider, then model. Only providers that are ready can be picked. */
export function ModelSelect({
  provider,
  model,
  onChange,
  compact = false,
}: {
  provider: string;
  model: string;
  onChange: (provider: string, model: string) => void;
  compact?: boolean;
}) {
  const { settings } = useStudio();
  const current = settings?.providers.find((item) => item.id === provider);
  const ready = Boolean(current && (!current.needsKey || current.hasKey));
  const { models, loading, error } = useModels(provider, ready);

  // Pick the first model when a provider has none chosen yet.
  useEffect(() => {
    if (ready && !model && models[0]) onChange(provider, models[0]);
  }, [ready, model, models, provider, onChange]);

  const style = compact ? { minHeight: 30, width: "auto", fontSize: 13 } : undefined;
  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <select
        className="input"
        style={compact ? { ...style, maxWidth: 150 } : { flex: "0 0 180px" }}
        aria-label="Provider"
        value={provider}
        onChange={(event) => onChange(event.target.value, settings?.models[event.target.value] ?? "")}
      >
        {!current ? <option value="">Choose a provider</option> : null}
        {settings?.providers.map((item) => (
          <option key={item.id} value={item.id} disabled={item.needsKey && !item.hasKey}>
            {item.label}
            {item.needsKey && !item.hasKey ? " (no key)" : ""}
          </option>
        ))}
      </select>
      {models.length ? (
        <select
          className="input mono"
          style={compact ? { ...style, maxWidth: 220 } : { flex: 1, minWidth: 160 }}
          aria-label="Model"
          value={model}
          onChange={(event) => onChange(provider, event.target.value)}
        >
          {model && !models.includes(model) ? <option value={model}>{model}</option> : null}
          {models.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input mono"
          style={compact ? { ...style, width: 200 } : { flex: 1, minWidth: 160 }}
          aria-label="Model"
          value={model}
          placeholder={loading ? "Loading models" : "Model name"}
          onChange={(event) => onChange(provider, event.target.value)}
        />
      )}
      {error && !compact ? <p className="hint fault" style={{ flexBasis: "100%" }}>{error}</p> : null}
    </div>
  );
}

/** First-run card: pick a provider, paste a key, start. */
export function KeySetup({ onDone }: { onDone?: () => void }) {
  const { settings, setSettings } = useStudio();
  const [provider, setProvider] = useState("openai");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!settings) return null;
  const current = settings.providers.find((item) => item.id === provider);
  const hasKey = Boolean(current?.hasKey);
  const needsKey = Boolean(current?.needsKey);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      let next: Settings = await api.saveSettings({
        provider,
        key: key.trim() || undefined,
        customBaseUrl: provider === "custom" ? baseUrl : undefined,
      });
      forgetModels(provider);
      // Choose a model straight away so the first message can be sent.
      if (!next.models[provider]) {
        const { models } = await api.models(provider);
        if (models[0]) next = await api.saveSettings({ provider, model: models[0] });
      }
      setSettings(next);
      setKey("");
      onDone?.();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="provider-grid">
        {settings.providers.map((item) => (
          <button key={item.id} type="button" className={`provider${provider === item.id ? " is-active" : ""}`} onClick={() => setProvider(item.id)}>
            {item.label}
            <small>{item.hasKey ? "Key found" : item.needsKey ? "Needs a key" : "No key needed"}</small>
          </button>
        ))}
      </div>
      {provider === "custom" ? (
        <div className="field">
          <label htmlFor="setup-base">Base address</label>
          <input id="setup-base" className="mono" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" />
        </div>
      ) : null}
      {hasKey ? (
        <p className="hint">
          <IconKey size={13} stroke={1.75} style={{ verticalAlign: -2 }} /> Using the key from{" "}
          {current?.source === "saved" ? "this machine" : `your ${current?.source}`}.
        </p>
      ) : needsKey || provider === "custom" ? (
        <div className="field">
          <label htmlFor="setup-key">
            API key
            {KEY_PAGES[provider] ? (
              <a className="link optional" href={KEY_PAGES[provider]} target="_blank" rel="noopener">
                Get one
              </a>
            ) : null}
          </label>
          <input id="setup-key" type="password" className="mono" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Paste your key" autoComplete="off" />
          <p className="hint">
            <IconLock size={12} stroke={1.75} style={{ verticalAlign: -1 }} /> Saved on this machine in ~/.plugmcp/keys.json. It goes only to {current?.label}, never to PlugMCP.
          </p>
        </div>
      ) : (
        <p className="hint">Ollama runs on this machine. Start it and pull a model first.</p>
      )}
      {error ? <p className="hint fault">{error}</p> : null}
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy || (needsKey && !hasKey && !key.trim())}>
        {busy ? "Checking" : "Start chatting"}
      </button>
    </form>
  );
}
