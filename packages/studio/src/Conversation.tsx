import { useChat } from "@ai-sdk/react";
import { IconArrowUp, IconChevronDown, IconCode, IconPlayerStop, IconTool } from "@tabler/icons-react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Markdown } from "./Markdown";
import { ViewFrame } from "./ViewFrame";
import { api } from "./api";
import type { Tool, ToolResult } from "./api";
import { useStudio } from "./state";

interface ToolPart {
  type: "dynamic-tool";
  toolName: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export interface ChatBody {
  provider: string;
  model: string;
  agent?: string;
  tools?: string[] | null;
  instructions?: string;
  /** Let the chat write tools and views into the project. */
  build?: boolean;
}

interface Props {
  placeholder?: string;
  /** Conversations with different ids keep separate histories. */
  id: string;
  /** What to send with each message. `null` means the chat is not ready. */
  body: ChatBody | null;
  title: string;
  lede: ReactNode;
  starters: string[];
  /** Shown in place of the greeting when the chat cannot run yet. */
  gate?: ReactNode;
  /** Receives a function that empties the conversation, and whether there is anything to empty. */
  onState?: (state: { clear: () => void; count: number }) => void;
  note?: string;
}

/** A conversation with a model that can call tools. Views render inline, as in a chat client. */
export function Conversation({ id, body, title, lede, starters, gate, onState, note, placeholder }: Props) {
  const { tools } = useStudio();
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const transport = useMemo(() => new DefaultChatTransport({ api: api.chatUrl }), []);
  const { messages, sendMessage, status, stop, error, setMessages, clearError } = useChat({ id, transport });
  const latest = useRef(body);
  latest.current = body;

  const byId = useMemo(() => new Map<string, Tool>(tools.map((tool) => [tool.id, tool])), [tools]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  const clear = useCallback(() => {
    setMessages([]);
    clearError();
  }, [setMessages, clearError]);

  useEffect(() => {
    onState?.({ clear, count: messages.length });
  }, [onState, clear, messages.length]);

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || !latest.current) return;
      clearError();
      void sendMessage({ text }, { body: latest.current });
    },
    [clearError, sendMessage],
  );

  const busy = status === "submitted" || status === "streaming";
  const ready = body !== null;

  return (
    <div className="chat">
      <div className="chat-scroll">
        <div className="chat-thread">
          {messages.length === 0 ? (
            !ready && gate ? (
              gate
            ) : (
              <div className="chat-empty">
                <h2>{title}</h2>
                <p>{lede}</p>
                {ready && starters.length ? (
                  <div className="suggestions">
                    {starters.map((text) => (
                      <button key={text} type="button" className="chip" onClick={() => send(text)}>
                        {text}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
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
                  if (call.toolName === "studio_try_tool") {
                    // A tool the chat ran by name, for example one it has just written.
                    const asked = (call.input ?? {}) as { name?: string; arguments?: unknown };
                    const real = { ...call, toolName: asked.name ?? "tool", input: asked.arguments ?? {} };
                    return <ToolCall key={call.toolCallId} call={real} tool={byId.get(real.toolName)} onMessage={send} />;
                  }
                  if (call.toolName.startsWith("studio_")) return <BuildStep key={call.toolCallId} call={call} />;
                  return <ToolCall key={call.toolCallId} call={call} tool={byId.get(call.toolName)} onMessage={send} />;
                }
                return null;
              })}
            </div>
          ))}
          {status === "submitted" ? (
            <div className="msg msg-assistant">
              <div className="thinking">Thinking</div>
            </div>
          ) : null}
          {error ? <p className="small fault">{error.message}</p> : null}
          <div ref={end} />
        </div>
      </div>

      <div className="composer-wrap">
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            send(draft);
            setDraft("");
          }}
        >
          <textarea
            rows={1}
            value={draft}
            placeholder={ready ? (placeholder ?? "Ask something that needs your tools") : "Add a model key to start"}
            disabled={!ready}
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
              <IconPlayerStop size={17} stroke={2} />
            </button>
          ) : (
            <button type="submit" className="send" disabled={!ready || !draft.trim()} aria-label="Send">
              <IconArrowUp size={17} stroke={2.25} />
            </button>
          )}
        </form>
        {note ? <p className="composer-note">{note}</p> : null}
      </div>
    </div>
  );
}

/** A step where the chat reads or writes the project's code. */
function BuildStep({ call }: { call: ToolPart }) {
  const { refresh } = useStudio();
  const [open, setOpen] = useState(false);
  const done = call.state === "output-available";
  const failed = call.state === "output-error";
  const input = (call.input ?? {}) as { name?: string; path?: string; tool?: string; view?: string; content?: string };
  const adding = call.toolName === "studio_add_tool";
  const reading = call.toolName === "studio_read_file";
  const target = adding ? input.name : input.path;
  const label = adding ? (done ? "Added tool" : "Writing tool") : reading ? (done ? "Read" : "Reading") : done ? "Saved" : "Writing";
  const code = adding ? [input.tool, input.view].filter(Boolean).join("\n\n// view\n\n") : reading ? "" : (input.content ?? "");
  const link = adding ? `#/tools/${input.name}` : input.path?.startsWith("views/") ? `#/tools/${input.path.slice(6).replace(/\.\w+$/, "")}` : "#/tools";

  // Show the new tool everywhere as soon as it exists.
  useEffect(() => {
    if (done && !reading) refresh();
  }, [done, reading, refresh]);

  return (
    <div className="toolcall">
      <button type="button" className="toolcall-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <IconCode size={14} stroke={1.75} />
        <span>{label}</span>
        {target ? <span className="mono">{target}</span> : null}
        <span className={`pill ${failed ? "pill-fault" : done ? "pill-ok" : "pill-wait"}`}>{failed ? "Did not load" : done ? "Done" : "Working"}</span>
        <IconChevronDown size={14} stroke={2} className="chevron" />
      </button>
      {open ? (
        <div className="toolcall-body">
          {call.errorText ? <pre className="code">{call.errorText}</pre> : null}
          {code ? <pre className="code">{code}</pre> : null}
          {done && !reading ? (
            <a className="link small" href={link}>
              Open it in Tools
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ToolCall({ call, tool, onMessage }: { call: ToolPart; tool: Tool | undefined; onMessage: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const done = call.state === "output-available";
  const failed = call.state === "output-error" || (done && (call.output as ToolResult | undefined)?.isError === true);
  const result = done ? (call.output as ToolResult) : undefined;
  const input = (call.input ?? {}) as Record<string, unknown>;
  return (
    <div className="toolcall">
      <button type="button" className="toolcall-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <IconTool size={14} stroke={1.75} />
        <span className="mono">{tool?.name ?? call.toolName}</span>
        {tool && !tool.local ? <span className="muted small">{tool.server}</span> : null}
        <span className={`pill ${failed ? "pill-fault" : done ? "pill-ok" : "pill-wait"}`}>{failed ? "Failed" : done ? "Done" : "Running"}</span>
        <IconChevronDown size={14} stroke={2} className="chevron" />
      </button>
      {open ? (
        <div className="toolcall-body">
          <div className="muted small">Input</div>
          <pre className="code">{JSON.stringify(input, null, 2)}</pre>
          {done || call.errorText ? (
            <>
              <div className="muted small">Result</div>
              <pre className="code">{call.errorText ?? JSON.stringify(result?.structuredContent ?? result?.content, null, 2)}</pre>
            </>
          ) : null}
        </div>
      ) : null}
      {tool?.view && call.state !== "input-streaming" && !failed ? (
        <div className="toolcall-view">
          <ViewFrame server={tool.local ? "local" : tool.server} uri={tool.view} input={input} result={result} onMessage={onMessage} />
        </div>
      ) : null}
    </div>
  );
}
