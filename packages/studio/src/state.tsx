import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, setMcp } from "./api";
import type { Agent, Info, RemoteServer, Settings, Tool } from "./api";

export type Ok = Extract<Info, { ok: true }>;

interface Studio {
  info: Info | null;
  /** The last good answer, kept while the server file is broken so pages stay usable. */
  server: Ok | null;
  offline: boolean;
  settings: Settings | null;
  remote: RemoteServer[];
  agents: Agent[];
  /** False until the saved agents have been read once. */
  agentsReady: boolean;
  /** Every tool the chat can use: this server's and the added ones. */
  tools: Tool[];
  /** The provider and model the chat uses now, when it is ready to run. */
  model: { provider: string; model: string; label: string } | null;
  refresh: () => void;
  setSettings: (next: Settings) => void;
  reloadRemote: () => Promise<void>;
  reloadAgents: () => Promise<void>;
}

interface Space {
  /** Name of the folder plugmcp dev runs in. */
  name: string;
  /** Every MCP server in the folder. */
  servers: Info[];
  /** The MCP server the Studio is working on. */
  current: string;
  switchTo: (id: string) => void;
  reload: () => Promise<void>;
}

const SpaceContext = createContext<Space | null>(null);

export function useWorkspace(): Space {
  const value = useContext(SpaceContext);
  if (!value) throw new Error("useWorkspace needs WorkspaceProvider.");
  return value;
}

const remembered = () => {
  try {
    return localStorage.getItem("plugmcp.mcp") ?? "";
  } catch {
    return "";
  }
};

/** Knows every MCP server in the folder and which one is open. Everything inside works on that one. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState("");
  const [servers, setServers] = useState<Info[]>([]);
  const [picked, setPicked] = useState(remembered);

  const reload = useCallback(
    () =>
      api.workspace().then((next) => {
        setName(next.name);
        setServers((prev) => (JSON.stringify(prev) === JSON.stringify(next.servers) ? prev : next.servers));
      }),
    [],
  );

  useEffect(() => {
    void reload().catch(() => undefined);
    const timer = setInterval(() => document.visibilityState === "visible" && void reload().catch(() => undefined), 3000);
    return () => clearInterval(timer);
  }, [reload]);

  const switchTo = useCallback((id: string) => {
    try {
      localStorage.setItem("plugmcp.mcp", id);
    } catch {
      // The choice then lasts until the page is closed.
    }
    setPicked(id);
  }, []);

  // Fall back to the first server when the remembered one is gone.
  const current = servers.length && !servers.some((item) => item.id === picked) ? (servers[0]?.id ?? "") : picked;
  setMcp(current);

  const value = useMemo(() => ({ name, servers, current, switchTo, reload }), [name, servers, current, switchTo, reload]);
  return (
    <SpaceContext.Provider value={value}>
      <StudioProvider key={current}>{children}</StudioProvider>
    </SpaceContext.Provider>
  );
}

const Context = createContext<Studio | null>(null);

export function useStudio(): Studio {
  const value = useContext(Context);
  if (!value) throw new Error("useStudio needs StudioProvider.");
  return value;
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [server, setServer] = useState<Ok | null>(null);
  const [offline, setOffline] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [remote, setRemote] = useState<RemoteServer[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsReady, setAgentsReady] = useState(false);

  const refresh = useCallback(() => {
    api
      .info()
      .then((next) => {
        setOffline(false);
        // Keep the same object when nothing changed so pages do not redraw.
        setInfo((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        if (next.ok) setServer((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      })
      .catch(() => setOffline(true));
  }, []);

  const reloadRemote = useCallback(() => api.servers().then((next) => setRemote(next.servers)), []);
  const reloadAgents = useCallback(
    () =>
      api.agents().then((next) => {
        setAgents(next.agents);
        setAgentsReady(true);
      }),
    [],
  );

  // The server reloads when a file is saved. Ask it what it has now.
  useEffect(() => {
    refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), 1500);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    void api.settings().then(setSettings).catch(() => undefined);
    void reloadRemote().catch(() => undefined);
    void reloadAgents().catch(() => undefined);
  }, [reloadRemote, reloadAgents]);

  const tools = useMemo(() => [...(server?.tools ?? []), ...remote.flatMap((item) => item.tools)], [server, remote]);

  const model = useMemo(() => {
    const provider = settings?.providers.find((item) => item.id === settings.provider);
    const name = provider ? settings?.models[provider.id] : undefined;
    if (!provider || !name || (provider.needsKey && !provider.hasKey)) return null;
    return { provider: provider.id, model: name, label: provider.label };
  }, [settings]);

  const value = useMemo(
    () => ({ info, server, offline, settings, remote, agents, agentsReady, tools, model, refresh, setSettings, reloadRemote, reloadAgents }),
    [info, server, offline, settings, remote, agents, agentsReady, tools, model, refresh, reloadRemote, reloadAgents],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
