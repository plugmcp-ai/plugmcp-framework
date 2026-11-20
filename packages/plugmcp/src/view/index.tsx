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
  partial: Record<string, unknown> | undefined;
  result: RawResult | undefined;
  host: McpUiHostContext | undefined;
  /** Record the mode a request returned, for hosts that do not report the change themselves. */
  setDisplayMode: (mode: DisplayMode) => void;
}

export type DisplayMode = "inline" | "fullscreen" | "pip";

const MODES: DisplayMode[] = ["inline", "fullscreen", "pip"];

/** Display modes the tool declared with `view: { displayModes }`, carried in a meta tag. */
function declaredModes(): DisplayMode[] | undefined {
  try {
    const content = document.querySelector('meta[name="plugmcp-view"]')?.getAttribute("content");
    if (!content) return undefined;
    const modes = (JSON.parse(content) as { displayModes?: unknown }).displayModes;
    if (!Array.isArray(modes)) return undefined;
    const known = modes.filter((mode): mode is DisplayMode => MODES.includes(mode as DisplayMode));
    return known.length ? known : undefined;
  } catch {
    return undefined;
  }
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
export function ViewRoot({
  name,
  children,
  transport,
}: {
  name: string;
  children: ReactNode;
  /** Connection to use instead of the parent window. For tests. */
  transport?: Parameters<App["connect"]>[0];
}) {
  const [state, setState] = useState<ViewState>({
    app: null,
    connected: false,
    error: null,
    input: undefined,
    partial: undefined,
    result: undefined,
    host: undefined,
    setDisplayMode: (mode) => setState((prev) => ({ ...prev, host: { ...prev.host, displayMode: mode } })),
  });

  useEffect(() => {
    const modes = declaredModes();
    const app = new App(
      { name, version: "1.0.0" },
      modes ? { availableDisplayModes: modes } : {},
      { autoResize: true },
    );
    let alive = true;
    const patch = (next: Partial<ViewState>) => alive && setState((prev) => ({ ...prev, ...next }));
    app.addEventListener("toolinputpartial", (params) => patch({ partial: params.arguments ?? {} }));
    app.ontoolinput = (params) => patch({ input: params.arguments ?? {}, partial: undefined, result: undefined });
    app.ontoolresult = (params) => patch({ result: params as RawResult });
    app.onhostcontextchanged = (params) => {
      const host = { ...app.getHostContext(), ...params };
      applyTheme(host);
      patch({ host });
    };
    app
      .connect(transport)
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
  }, [name, transport]);

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
  /** Arguments as they stream in, before `input` is complete. The last item may be cut short. */
  partialInput: Partial<Input> | undefined;
  /** How the host is showing the view now. */
  displayMode: DisplayMode;
  /** Modes the host can switch this view to. */
  availableDisplayModes: DisplayMode[];
  /** Ask the host to change mode. Resolves to the mode the host set. */
  requestDisplayMode: (mode: DisplayMode) => Promise<DisplayMode>;
  /** Size the host gives the view, when it says. */
  containerDimensions: McpUiHostContext["containerDimensions"];
  /** Tell the model about the view's state without starting a reply. Each call replaces the last. False if the host does not support it. */
  updateModelContext: (text: string, data?: Record<string, unknown>) => Promise<boolean>;
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
  const { app, input, partial, result, host, setDisplayMode } = state;
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
      partialInput: partial as Partial<Input> | undefined,
      displayMode: (host?.displayMode as DisplayMode | undefined) ?? "inline",
      availableDisplayModes: (host?.availableDisplayModes as DisplayMode[] | undefined) ?? ["inline"],
      requestDisplayMode: async (next) => {
        const set = (await need().requestDisplayMode({ mode: next })).mode as DisplayMode;
        setDisplayMode(set);
        return set;
      },
      containerDimensions: host?.containerDimensions,
      updateModelContext: async (text, data) => {
        if (!app?.getHostCapabilities()?.updateModelContext) return false;
        try {
          await app.updateModelContext({
            content: [{ type: "text", text }],
            ...(data ? { structuredContent: data } : {}),
          });
          return true;
        } catch {
          return false;
        }
      },
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
  }, [app, input, partial, result, host, setDisplayMode]);
}
