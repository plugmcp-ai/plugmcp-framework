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
      /** Short name of this MCP server inside the folder. */
      id: string;
      /** The server file, from the folder plugmcp dev runs in. */
      file: string;
      project: string;
      entry: string;
      name: string;
      title: string | null;
      description: string | null;
      version: string;
      mcpUrl: string;
      tools: Tool[];
      unusedViews: string[];
      instructions: string | null;
      calls: number;
      failed: number;
    }
  | { ok: false; id: string; file: string; mcpUrl: string; project: string; entry: string; error: string };

/** A saved call of a tool and what it should give back. */
export interface SavedTest {
  id: string;
  tool: string;
  name: string;
  arguments: Record<string, unknown>;
  expectError?: boolean;
  contains?: string;
}

export interface TestOutcome {
  id: string;
  tool: string;
  name: string;
  ok: boolean;
  ms: number;
  reason: string;
  output: string;
}

/** The folder plugmcp dev runs in, and every MCP server in it. */
export interface Workspace {
  name: string;
  servers: Info[];
}

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

export interface Agent {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  provider?: string;
  model?: string;
  tools: string[] | null;
  starters?: string[];
}

export interface CallRecord {
  id: number;
  at: number;
  tool: string;
  server: string;
  ms: number;
  ok: boolean;
  input: unknown;
  output: unknown;
}

export interface Logs {
  total: number;
  failed: number;
  calls: CallRecord[];
}

const BASE = "/__studio/api";

// The MCP server every request is about. The Studio works on one at a time.
let mcp = "";
export const setMcp = (id: string) => {
  mcp = id;
};
const address = (path: string) => `${BASE}${path}${mcp ? `${path.includes("?") ? "&" : "?"}mcp=${encodeURIComponent(mcp)}` : ""}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(address(path), init);
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
  return body;
}

const post = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  get chatUrl() {
    return address("/chat");
  },
  workspace: () => request<Workspace>("/workspace"),
  createMcp: (body: { name: string; description: string }) => post<{ id: string }>("/workspace/servers", body),
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
  describeTool: (name: string, description: string) => post<{ saved: boolean }>("/tools/describe", { name, description }),
  describeInput: (tool: string, field: string, description: string) => post<{ saved: boolean }>("/tools/describe-input", { tool, field, description }),
  describeServer: (body: { title: string; description: string }) => post<{ saved: boolean }>("/workspace/describe", body),
  tests: () => request<{ tests: SavedTest[] }>("/tests"),
  saveTest: (test: Partial<SavedTest> & { tool: string }) => post<{ test: SavedTest }>("/tests", test),
  removeTest: (id: string) => request<unknown>(`/tests?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  runTests: (ids?: string[]) => post<{ results: TestOutcome[] }>("/tests/run", ids ? { ids } : {}),
  ship: () => request<Ship>("/ship"),
  generate: (body: { description: string; view: boolean; provider: string; model: string }) =>
    post<{ name: string; files: string[] }>("/generate", body),
  file: (path: string) => request<{ path: string; content: string }>(`/file?path=${encodeURIComponent(path)}`),
  saveFile: (path: string, content: string) => post<{ saved: boolean; error: string | null }>("/file", { path, content }),
  logs: () => request<Logs>("/logs"),
  clearLogs: () => request<Logs>("/logs", { method: "DELETE" }),
  agents: () => request<{ agents: Agent[] }>("/agents"),
  saveAgent: (agent: Partial<Agent>) => post<{ agent: Agent }>("/agents", agent),
  removeAgent: (id: string) => request<unknown>(`/agents?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  agentCode: (id: string, save = false) =>
    request<{ path: string; code: string; saved: boolean }>(`/agents/code?id=${encodeURIComponent(id)}`, save ? { method: "POST" } : undefined),
};
