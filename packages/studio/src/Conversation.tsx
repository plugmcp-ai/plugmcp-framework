import { useChat } from "@ai-sdk/react";
import { IconArrowUp, IconChevronDown, IconPlayerStop, IconTool } from "@tabler/icons-react";
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
}

interface Props {
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
export function Conversation({ id, body, title, lede, starters, gate, onState, note }: Props) {
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
            placeholder={ready ? "Ask something that needs your tools" : "Add a model key to start"}
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
