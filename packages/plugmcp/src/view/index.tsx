import { App } from "@modelcontextprotocol/ext-apps";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface RawResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface ViewState {
  app: App | null;
  connected: boolean;
  error: Error | null;
  input: Record<string, unknown> | undefined;
  result: RawResult | undefined;
  host: McpUiHostContext | undefined;
}

const ViewContext = createContext<ViewState | null>(null);

const textOf = (result: RawResult | undefined) =>
  (result?.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");

function applyTheme(host: McpUiHostContext | undefined) {
  const theme = host?.theme;
  if (!theme) return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const variables = host?.styles?.variables as Record<string, string | undefined> | undefined;
  for (const [key, value] of Object.entries(variables ?? {})) {
    if (value) root.style.setProperty(key, value);
  }
}

/** Connects the view to its host. `plugmcp` wraps every view in this for you. */
export function ViewRoot({ name, children }: { name: string; children: ReactNode }) {
  const [state, setState] = useState<ViewState>({
    app: null,
    connected: false,
    error: null,
    input: undefined,
    result: undefined,
    host: undefined,
  });

  useEffect(() => {
    const app = new App({ name, version: "1.0.0" }, {}, { autoResize: true });
    let alive = true;
    const patch = (next: Partial<ViewState>) => alive && setState((prev) => ({ ...prev, ...next }));
    app.ontoolinput = (params) => patch({ input: params.arguments ?? {}, result: undefined });
    app.ontoolresult = (params) => patch({ result: params as RawResult });
    app.onhostcontextchanged = (params) => {
      const host = { ...app.getHostContext(), ...params };
      applyTheme(host);
      patch({ host });
    };
    app
      .connect()
      .then(() => {
        const host = app.getHostContext();
        applyTheme(host);
        patch({ app, connected: true, host });
      })
      .catch((error: unknown) => patch({ error: error instanceof Error ? error : new Error(String(error)) }));
    return () => {
      alive = false;
      void app.close();
    };
  }, [name]);

  return <ViewContext.Provider value={state}>{children}</ViewContext.Provider>;
}

export interface CallResult<T = Record<string, unknown>> {
  output: T | undefined;
  text: string;
  isError: boolean;
}

export interface ToolView<Output, Input> {
  /** Arguments the model called the tool with. */
  input: Input | undefined;
  /** The object your handler returned. */
  output: Output | undefined;
  /** The text part of the result. */
  text: string;
  /** True until the tool result arrives. */
  isPending: boolean;
  isError: boolean;
  theme: "light" | "dark";
  /** Call any tool on this server from the view. */
  callTool: <T = Record<string, unknown>>(name: string, args?: Record<string, unknown>) => Promise<CallResult<T>>;
  /** Send a message into the conversation as the user. */
  sendMessage: (text: string) => Promise<void>;
  /** Ask the host to open a link. */
  openLink: (url: string) => Promise<void>;
  /** The underlying MCP Apps connection, for anything not covered here. */
  app: App | null;
}

/** Read the tool call that opened this view, and talk back to the host. */
export function useTool<Output = Record<string, unknown>, Input = Record<string, unknown>>(): ToolView<Output, Input> {
  const state = useContext(ViewContext);
  if (!state) throw new Error("useTool must be used inside a view rendered by plugmcp.");
  const { app, input, result, host } = state;
  return useMemo<ToolView<Output, Input>>(() => {
    const need = () => {
      if (!app) throw new Error("The view is not connected to a host yet.");
      return app;
    };
    return {
      input: input as Input | undefined,
      output: result?.structuredContent as Output | undefined,
      text: textOf(result),
      isPending: result === undefined,
      isError: result?.isError === true,
      theme: host?.theme === "light" ? "light" : "dark",
      callTool: async <T,>(name: string, args: Record<string, unknown> = {}) => {
        const next = (await need().callServerTool({ name, arguments: args })) as RawResult;
        return { output: next.structuredContent as T | undefined, text: textOf(next), isError: next.isError === true };
      },
      sendMessage: async (text) => {
        await need().sendMessage({ role: "user", content: [{ type: "text", text }] });
      },
      openLink: async (url) => {
        await need().openLink({ url });
      },
      app,
    };
  }, [app, input, result, host]);
}
