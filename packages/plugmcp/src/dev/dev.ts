import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer as createNodeServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";
import { createHttpHandler, listen } from "../http.js";
import { isPlugServer } from "../index.js";
import type { BuildOptions, PlugServer } from "../index.js";
import { handleApi } from "./api.js";
import { listViews, resolveWorkspace } from "./project.js";
import type { Project } from "./project.js";
import { listenForCalls } from "./store.js";
import { viewEntryPlugin, viewShell } from "./views.js";

export interface DevOptions {
  root: string;
  entry?: string;
  port?: number;
  /** Serve the Studio. Default true. */
  studio?: boolean;
}

export interface DevServer {
  port: number;
  url: string;
  mcpUrl: string;
  /** Every MCP server in the folder and where it answers. */
  servers: Array<{ id: string; mcpUrl: string }>;
  readyMs: number;
  close: () => Promise<void>;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

/** The prebuilt Studio that ships inside this package. */
export function studioDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "studio-dist");
}

export async function startDev(options: DevOptions): Promise<DevServer> {
  const started = performance.now();
  let projects = resolveWorkspace(options.root, options.entry);
  const home = options.root;
  // Views of every server share one dev server. A view outside the main server is "<server>~<tool>".
  const viewKey = (project: Project, tool: string) => (project.rel ? `${project.id}~${tool}` : tool);
  const allViews = () => {
    const all: Record<string, string> = {};
    for (const project of projects) {
      for (const [tool, file] of Object.entries(listViews(project))) all[viewKey(project, tool)] = `${project.rel}${file}`;
    }
    return all;
  };
  const node = createNodeServer();
  let port = options.port ?? 3333;
  const origin = () => `http://127.0.0.1:${port}`;

  const vite = await createViteServer({
    root: home,
    configFile: false,
    appType: "custom",
    logLevel: "warn",
    clearScreen: false,
    plugins: [react(), viewEntryPlugin(allViews)],
    server: {
      middlewareMode: true,
      hmr: { server: node },
      // Views run in a sandboxed frame with a null origin and load their code from here.
      cors: { origin: true },
    },
    optimizeDeps: {
      entries: ["views/*.tsx", "views/*.jsx", "servers/*/views/*.tsx", "servers/*/views/*.jsx"],
      include: ["react", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
    ssr: { external: ["plugmcp"] },
  });

  const loadServer = async (project: Project): Promise<PlugServer> => {
    const module = (await vite.ssrLoadModule(`/${project.rel}${project.entry}`)) as { default?: unknown; server?: unknown };
    const server = module.default ?? module.server;
    if (!isPlugServer(server)) {
      throw new Error(`${project.rel}${project.entry} must default-export the server: "export default server".`);
    }
    return server;
  };

  const reload = async (project: Project): Promise<PlugServer> => {
    vite.moduleGraph.invalidateAll();
    return loadServer(project);
  };
  listenForCalls();

  // In dev a view is a small page that loads its code from this server, so edits hot reload.
  const getViews = (project: Project): BuildOptions["views"] => {
    const views: NonNullable<BuildOptions["views"]> = {};
    for (const tool of Object.keys(listViews(project))) {
      const key = viewKey(project, tool);
      views[tool] = {
        csp: { connectDomains: [origin(), origin().replace("http", "ws")], resourceDomains: [origin()] },
        html: async () => {
          const html = await vite.transformIndexHtml(`/__view/${key}.html`, viewShell(key));
          return html.replace(/(src=|from\s*|import\s*)(["'])\/(?!\/)/g, `$1$2${origin()}/`);
        },
      };
    }
    return views;
  };

  // One MCP endpoint per server: /mcp for the main one, /mcp/<id> for the others.
  const handlers = new Map<string, ReturnType<typeof createHttpHandler>>();
  const handlerFor = (project: Project) => {
    let handler = handlers.get(project.id);
    if (!handler) {
      handler = createHttpHandler(() => loadServer(project), { getViews: () => getViews(project) });
      handlers.set(project.id, handler);
    }
    return handler;
  };
  const hub = {
    home,
    projects: () => projects,
    rescan: () => {
      projects = resolveWorkspace(options.root, options.entry);
      return projects;
    },
    contextFor: (project: Project) => ({
      project,
      mcpUrl: () => `${origin()}${project.mount}`,
      loadServer: () => loadServer(project),
      reload: () => reload(project),
    }),
  };
  const studio = studioDir();
  const hasStudio = options.studio !== false && existsSync(join(studio, "index.html"));

  const sendFile = (res: import("node:http").ServerResponse, file: string, cache: boolean) => {
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": cache ? "public, max-age=31536000, immutable" : "no-store",
    });
    res.end(readFileSync(file));
  };

  node.on("request", (req, res) => {
    void (async () => {
      const path = (req.url ?? "/").split("?")[0] ?? "/";
      try {
        const target = path === "/mcp" || path.startsWith("/mcp/") ? projects.find((project) => project.mount === path) : undefined;
        if (target) {
          try {
            await handlerFor(target)(req, res);
          } catch (error) {
            // Usually a syntax error in the server file. Say so in MCP terms.
            vite.ssrFixStacktrace(error as Error);
            const text = error instanceof Error ? error.message : String(error);
            if (!res.headersSent) {
              res.writeHead(500, { "content-type": "application/json" });
              res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: text } }));
            }
          }
          return;
        }
        if (await handleApi(req, res, hub)) return;
        if (hasStudio && path.startsWith("/__studio/")) {
          const file = normalize(join(studio, path.slice("/__studio/".length)));
          if (file.startsWith(studio) && existsSync(file) && statSync(file).isFile()) return sendFile(res, file, true);
          res.writeHead(404).end();
          return;
        }
        if (path === "/" || path === "/index.html") {
          if (hasStudio) return sendFile(res, join(studio, "index.html"), false);
          res.writeHead(302, { location: projects[0]?.mount ?? "/mcp" }).end();
          return;
        }
        vite.middlewares(req, res, () => {
          res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
        });
      } catch (error) {
        if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
        res.end(error instanceof Error ? error.message : String(error));
      }
    })();
  });

  port = await listen(node, port, "127.0.0.1");
  // Load the server once now so the first request is fast and errors show at start.
  for (const project of projects) {
    await loadServer(project).catch((error: unknown) => {
      console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
    });
  }

  return {
    port,
    url: `http://localhost:${port}`,
    mcpUrl: `${origin()}${projects[0]?.mount ?? "/mcp"}`,
    servers: projects.map((project) => ({ id: project.id, mcpUrl: `http://localhost:${port}${project.mount}` })),
    readyMs: Math.round(performance.now() - started),
    close: async () => {
      await vite.close();
      await new Promise<void>((resolve) => node.close(() => resolve()));
    },
  };
}
