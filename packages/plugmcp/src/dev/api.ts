import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { hostHeaderValidation, originValidation } from "@modelcontextprotocol/node";
import type { PlugServer } from "../index.js";
import { slugify } from "../index.js";
import { DIRECTORY_URL, directoryPage, installSnippets, readmeBadge } from "../install.js";
import { connect, listModels, listTools, streamChat } from "./chat.js";
import type { RemoteServer, ToolInfo } from "./chat.js";
import { PROVIDERS, publicSettings, readSettings, writeSettings } from "./keys.js";
import type { ProviderId } from "./keys.js";
import { listViews } from "./project.js";
import type { Project } from "./project.js";

export interface ApiContext {
  project: Project;
  mcpUrl: () => string;
  loadServer: () => Promise<PlugServer>;
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

function addToolToProject(project: Project, input: { name: string; description: string; view: boolean }) {
  const name = input.name.trim();
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) {
    throw new Error("Use lowercase letters, numbers and underscores, starting with a letter. Example: search_orders");
  }
  const entryPath = join(project.root, project.entry);
  const source = readFileSync(entryPath, "utf8");
  if (new RegExp(`name:\\s*["'\`]${name}["'\`]`).test(source)) throw new Error(`A tool named ${name} already exists.`);
  const variable = /(?:const|let|var)\s+(\w+)\s*=\s*createServer\s*\(/.exec(source)?.[1];
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
    ``,
    ``,
  ].join("\n");
  const at = source.search(/^export default /m);
  const next = at === -1 ? `${source.trimEnd()}\n\n${block}` : `${source.slice(0, at)}${block}${source.slice(at)}`;
  writeFileSync(entryPath, next);
  const files = [project.entry];
  if (input.view) {
    if (!existsSync(project.viewsDir)) mkdirSync(project.viewsDir, { recursive: true });
    const viewPath = join(project.viewsDir, `${name}.tsx`);
    if (!existsSync(viewPath)) {
      writeFileSync(
        viewPath,
        [
          `import { useTool } from "plugmcp/view";`,
          ``,
          `export default function View() {`,
          `  const { output, isPending } = useTool<{ text: string }>();`,
          `  if (isPending) return <p>Loading</p>;`,
          `  return <p>{output?.text}</p>;`,
          `}`,
          ``,
        ].join("\n"),
      );
      files.push(`views/${name}.tsx`);
    }
  }
  return { files };
}

/** Handle one request under /__studio/api/. Returns false when the path is not ours. */
export async function handleApi(req: IncomingMessage, res: ServerResponse, context: ApiContext): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/__studio/api/")) return false;
  // Only this machine's own Studio page may use the API. Views run in a
  // sandboxed frame with a null origin and are refused here too.
  if (!checkHost(req, res) || !checkOrigin(req, res)) return true;
  const route = `${req.method} ${url.pathname.slice("/__studio/api".length)}`;
  const { project } = context;
  const local: RemoteServer = { name: "local", url: context.mcpUrl() };

  try {
    switch (route) {
      case "GET /info": {
        let server: PlugServer;
        try {
          server = await context.loadServer();
        } catch (error) {
          return json(res, 200, { ok: false, project: project.name, entry: project.entry, error: message(error) }), true;
        }
        const client = await connect(local);
        let tools: ToolInfo[];
        try {
          tools = await listTools(client, local, true);
        } finally {
          await client.close();
        }
        const views = listViews(project);
        const unused = Object.keys(views).filter((name) => !tools.some((tool) => tool.name === name));
        return (
          json(res, 200, {
            ok: true,
            project: project.name,
            entry: project.entry,
            name: server.info.name,
            title: server.info.title ?? null,
            description: server.info.description ?? null,
            version: server.info.version ?? "0.1.0",
            mcpUrl: context.mcpUrl(),
            tools: tools.map((tool) => ({ ...tool, viewFile: views[tool.name] ?? null })),
            unusedViews: unused.map((name) => views[name]),
          }),
          true
        );
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
        return json(res, 200, publicSettings(project.root)), true;
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
        return json(res, 200, publicSettings(project.root)), true;
      }
      case "GET /models": {
        const provider = url.searchParams.get("provider") as ProviderId;
        if (!(provider in PROVIDERS)) throw new Error("Unknown provider.");
        return json(res, 200, { models: await listModels(provider, project.root) }), true;
      }
      case "POST /chat": {
        const body = await readBody<Parameters<typeof streamChat>[1]>(req);
        if (!(body.provider in PROVIDERS)) throw new Error("Pick a provider first.");
        if (!body.model) throw new Error("Pick a model first.");
        const server = await context.loadServer();
        await streamChat(res, body, {
          root: project.root,
          instructions: server.info.instructions,
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
        return json(res, 200, addToolToProject(project, { name: body.name ?? "", description: body.description ?? "", view: body.view === true })), true;
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
