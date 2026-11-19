import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, join } from "node:path";
import { hostHeaderValidation, originValidation } from "@modelcontextprotocol/node";
import type { PlugServer } from "../index.js";
import { slugify } from "../index.js";
import { DIRECTORY_URL, directoryPage, installSnippets, readmeBadge } from "../install.js";
import { dynamicTool, jsonSchema } from "ai";
import type { ToolSet } from "ai";
import { connect, listModels, listTools, resultForModel, streamChat } from "./chat.js";
import type { McpResult, RemoteServer, ToolInfo } from "./chat.js";
import { GUIDE, draftTool } from "./generate.js";
import { PROVIDERS, publicSettings, readSettings, writeSettings } from "./keys.js";
import type { ProviderId } from "./keys.js";
import { SERVER_ID, listViews } from "./project.js";
import type { Project } from "./project.js";
import { callLog, callsFor, clearCalls, readAgents, writeAgents } from "./store.js";
import type { Agent } from "./store.js";

/** Everything `plugmcp dev` serves: one or more MCP servers in one folder. */
export interface Hub {
  home: string;
  projects: () => Project[];
  /** Look at the folder again, after a server was added. */
  rescan: () => Project[];
  contextFor: (project: Project) => ApiContext;
}

export interface ApiContext {
  project: Project;
  mcpUrl: () => string;
  loadServer: () => Promise<PlugServer>;
  /** Load the server again from disk, ignoring anything cached. Throws when the file is broken. */
  reload: () => Promise<PlugServer>;
}

const LOCAL = ["localhost", "127.0.0.1", "[::1]"];
const checkHost = hostHeaderValidation(LOCAL);
const checkOrigin = originValidation(LOCAL);

const json = (res: ServerResponse, status: number, body: unknown) =>
  void res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));

async function readBody<T>(req: IncomingMessage): Promise<T> {
  if (!(req.headers["content-type"] ?? "").includes("application/json")) throw new Error("Send JSON.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 8 * 1024 * 1024) throw new Error("Request is too large.");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Servers added from the directory for this project's chat.
const serversFile = (project: Project) => join(project.root, ".plugmcp", "servers.json");

function readServers(project: Project): RemoteServer[] {
  try {
    return JSON.parse(readFileSync(serversFile(project), "utf8")) as RemoteServer[];
  } catch {
    return [];
  }
}

export function writeServers(project: Project, servers: RemoteServer[]): void {
  const dir = join(project.root, ".plugmcp");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(serversFile(project), JSON.stringify(servers, null, 2));
}

const directoryCache = new Map<string, { at: number; body: unknown }>();

/** Read the public PlugMCP directory. Answers are cached for five minutes. */
export async function directory(path: string): Promise<unknown> {
  const hit = directoryCache.get(path);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.body;
  const response = await fetch(`${DIRECTORY_URL}/api/v1${path}`, {
    headers: { accept: "application/json", "user-agent": "plugmcp-sdk" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`The PlugMCP directory answered ${response.status}.`);
  const body = (await response.json()) as unknown;
  directoryCache.set(path, { at: Date.now(), body });
  return body;
}

const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;

const serverVariable = (source: string) => /(?:const|let|var)\s+(\w+)\s*=\s*createServer\s*\(/.exec(source)?.[1];

/** Put a `server.tool(...)` statement into the server file, and a view file next to it when given. */
function writeTool(project: Project, tool: { name: string; block: string; view: string }) {
  if (!TOOL_NAME.test(tool.name)) {
    throw new Error("Use lowercase letters, numbers and underscores, starting with a letter. Example: search_orders");
  }
  const entryPath = join(project.root, project.entry);
  const source = readFileSync(entryPath, "utf8");
  if (new RegExp(`name:\\s*["'\`]${tool.name}["'\`]`).test(source)) throw new Error(`A tool named ${tool.name} already exists.`);
  const block = `${tool.block.trim()}\n\n`;
  const at = source.search(/^export default /m);
  writeFileSync(entryPath, at === -1 ? `${source.trimEnd()}\n\n${block}` : `${source.slice(0, at)}${block}${source.slice(at)}`);
  const files = [project.entry];
  let viewPath: string | null = null;
  if (tool.view) {
    if (!existsSync(project.viewsDir)) mkdirSync(project.viewsDir, { recursive: true });
    const path = join(project.viewsDir, `${tool.name}.tsx`);
    if (!existsSync(path)) {
      writeFileSync(path, `${tool.view.trim()}\n`);
      viewPath = path;
      files.push(`views/${tool.name}.tsx`);
    }
  }
  /** Put the project back the way it was. */
  const undo = () => {
    writeFileSync(entryPath, source);
    if (viewPath) rmSync(viewPath, { force: true });
  };
  return { files, undo };
}

function addToolToProject(project: Project, input: { name: string; description: string; view: boolean }) {
  const name = input.name.trim();
  const source = readFileSync(join(project.root, project.entry), "utf8");
  const variable = serverVariable(source);
  if (!variable) throw new Error(`Could not find "const server = createServer(...)" in ${project.entry}. Add the tool by hand.`);
  const description = input.description.trim() || "Describe what this tool does and when to use it.";
  const block = [
    `${variable}.tool(`,
    `  {`,
    `    name: ${JSON.stringify(name)},`,
    `    description: ${JSON.stringify(description)},`,
    `    input: z.object({ text: z.string().describe("Replace with your own fields") }),`,
    `  },`,
    `  async ({ text }) => {`,
    `    return { text };`,
    `  },`,
    `);`,
  ].join("\n");
  const view = input.view
    ? [
        `import { useTool } from "plugmcp/view";`,
        ``,
        `export default function View() {`,
        `  const { output, isPending } = useTool<{ text: string }>();`,
        `  if (isPending) return <p>Loading</p>;`,
        `  return <p>{output?.text}</p>;`,
        `}`,
      ].join("\n")
    : "";
  return { files: writeTool(project, { name, block, view }).files };
}

/** Files the Studio may read and write: the server file, the views and exported agents. */
function editable(project: Project, path: string): string {
  const ok = path === project.entry || /^views\/[A-Za-z0-9_.-]+\.(tsx|jsx)$/.test(path) || /^agents\/[a-z0-9-]+\.ts$/.test(path);
  if (!ok || path.includes("..")) throw new Error("The Studio can only open the server file, views and agents.");
  return join(project.root, path);
}

const agentId = (name: string) => slugify(name).slice(0, 40);

const text = { type: "string" } as const;

/** Tools that let the Studio chat write tools and views into the project, and the prompt that explains them. */
function builder(context: ApiContext, local: RemoteServer): { tools: ToolSet; system: string } {
  const { project } = context;
  const source = readFileSync(join(project.root, project.entry), "utf8");
  const variable = serverVariable(source) ?? "server";
  const views = Object.values(listViews(project));

  /** Write, load the server again, and put things back when the new code does not load. */
  const settle = async (undo: () => void) => {
    try {
      await context.reload();
    } catch (error) {
      undo();
      await context.reload().catch(() => undefined);
      throw new Error(`That code does not load, so nothing was changed. Fix it and call the tool again. (${message(error)})`);
    }
  };

  const tools: ToolSet = {
    studio_add_tool: dynamicTool({
      description: "Add a new tool to the user's MCP server, with an optional view. The tool is live as soon as this returns.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          name: { ...text, description: "Tool name: lowercase letters, numbers and underscores" },
          tool: { ...text, description: `One complete ${variable}.tool(...) statement, no imports` },
          view: { ...text, description: "The complete view file, or an empty string for no view" },
        },
        required: ["name", "tool"],
      }),
      execute: async (input) => {
        const draft = input as { name: string; tool: string; view?: string };
        if (typeof draft.tool !== "string" || !/\.tool\s*\(/.test(draft.tool)) throw new Error(`"tool" must be one ${variable}.tool(...) statement.`);
        if (/^\s*import\s/m.test(draft.tool)) throw new Error("Do not put import statements in the tool. z and fetch are already available.");
        const written = writeTool(project, { name: String(draft.name ?? "").trim(), block: draft.tool, view: draft.view ?? "" });
        await settle(written.undo);
        return { added: draft.name, files: written.files, next: "Call studio_try_tool with realistic arguments so the user sees it work." };
      },
    }),
    studio_read_file: dynamicTool({
      description: `Read a project file: ${project.entry} or a view such as views/get_weather.tsx.`,
      inputSchema: jsonSchema({ type: "object", properties: { path: text }, required: ["path"] }),
      execute: async (input) => {
        const { path } = input as { path: string };
        const file = editable(project, path);
        if (!existsSync(file)) throw new Error(`${path} does not exist.`);
        return { path, content: readFileSync(file, "utf8") };
      },
    }),
    studio_write_file: dynamicTool({
      description: `Replace a whole project file, to change or fix an existing tool or view. Allowed: ${project.entry} and views/<tool_name>.tsx. Send the complete new content.`,
      inputSchema: jsonSchema({ type: "object", properties: { path: text, content: text }, required: ["path", "content"] }),
      execute: async (input) => {
        const { path, content } = input as { path: string; content: string };
        const file = editable(project, path);
        if (typeof content !== "string" || !content.trim()) throw new Error("Send the complete file content.");
        const before = existsSync(file) ? readFileSync(file, "utf8") : null;
        if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
        await settle(() => (before === null ? rmSync(file, { force: true }) : writeFileSync(file, before)));
        return { saved: path };
      },
    }),
    studio_try_tool: dynamicTool({
      description: "Call any tool on the user's server by name, including one you just added. Its view is shown to the user in the chat.",
      inputSchema: jsonSchema({
        type: "object",
        properties: { name: text, arguments: { type: "object", description: "The tool's input", additionalProperties: true } },
        required: ["name"],
      }),
      execute: async (input) => {
        const call = input as { name: string; arguments?: Record<string, unknown> };
        const client = await connect(local);
        try {
          return (await client.callTool({ name: call.name, arguments: call.arguments ?? {} })) as McpResult;
        } finally {
          await client.close();
        }
      },
      toModelOutput: ({ output }) => resultForModel(output as McpResult),
    }),
  };

  const system = [
    `You are the assistant inside PlugMCP Studio, working on the user's own MCP server on their machine. It is built with the "plugmcp" TypeScript SDK.`,
    `What things are:\n- An MCP server is a named set of tools behind one address. This chat works on one server, the one described below.\n- A tool is one function a model can call: a name, a description, an input schema and a handler that returns data.\n- An MCP app is a tool that also has a view: a small React page shown inside the chat that draws the tool's result and can call tools back. A server and an app are built the same way; the app just adds a view file.\n- A new, separate MCP server is made with the "New MCP server" button in the Studio, not from this chat. If the user asks for a whole new server, say so in one sentence and offer to add the tools to this one.`,
    `You can build. When the user asks for a tool, an MCP app, a widget, a view or a change to one, do the work yourself with the studio_ tools. Never answer with setup steps, npm commands or code for the user to paste: the project already exists and is running.`,
    `How to build:\n- New tool or app: call studio_add_tool with the tool and, when the result is worth looking at, a view. An "MCP app" means a tool with a view.\n- Then call studio_try_tool with realistic arguments so the user sees it working in the chat.\n- If it fails or looks wrong, read the file with studio_read_file, fix it with studio_write_file and try again.\n- To change an existing tool or view, read the file first, then write the whole file back with the change.\n- Finish with two or three plain sentences: what you built and what the user can ask next. Do not paste the code.`,
    GUIDE,
    `The server variable is named "${variable}". The server file is ${project.entry}. Views are in views/<tool_name>.tsx${views.length ? `; existing: ${views.join(", ")}` : ""}.`,
    `${project.entry} now:\n\n${source.slice(0, 16_000)}`,
  ].join("\n\n");
  return { tools, system };
}

/** A runnable Claude Agent SDK script for an agent made in the Studio. */
function agentCode(agent: Agent, project: Project, serverName: string, remote: RemoteServer[]): string {
  const local = slugify(serverName);
  const entry = `../${project.entry.replace(/\.(ts|tsx)$/, ".js")}`;
  const used = remote.filter((server) => agent.tools === null || agent.tools.some((id) => id.startsWith(`${server.name}__`)));
  const allowed =
    agent.tools === null
      ? null
      : agent.tools.map((id) => {
          const cut = id.indexOf("__");
          return cut === -1 ? `mcp__${local}__${id}` : `mcp__${id.slice(0, cut)}__${id.slice(cut + 2)}`;
        });
  const lines = [
    `// ${agent.name}. Made in PlugMCP Studio.`,
    `//`,
    `//   ANTHROPIC_API_KEY=... npx tsx agents/${agent.id}.ts "your message"`,
    ``,
    `import { query } from "@anthropic-ai/claude-agent-sdk";`,
    `import { toAgentSdk } from "plugmcp/agent";`,
    `import server from ${JSON.stringify(entry)};`,
    ``,
    `// The tools from ${project.entry} run inside this process. No server to start.`,
    `const local = toAgentSdk(server);`,
    ``,
    `const prompt = process.argv.slice(2).join(" ") || ${JSON.stringify(agent.starters?.[0] ?? "Hello. What can you do?")};`,
    ``,
    `for await (const message of query({`,
    `  prompt,`,
    `  options: {`,
    `    systemPrompt: ${JSON.stringify(agent.instructions)},`,
    ...(agent.provider === "anthropic" && agent.model ? [`    model: ${JSON.stringify(agent.model)},`] : []),
    `    mcpServers: {`,
    `      ...local.mcpServers,`,
    ...used.map((server) => `      ${JSON.stringify(server.name)}: { type: "http", url: ${JSON.stringify(server.url)} },`),
    `    },`,
    allowed
      ? `    allowedTools: ${JSON.stringify(allowed)},`
      : `    allowedTools: [...local.allowedTools${used.map((server) => `, ${JSON.stringify(`mcp__${server.name}`)}`).join("")}],`,
    `    tools: [], // only the tools above, none of the built-in file or shell tools`,
    `  },`,
    `})) {`,
    `  if (message.type !== "assistant") continue;`,
    `  for (const block of message.message.content) {`,
    `    if (block.type === "text") console.log(block.text);`,
    `    if (block.type === "tool_use") console.log(\`[tool] \${block.name} \${JSON.stringify(block.input)}\`);`,
    `  }`,
    `}`,
    ``,
  ];
  return lines.join("\n");
}

/** What the Studio shows about one MCP server: its details and its tools. */
async function describe(context: ApiContext) {
  const { project } = context;
  const base = { id: project.id, project: project.name, entry: project.entry, file: `${project.rel}${project.entry}`, mcpUrl: context.mcpUrl() };
  let server: PlugServer;
  try {
    server = await context.loadServer();
  } catch (error) {
    return { ...base, ok: false as const, error: message(error) };
  }
  const local: RemoteServer = { name: "local", url: context.mcpUrl() };
  const client = await connect(local);
  let tools: ToolInfo[];
  try {
    tools = await listTools(client, local, true);
  } finally {
    await client.close();
  }
  const views = listViews(project);
  const unused = Object.keys(views).filter((name) => !tools.some((tool) => tool.name === name));
  const count = callsFor(server.info.name);
  return {
    ...base,
    ok: true as const,
    name: server.info.name,
    title: server.info.title ?? null,
    description: server.info.description ?? null,
    version: server.info.version ?? "0.1.0",
    tools: tools.map((tool) => ({ ...tool, viewFile: views[tool.name] ?? null })),
    unusedViews: unused.map((name) => views[name]),
    instructions: server.info.instructions ?? null,
    calls: count.total,
    failed: count.failed,
  };
}

/** Start a new, empty MCP server in servers/<id>/. */
function createMcp(home: string, input: { name?: string; description?: string }): string {
  const title = (input.name ?? "").trim();
  if (!title) throw new Error("Give the MCP server a name.");
  const id = slugify(title).slice(0, 40).replace(/-+$/, "");
  if (!SERVER_ID.test(id) || id === "main") throw new Error("Use letters and numbers in the name.");
  const dir = join(home, "servers", id);
  if (existsSync(dir)) throw new Error(`An MCP server named ${id} already exists.`);
  const description = (input.description ?? "").trim();
  mkdirSync(join(dir, "views"), { recursive: true });
  writeFileSync(
    join(dir, "server.ts"),
    [
      `import { createServer } from "plugmcp";`,
      `import { z } from "zod";`,
      ``,
      `const server = createServer({`,
      `  name: ${JSON.stringify(id)},`,
      ...(title !== id ? [`  title: ${JSON.stringify(title)},`] : []),
      ...(description ? [`  description: ${JSON.stringify(description)},`] : []),
      `});`,
      ``,
      `// Tools go here. Add them in the Studio, or write server.tool(...) yourself.`,
      ``,
      `export default server;`,
      ``,
    ].join("\n"),
  );
  return id;
}

/** Handle one request under /__studio/api/. Returns false when the path is not ours. */
export async function handleApi(req: IncomingMessage, res: ServerResponse, hub: Hub): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/__studio/api/")) return false;
  // Only this machine's own Studio page may use the API. Views run in a
  // sandboxed frame with a null origin and are refused here too.
  if (!checkHost(req, res) || !checkOrigin(req, res)) return true;
  const route = `${req.method} ${url.pathname.slice("/__studio/api".length)}`;
  const projects = hub.projects();
  // Every request names the MCP server it is about. Without a name it is the first one.
  const picked = projects.find((item) => item.id === url.searchParams.get("mcp")) ?? projects[0];
  if (!picked) return json(res, 500, { error: "No MCP server in this folder." }), true;
  const context = hub.contextFor(picked);
  const { project } = context;
  const local: RemoteServer = { name: "local", url: context.mcpUrl() };

  try {
    switch (route) {
      case "GET /info":
        return json(res, 200, await describe(context)), true;
      case "GET /workspace": {
        // Look again each time, so a server folder added or removed by hand shows up.
        const servers = await Promise.all(hub.rescan().map((item) => describe(hub.contextFor(item))));
        return json(res, 200, { name: basename(hub.home), servers }), true;
      }
      case "POST /workspace/servers": {
        const id = createMcp(hub.home, await readBody<{ name?: string; description?: string }>(req));
        const made = hub.rescan().find((item) => item.id === id);
        if (!made) throw new Error("The new server was written but could not be found. Restart plugmcp dev.");
        await hub.contextFor(made).loadServer();
        return json(res, 200, { id }), true;
      }
      case "POST /call": {
        const body = await readBody<{ server?: string; name: string; arguments?: Record<string, unknown> }>(req);
        const target = body.server && body.server !== "local" ? readServers(project).find((s) => s.name === body.server) : local;
        if (!target) throw new Error(`No server named ${body.server}.`);
        const client = await connect(target);
        try {
          const started = performance.now();
          const result = await client.callTool({ name: body.name, arguments: body.arguments ?? {} });
          return json(res, 200, { result, ms: Math.round(performance.now() - started) }), true;
        } finally {
          await client.close();
        }
      }
      case "GET /view": {
        const uri = url.searchParams.get("uri") ?? "";
        const serverName = url.searchParams.get("server") ?? "local";
        const target = serverName === "local" ? local : readServers(project).find((s) => s.name === serverName);
        if (!target || !uri.startsWith("ui://")) throw new Error("Unknown view.");
        const client = await connect(target);
        try {
          const { contents } = await client.readResource({ uri });
          const first = contents[0] as { text?: string; _meta?: { ui?: { csp?: unknown } } } | undefined;
          return json(res, 200, { html: first?.text ?? "", csp: first?._meta?.ui?.csp ?? null }), true;
        } finally {
          await client.close();
        }
      }
      case "GET /settings":
        return json(res, 200, publicSettings(project.home)), true;
      case "POST /settings": {
        const body = await readBody<{ provider?: ProviderId; model?: string; key?: string | null; customBaseUrl?: string }>(req);
        const settings = readSettings();
        if (body.provider && !(body.provider in PROVIDERS)) throw new Error("Unknown provider.");
        if (body.provider) settings.provider = body.provider;
        if (body.provider && body.model !== undefined) settings.models[body.provider] = body.model;
        if (body.provider && body.key === null) delete settings.keys[body.provider];
        if (body.provider && typeof body.key === "string" && body.key.trim()) settings.keys[body.provider] = body.key.trim();
        if (body.customBaseUrl !== undefined) settings.customBaseUrl = body.customBaseUrl.trim() || undefined;
        writeSettings(settings);
        return json(res, 200, publicSettings(project.home)), true;
      }
      case "GET /models": {
        const provider = url.searchParams.get("provider") as ProviderId;
        if (!(provider in PROVIDERS)) throw new Error("Unknown provider.");
        return json(res, 200, { models: await listModels(provider, project.home) }), true;
      }
      case "POST /chat": {
        const body = await readBody<Parameters<typeof streamChat>[1] & { agent?: string; tools?: string[] | null; instructions?: string; build?: boolean }>(req);
        // An agent brings its own prompt, model and tools. A draft agent sends them in the request.
        const agent = body.agent ? readAgents(project).find((item) => item.id === body.agent) : undefined;
        if (agent?.provider && agent.model && !body.instructions) {
          body.provider = agent.provider;
          body.model = agent.model;
        }
        if (!(body.provider in PROVIDERS)) throw new Error("Pick a provider first.");
        if (!body.model) throw new Error("Pick a model first.");
        const server = await context.loadServer();
        // The plain playground chat can also write tools. An agent only uses them.
        const build = body.build === true && !agent ? builder(context, local) : null;
        const instructions = body.instructions?.trim() || agent?.instructions || server.info.instructions;
        await streamChat(res, body, {
          root: project.home,
          instructions: build ? [build.system, instructions ? `Instructions for this chat, from the user:\n${instructions}` : ""].filter(Boolean).join("\n\n") : instructions,
          extra: build?.tools,
          allow: body.tools !== undefined ? body.tools : (agent?.tools ?? null),
          servers: [{ server: local, local: true }, ...readServers(project).map((s) => ({ server: s, local: false }))],
        });
        return true;
      }
      case "GET /servers": {
        const servers = readServers(project);
        const withTools = await Promise.all(
          servers.map(async (server) => {
            try {
              const client = await connect(server);
              try {
                return { ...server, headers: undefined, ok: true, tools: await listTools(client, server, false) };
              } finally {
                await client.close();
              }
            } catch (error) {
              return { ...server, headers: undefined, ok: false, error: message(error), tools: [] };
            }
          }),
        );
        return json(res, 200, { servers: withTools }), true;
      }
      case "POST /servers": {
        const body = await readBody<{ slug?: string; name?: string; url?: string }>(req);
        let entry: RemoteServer;
        if (body.slug) {
          const record = (await directory(`/servers/${encodeURIComponent(body.slug)}`)) as { name: string; remote_url?: string | null };
          if (!record.remote_url) throw new Error("This server has no hosted address, so it cannot be added to the chat. Open its page for install steps.");
          entry = { name: slugify(record.name).slice(0, 32), url: record.remote_url, slug: body.slug };
        } else if (body.url && /^https?:\/\//.test(body.url)) {
          entry = { name: slugify(body.name ?? new URL(body.url).hostname).slice(0, 32), url: body.url };
        } else {
          throw new Error("Give a directory slug or an http address.");
        }
        const client = await connect(entry).catch((error: unknown) => {
          throw new Error(`Could not connect to ${entry.url}. It may need sign-in. (${message(error)})`);
        });
        await client.close();
        const servers = readServers(project).filter((s) => s.name !== entry.name);
        writeServers(project, [...servers, entry]);
        return json(res, 200, { added: entry.name }), true;
      }
      case "DELETE /servers": {
        const name = url.searchParams.get("name");
        writeServers(project, readServers(project).filter((s) => s.name !== name));
        return json(res, 200, { removed: name }), true;
      }
      case "GET /directory": {
        const params = new URLSearchParams({ q: url.searchParams.get("q") ?? "" });
        if (url.searchParams.get("remote") === "1") params.set("remote", "1");
        if (url.searchParams.get("page")) params.set("page", url.searchParams.get("page") as string);
        return json(res, 200, await directory(`/servers?${params}`)), true;
      }
      case "POST /tools": {
        const body = await readBody<{ name: string; description?: string; view?: boolean }>(req);
        const added = addToolToProject(project, { name: body.name ?? "", description: body.description ?? "", view: body.view === true });
        // Load the new code now. Waiting for the file watcher can leave the old tool list in place for a moment.
        await context.reload().catch(() => undefined);
        return json(res, 200, added), true;
      }
      case "POST /tools/describe": {
        const body = await readBody<{ name?: string; description?: string }>(req);
        const name = body.name ?? "";
        const description = (body.description ?? "").trim();
        if (!TOOL_NAME.test(name)) throw new Error("Unknown tool.");
        if (!description) throw new Error("Write a description.");
        const entryPath = join(project.root, project.entry);
        const source = readFileSync(entryPath, "utf8");
        const start = new RegExp(`name:\\s*["'\`]${name}["'\`]`).exec(source);
        if (!start) throw new Error(`Could not find ${name} in ${project.entry}.`);
        // Look only inside this tool's own options, up to the next tool.
        const rest = source.slice(start.index);
        const next = rest.slice(1).search(/\.tool\s*\(/);
        const own = next === -1 ? rest : rest.slice(0, next + 1);
        const found = /description:\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\$]|\\.)*`)/.exec(own);
        if (!found) throw new Error(`The description of ${name} is not a plain string. Change it on the Code tab.`);
        const at = start.index + found.index;
        writeFileSync(entryPath, `${source.slice(0, at)}description: ${JSON.stringify(description)}${source.slice(at + found[0].length)}`);
        try {
          await context.reload();
        } catch (error) {
          writeFileSync(entryPath, source);
          await context.reload().catch(() => undefined);
          throw new Error(`That did not load, so nothing was changed. (${message(error)})`);
        }
        return json(res, 200, { saved: true }), true;
      }
      case "POST /generate": {
        const body = await readBody<{ description?: string; view?: boolean; provider?: ProviderId; model?: string }>(req);
        if (!body.description?.trim()) throw new Error("Say what the tool should do.");
        if (!body.provider || !(body.provider in PROVIDERS) || !body.model) throw new Error("Choose a model first, in Settings.");
        const source = readFileSync(join(project.root, project.entry), "utf8");
        const variable = serverVariable(source);
        if (!variable) throw new Error(`Could not find "const server = createServer(...)" in ${project.entry}.`);
        const draft = await draftTool({
          root: project.home,
          provider: body.provider,
          model: body.model,
          description: body.description.trim(),
          wantView: body.view !== false,
          variable,
          source,
        });
        const written = writeTool(project, { name: draft.name, block: draft.tool, view: draft.view });
        try {
          await context.reload();
        } catch (error) {
          // Never leave the project broken by code the user did not write.
          written.undo();
          await context.reload().catch(() => undefined);
          throw new Error(`The model wrote code that does not load, so nothing was changed. Try again. (${message(error)})`);
        }
        return json(res, 200, { name: draft.name, files: written.files }), true;
      }
      case "GET /file": {
        const path = url.searchParams.get("path") ?? "";
        const file = editable(project, path);
        return json(res, 200, { path, content: existsSync(file) ? readFileSync(file, "utf8") : "" }), true;
      }
      case "POST /file": {
        const body = await readBody<{ path?: string; content?: string }>(req);
        const file = editable(project, body.path ?? "");
        if (typeof body.content !== "string") throw new Error("Nothing to save.");
        if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, body.content);
        if (body.path !== project.entry) return json(res, 200, { saved: true, error: null }), true;
        // Say right away when the server file no longer loads.
        const error = await context.reload().then(
          () => null,
          (cause: unknown) => message(cause),
        );
        return json(res, 200, { saved: true, error }), true;
      }
      case "GET /logs":
        return json(res, 200, callLog()), true;
      case "DELETE /logs":
        return clearCalls(), json(res, 200, callLog()), true;
      case "GET /agents":
        return json(res, 200, { agents: readAgents(project) }), true;
      case "POST /agents": {
        const body = await readBody<Partial<Agent>>(req);
        const name = (body.name ?? "").trim();
        if (!name) throw new Error("Give the agent a name.");
        const agents = readAgents(project);
        const known = Boolean(body.id && agents.some((item) => item.id === body.id));
        const id = known ? (body.id as string) : agentId(name);
        if (!known && agents.some((item) => item.id === id)) throw new Error(`An agent named ${name} already exists.`);
        const agent: Agent = {
          id,
          name,
          description: body.description?.trim() || undefined,
          instructions: (body.instructions ?? "").trim(),
          provider: body.provider && body.provider in PROVIDERS ? body.provider : undefined,
          model: body.model || undefined,
          tools: Array.isArray(body.tools) ? body.tools : null,
          starters: (body.starters ?? []).map((text) => text.trim()).filter(Boolean).slice(0, 4),
        };
        writeAgents(project, known ? agents.map((item) => (item.id === id ? agent : item)) : [...agents, agent]);
        return json(res, 200, { agent }), true;
      }
      case "DELETE /agents": {
        const id = url.searchParams.get("id");
        writeAgents(project, readAgents(project).filter((item) => item.id !== id));
        return json(res, 200, { removed: id }), true;
      }
      case "GET /agents/code":
      case "POST /agents/code": {
        const id = url.searchParams.get("id");
        const agent = readAgents(project).find((item) => item.id === id);
        if (!agent) throw new Error("No such agent. Save it first.");
        const server = await context.loadServer();
        const code = agentCode(agent, project, server.info.name, readServers(project));
        const path = `agents/${agent.id}.ts`;
        if (req.method === "POST") {
          const file = editable(project, path);
          if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, code);
        }
        return json(res, 200, { path, code, saved: req.method === "POST" }), true;
      }
      case "GET /ship": {
        const server = await context.loadServer();
        const slug = slugify(server.info.name);
        return (
          json(res, 200, {
            name: server.info.name,
            slug,
            snippets: installSnippets(slug, context.mcpUrl().replace("127.0.0.1", "localhost")),
            badge: readmeBadge(slug),
            directoryPage: directoryPage(slug),
            submitUrl: `${DIRECTORY_URL}/mcp/submit`,
            hostUrl: `${DIRECTORY_URL}/app`,
          }),
          true
        );
      }
      default:
        return json(res, 404, { error: "Unknown Studio route." }), true;
    }
  } catch (error) {
    if (!res.headersSent) json(res, 400, { error: message(error) });
    else res.end();
    return true;
  }
}
