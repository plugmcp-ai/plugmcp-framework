import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { ToolResult } from "./api";

type Mode = "inline" | "fullscreen";

interface Props {
  server: string;
  uri: string;
  input: Record<string, unknown>;
  result: ToolResult | undefined;
  /** True while the input is still being written. The view gets it as partial input. */
  streaming?: boolean;
  /** Called when the view sends a message into the conversation. */
  onMessage?: (text: string) => void;
  /** Called when the view tells the model about its state. */
  onContext?: (text: string) => void;
}

/**
 * Hosts one MCP App view the way a chat client does: a sandboxed frame, the
 * tool input and result sent in, and tool calls from the view sent back out.
 */
export function ViewFrame({ server, uri, input, result, streaming = false, onMessage, onContext }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const ready = useRef(false);
  const inputSent = useRef(false);
  const latest = useRef({ input, result, streaming, onMessage, onContext });
  latest.current = { input, result, streaming, onMessage, onContext };
  const [height, setHeight] = useState(120);
  const [mode, setMode] = useState<Mode>("inline");
  const modeRef = useRef<Mode>("inline");
  const [context, setContext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendInput = (bridge: AppBridge) => {
    const now = latest.current;
    if (now.streaming) {
      void bridge.sendToolInputPartial({ arguments: now.input });
      return;
    }
    if (inputSent.current) return;
    inputSent.current = true;
    void bridge.sendToolInput({ arguments: now.input });
    if (now.result) void bridge.sendToolResult(now.result as never);
  };

  const changeMode = (next: Mode) => {
    modeRef.current = next;
    setMode(next);
    void bridgeRef.current?.sendHostContextChange({
      displayMode: next,
      ...(next === "fullscreen" ? { containerDimensions: { width: window.innerWidth, height: window.innerHeight } } : {}),
    });
  };

  useEffect(() => {
    const iframe = frame.current;
    if (!iframe?.contentWindow) return;
    let cancelled = false;
    ready.current = false;
    inputSent.current = false;
    const bridge = new AppBridge(
      null,
      { name: "PlugMCP Studio", version: "0.2.0" },
      {
        openLinks: {},
        serverTools: {},
        logging: {},
        updateModelContext: { text: {}, structuredContent: {} },
        message: { text: {} },
      },
      { hostContext: { theme: "dark", displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] } },
    );
    bridgeRef.current = bridge;
    bridge.oncalltool = async (params) =>
      (await api.call(server, params.name, (params.arguments ?? {}) as Record<string, unknown>)).result as never;
    bridge.onmessage = async (params) => {
      const text = params.content.map((block) => (block.type === "text" ? block.text : "")).join("");
      if (text) latest.current.onMessage?.(text);
      return {};
    };
    bridge.onopenlink = async ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
      return {};
    };
    bridge.onrequestdisplaymode = async ({ mode: asked }) => {
      const declared = bridge.getAppCapabilities()?.availableDisplayModes;
      // A view that did not declare fullscreen stays inline.
      const next: Mode = asked === "fullscreen" && declared?.includes("fullscreen") ? "fullscreen" : "inline";
      changeMode(next);
      return { mode: next };
    };
    bridge.onupdatemodelcontext = async (params) => {
      const text = (params.content ?? []).map((block) => (block.type === "text" ? block.text : "")).join("\n");
      setContext(text || null);
      latest.current.onContext?.(text);
      return {};
    };
    bridge.addEventListener("sizechange", ({ height: next }) => {
      if (typeof next === "number" && modeRef.current === "inline") setHeight(Math.min(Math.max(next, 40), 900));
    });
    bridge.addEventListener("initialized", () => {
      ready.current = true;
      sendInput(bridge);
    });

    void (async () => {
      try {
        const { html } = await api.view(server, uri);
        if (cancelled) return;
        // Listen before the page loads so its first message is not missed.
        await bridge.connect(new PostMessageTransport(iframe.contentWindow as Window, iframe.contentWindow as Window));
        iframe.srcdoc = html;
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();

    return () => {
      cancelled = true;
      bridgeRef.current = null;
      void bridge.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, uri]);

  useEffect(() => {
    if (ready.current && bridgeRef.current) sendInput(bridgeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, streaming]);

  useEffect(() => {
    if (ready.current && inputSent.current && result) void bridgeRef.current?.sendToolResult(result as never);
  }, [result]);

  useEffect(() => {
    if (mode !== "fullscreen") return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && changeMode("inline");
    const onResize = () => changeMode("fullscreen");
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (error) return <p className="note fault">{error}</p>;
  return (
    <>
      {/* The frame is never remounted: full screen is only a class, so the view keeps its state. */}
      <div className={`view-host${mode === "fullscreen" ? " is-full" : ""}`}>
        {mode === "fullscreen" ? (
          <button type="button" className="btn btn-outline btn-sm view-close" onClick={() => changeMode("inline")}>
            Close
          </button>
        ) : null}
        <iframe
          ref={frame}
          className="view-frame"
          title="Tool view"
          sandbox="allow-scripts allow-forms"
          style={mode === "fullscreen" ? undefined : { height }}
        />
      </div>
      {context ? (
        <details className="view-context">
          <summary className="small muted">Model context from the view</summary>
          <pre className="code">{context}</pre>
        </details>
      ) : null}
    </>
  );
}
