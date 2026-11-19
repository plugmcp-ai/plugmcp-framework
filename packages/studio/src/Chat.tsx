import { useChat } from "@ai-sdk/react";
import { IconArrowUp, IconChevronDown, IconPlayerStop, IconSettings, IconTool, IconTrash } from "@tabler/icons-react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { ViewFrame } from "./ViewFrame";
import { api } from "./api";
import type { Info, RemoteServer, Settings, Tool, ToolResult } from "./api";

type Ok = Extract<Info, { ok: true }>;

interface ToolPart {
  type: "dynamic-tool";
  toolName: string;
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error" | string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export function Chat({ info }: { info: Ok }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [remote, setRemote] = useState<RemoteServer[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: api.chatUrl }), []);
  const { messages, sendMessage, status, stop, error, setMessages, clearError } = useChat({ transport });

  useEffect(() => {
    void api.settings().then((next) => {
      setSettings(next);
      const active = next.providers.find((p) => p.id === next.provider);
      if (!active || (active.needsKey && !active.hasKey)) setShowSettings(true);
    });
    void api.servers().then((next) => setRemote(next.servers));
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  const tools = useMemo(() => {
    const map = new Map<string, Tool>();
    for (const tool of info.tools) map.set(tool.id, tool);
    for (const server of remote) for (const tool of server.tools) map.set(tool.id, tool);
    return map;
  }, [info.tools, remote]);

  const provider = settings?.provider ?? "";
  const model = settings?.models[provider] ?? "";
  const active = settings?.providers.find((p) => p.id === provider);
  const canSend = Boolean(active && model && (!active.needsKey || active.hasKey));
  const busy = status === "submitted" || status === "streaming";

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || !canSend) return;
      clearError();
      void sendMessage({ text }, { body: { provider, model } });
    },
    [canSend, clearError, sendMessage, provider, model],
  );

  const suggestions = info.tools.slice(0, 3).map((tool) => `Use ${tool.name} and show me the result`);

  return (
    <div className="chat">
      <div className="chat-bar">
        <button className="btn btn-ghost" onClick={() => setShowSettings((open) => !open)} aria-expanded={showSettings}>
          <IconSettings size={16} stroke={1.75} />
          {active && model ? (
            <span>
              {active.label} <span className="meta mono">{model}</span>
            </span>
          ) : (
            "Choose a model"
          )}
          <IconChevronDown size={14} stroke={2} />
        </button>
        <div className="chat-tools">
          <IconTool size={14} stroke={1.75} />
          {tools.size} tool{tools.size === 1 ? "" : "s"} from {1 + remote.filter((s) => s.ok).length} server
          {remote.filter((s) => s.ok).length ? "s" : ""}
        </div>
        {messages.length ? (
          <button className="btn btn-ghost" onClick={() => setMessages([])}>
            <IconTrash size={16} stroke={1.75} /> Clear
          </button>
        ) : null}
      </div>

      {showSettings && settings ? <ModelSettings settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} /> : null}

      <div className="chat-scroll">
        <div className="chat-thread">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <h2>Talk to your server</h2>
              <p className="note">
                The model can call every tool in {info.name}. Your key stays on this machine and goes only to the provider you pick.
              </p>
              {canSend ? (
                <div className="suggestions">
                  {suggestions.map((text) => (
                    <button key={text} className="chip" onClick={() => send(text)}>
                      {text}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {messages.map((message) => (
            <div key={message.id} className={`msg msg-${message.role}`}>
              {message.parts.map((part, index) => {
                if (part.type === "text") {
                  return part.text ? (
                    <div key={index} className="bubble">
                      {message.role === "assistant" ? <Markdown text={part.text} /> : part.text}
                    </div>
                  ) : null;
                }
                if (part.type === "dynamic-tool") {
                  const call = part as unknown as ToolPart;
                  return <ToolCall key={call.toolCallId} call={call} tool={tools.get(call.toolName)} onMessage={send} />;
                }
                return null;
              })}
            </div>
          ))}
          {status === "submitted" ? <div className="msg msg-assistant"><div className="thinking">Thinking</div></div> : null}
          {error ? <p className="note fault">{error.message}</p> : null}
          <div ref={end} />
        </div>
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
          setDraft("");
        }}
      >
        <textarea
          rows={1}
          value={draft}
          placeholder={canSend ? "Message your server" : "Choose a model and add a key to start"}
          disabled={!canSend}
          aria-label="Message"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {busy ? (
          <button type="button" className="send" onClick={() => void stop()} aria-label="Stop">
            <IconPlayerStop size={18} stroke={2} />
          </button>
        ) : (
          <button type="submit" className="send" disabled={!canSend || !draft.trim()} aria-label="Send">
            <IconArrowUp size={18} stroke={2} />
          </button>
        )}
      </form>
    </div>
  );
}

function ToolCall({ call, tool, onMessage }: { call: ToolPart; tool: Tool | undefined; onMessage: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const done = call.state === "output-available";
  const failed = call.state === "output-error" || (done && (call.output as ToolResult | undefined)?.isError === true);
  const result = done ? (call.output as ToolResult) : undefined;
  const input = (call.input ?? {}) as Record<string, unknown>;
  const label = failed ? "Failed" : done ? "Done" : "Running";
  return (
    <div className="toolcall">
      <button className="toolcall-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <IconTool size={14} stroke={1.75} />
        <span className="mono">{tool?.name ?? call.toolName}</span>
        {tool && !tool.local ? <span className="meta">{tool.server}</span> : null}
        <span className={`pill ${failed ? "pill-fault" : done ? "pill-ok" : "pill-wait"}`}>{label}</span>
        <IconChevronDown size={14} stroke={2} className={open ? "flip" : ""} />
      </button>
      {open ? (
        <div className="toolcall-body">
          <div className="meta">Input</div>
          <pre className="code">{JSON.stringify(input, null, 2)}</pre>
          {done || call.errorText ? (
            <>
              <div className="meta">Result</div>
              <pre className="code">{call.errorText ?? JSON.stringify(result?.structuredContent ?? result?.content, null, 2)}</pre>
            </>
          ) : null}
        </div>
      ) : null}
      {tool?.view && call.state !== "input-streaming" && !failed ? (
        <div className="view-wrap">
          <ViewFrame server={tool.local ? "local" : tool.server} uri={tool.view} input={input} result={result} onMessage={onMessage} />
        </div>
      ) : null}
    </div>
  );
}

function ModelSettings({ settings, onChange, onClose }: { settings: Settings; onChange: (next: Settings) => void; onClose: () => void }) {
  const [provider, setProvider] = useState(settings.provider ?? settings.providers.find((p) => p.hasKey)?.id ?? "openai");
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState(settings.models[provider] ?? "");
  const [baseUrl, setBaseUrl] = useState(settings.customBaseUrl);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const current = settings.providers.find((p) => p.id === provider);
  const ready = Boolean(current && (!current.needsKey || current.hasKey));

  useEffect(() => {
    setModel(settings.models[provider] ?? "");
    setModels([]);
    setError(null);
    if (!ready) return;
    setLoading(true);
    api
      .models(provider)
      .then((next) => {
        setModels(next.models);
        if (!settings.models[provider] && next.models[0]) setModel(next.models[0]);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  }, [provider, ready, settings.models, settings.customBaseUrl]);

  return (
    <div className="settings">
      <div className="form">
        <div className="field">
          <label htmlFor="provider">Provider</label>
          <select id="provider" value={provider} onChange={(event) => setProvider(event.target.value)}>
            {settings.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.hasKey ? " (key found)" : ""}
              </option>
            ))}
          </select>
        </div>
        {provider === "custom" ? (
          <div className="field">
            <label htmlFor="base-url">Base address</label>
            <input id="base-url" className="mono" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" />
          </div>
        ) : null}
        {current?.needsKey || provider === "custom" ? (
          <div className="field">
            <label htmlFor="api-key">API key</label>
            {current?.hasKey ? (
              <p className="note">
                Using the key from {current.source === "saved" ? "this machine (~/.plugmcp/keys.json)" : `your ${current.source}`}.{" "}
                {current.source === "saved" ? (
                  <button type="button" className="link" onClick={async () => onChange(await api.saveSettings({ provider, key: null }))}>
                    Remove it
                  </button>
                ) : null}
              </p>
            ) : (
              <>
                <input id="api-key" type="password" className="mono" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Paste your key" autoComplete="off" />
                <p className="hint">Saved to ~/.plugmcp/keys.json on this machine. It is sent only to {current?.label}.</p>
              </>
            )}
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="model">Model</label>
          {models.length ? (
            <select id="model" value={model} onChange={(event) => setModel(event.target.value)}>
              {!models.includes(model) && model ? <option value={model}>{model}</option> : null}
              {models.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          ) : (
            <input id="model" className="mono" value={model} onChange={(event) => setModel(event.target.value)} placeholder={loading ? "Loading models" : "Model name"} />
          )}
        </div>
      </div>
      {error ? <p className="note fault">{error}</p> : null}
      <div className="row">
        <button
          className="btn btn-primary"
          onClick={async () => {
            try {
              const next = await api.saveSettings({ provider, model, key: key || undefined, customBaseUrl: provider === "custom" ? baseUrl : undefined });
              setKey("");
              onChange(next);
              const saved = next.providers.find((p) => p.id === provider);
              if (model && saved && (!saved.needsKey || saved.hasKey)) onClose();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
        >
          Save
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
