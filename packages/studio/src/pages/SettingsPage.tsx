import { IconCheck, IconLock } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { ModelSelect, forgetModels } from "../Models";
import { api } from "../api";
import type { Provider } from "../api";
import { useStudio } from "../state";
import { PageHead, errorText } from "../ui";

export function SettingsPage() {
  const { settings, setSettings, model } = useStudio();
  const onModel = useCallback(
    (provider: string, name: string) => {
      void api.saveSettings({ provider, model: name }).then(setSettings);
    },
    [setSettings],
  );
  if (!settings) return null;
  const provider = settings.provider ?? settings.providers.find((item) => item.hasKey)?.id ?? "";

  return (
    <div className="page page-narrow">
      <PageHead title="Models and keys" lede="The chat runs on your own model keys. Pick the model to use, and add a key for each provider you want." />

      <section className="panel panel-pad stack">
        <h2>Model for the chat</h2>
        {settings.providers.some((item) => !item.needsKey || item.hasKey) ? (
          <ModelSelect provider={provider} model={settings.models[provider] ?? ""} onChange={onModel} />
        ) : null}
        <p className="hint">{model ? `Using ${model.label} ${model.model}.` : "Add a key below, then choose a model here."}</p>
      </section>

      <section>
        <h2 className="section-title" style={{ marginBottom: 10 }}>Providers</h2>
        <ul className="panel rows">
          {settings.providers.map((item) => (
            <ProviderRow key={item.id} provider={item} />
          ))}
        </ul>
        <p className="hint" style={{ marginTop: 10 }}>
          <IconLock size={12} stroke={1.75} style={{ verticalAlign: -1 }} /> Keys are saved on this machine in ~/.plugmcp/keys.json, or read from your project's .env. They are sent only to the provider, never to the browser or to PlugMCP.
        </p>
      </section>
    </div>
  );
}

function ProviderRow({ provider }: { provider: Provider }) {
  const { settings, setSettings } = useStudio();
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(settings?.customBaseUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const custom = provider.id === "custom";

  async function save(body: { key?: string | null; customBaseUrl?: string }) {
    setBusy(true);
    setError(null);
    try {
      // Saving a key must not switch the chat to this provider.
      const next = await api.saveSettings({ provider: provider.id, ...body });
      forgetModels(provider.id);
      setSettings(settings?.provider && settings.provider !== provider.id ? await api.saveSettings({ provider: settings.provider }) : next);
      setKey("");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li style={{ padding: "14px 16px" }} className="stack">
      <div className="row">
        <div className="grow">
          <div className="row-title">{provider.label}</div>
          <div className="row-sub">
            {provider.hasKey ? `Key from ${provider.source === "saved" ? "this machine" : provider.source}` : provider.needsKey ? "No key yet" : custom ? "Any endpoint that speaks the OpenAI API" : "Runs on this machine, no key needed"}
          </div>
        </div>
        {provider.hasKey ? (
          <span className="pill pill-ok">
            <IconCheck size={12} stroke={2.5} /> Ready
          </span>
        ) : null}
        {provider.source === "saved" ? (
          <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void save({ key: null })}>
            Remove key
          </button>
        ) : null}
      </div>
      {custom ? (
        <input className="input mono" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" aria-label="Base address" />
      ) : null}
      {(provider.needsKey || custom) && provider.source !== "project .env" && provider.source !== "environment" ? (
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault();
            void save({ key: key.trim() || undefined, customBaseUrl: custom ? baseUrl : undefined });
          }}
        >
          <input
            className="input mono grow"
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder={provider.hasKey ? "Paste a new key to replace it" : custom ? "API key, if the endpoint needs one" : "Paste your key"}
            autoComplete="off"
            aria-label={`${provider.label} API key`}
          />
          <button type="submit" className="btn btn-secondary" disabled={busy || (!key.trim() && !custom)}>
            {busy ? "Saving" : "Save"}
          </button>
        </form>
      ) : null}
      {error ? <p className="small fault">{error}</p> : null}
    </li>
  );
}
