export interface Tool {
  id: string;
  name: string;
  server: string;
  title?: string;
  description?: string;
  inputSchema: JsonSchema;
  view: string | null;
  local: boolean;
  viewFile?: string | null;
}

export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  items?: JsonSchema;
}

export type Info =
  | {
      ok: true;
      project: string;
      entry: string;
      name: string;
      title: string | null;
      description: string | null;
      version: string;
      mcpUrl: string;
      tools: Tool[];
      unusedViews: string[];
    }
  | { ok: false; project: string; entry: string; error: string };

export interface ToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface Provider {
  id: string;
  label: string;
  needsKey: boolean;
  hasKey: boolean;
  source: string | null;
}

export interface Settings {
  provider?: string;
  models: Record<string, string>;
  customBaseUrl: string;
  providers: Provider[];
}

export interface RemoteServer {
  name: string;
  url: string;
  slug?: string;
  ok: boolean;
  error?: string;
  tools: Tool[];
}

export interface DirectoryServer {
  slug: string;
  name: string;
  summary?: string;
  publisher?: string;
  stars?: number;
  remote?: boolean;
  verified?: boolean;
  categories?: string[];
  url: string;
}

export interface Snippet {
  id: string;
  label: string;
  kind: "link" | "code";
  value: string;
  hint?: string;
}

export interface Ship {
  name: string;
  slug: string;
  snippets: Snippet[];
  badge: string;
  directoryPage: string;
  submitUrl: string;
  hostUrl: string;
}

const BASE = "/__studio/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
  return body;
}

const post = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  chatUrl: `${BASE}/chat`,
  info: () => request<Info>("/info"),
  call: (server: string, name: string, args: Record<string, unknown>) =>
    post<{ result: ToolResult; ms: number }>("/call", { server, name, arguments: args }),
  view: (server: string, uri: string) =>
    request<{ html: string }>(`/view?server=${encodeURIComponent(server)}&uri=${encodeURIComponent(uri)}`),
  settings: () => request<Settings>("/settings"),
  saveSettings: (body: { provider?: string; model?: string; key?: string | null; customBaseUrl?: string }) =>
    post<Settings>("/settings", body),
  models: (provider: string) => request<{ models: string[] }>(`/models?provider=${encodeURIComponent(provider)}`),
  servers: () => request<{ servers: RemoteServer[] }>("/servers"),
  addServer: (body: { slug?: string; url?: string; name?: string }) => post<{ added: string }>("/servers", body),
  removeServer: (name: string) => request<unknown>(`/servers?name=${encodeURIComponent(name)}`, { method: "DELETE" }),
  directory: (q: string, remote: boolean) =>
    request<{ total: number; servers: DirectoryServer[] }>(`/directory?q=${encodeURIComponent(q)}${remote ? "&remote=1" : ""}`),
  addTool: (body: { name: string; description: string; view: boolean }) => post<{ files: string[] }>("/tools", body),
  ship: () => request<Ship>("/ship"),
};
