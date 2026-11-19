import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { ToolResult } from "./api";

interface Props {
  server: string;
  uri: string;
  input: Record<string, unknown>;
  result: ToolResult | undefined;
  /** Called when the view sends a message into the conversation. */
  onMessage?: (text: string) => void;
}

/**
 * Hosts one MCP App view the way a chat client does: a sandboxed frame, the
 * tool input and result sent in, and tool calls from the view sent back out.
 */
export function ViewFrame({ server, uri, input, result, onMessage }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const ready = useRef(false);
  const latest = useRef({ input, result, onMessage });
  latest.current = { input, result, onMessage };
  const [height, setHeight] = useState(120);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const iframe = frame.current;
    if (!iframe?.contentWindow) return;
    let cancelled = false;
    ready.current = false;
    const bridge = new AppBridge(
      null,
      { name: "PlugMCP Studio", version: "0.1.0" },
      { openLinks: {}, serverTools: {}, logging: {} },
      { hostContext: { theme: "dark", displayMode: "inline", availableDisplayModes: ["inline"] } },
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
    bridge.addEventListener("sizechange", ({ height: next }) => {
      if (typeof next === "number") setHeight(Math.min(Math.max(next, 40), 900));
    });
    bridge.addEventListener("initialized", () => {
      ready.current = true;
      void bridge.sendToolInput({ arguments: latest.current.input });
      if (latest.current.result) void bridge.sendToolResult(latest.current.result as never);
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
  }, [server, uri]);

  useEffect(() => {
    if (ready.current && result) void bridgeRef.current?.sendToolResult(result as never);
  }, [result]);

  if (error) return <p className="note fault">{error}</p>;
  return (
    <iframe
      ref={frame}
      className="view-frame"
      title="Tool view"
      sandbox="allow-scripts allow-forms"
      style={{ height }}
    />
  );
}
