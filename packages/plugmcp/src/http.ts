import { createServer as createNodeServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { hostHeaderValidation, originValidation, toNodeHandler } from "@modelcontextprotocol/node";
import type { BuildOptions, PlugServer } from "./index.js";
import { landingPage } from "./landing.js";

export interface ServeHttpOptions extends BuildOptions {
  port?: number;
  /** Interface to bind. Defaults to 127.0.0.1; use 0.0.0.0 on a host. */
  host?: string;
  /**
   * Hostnames allowed in the Host and Origin headers. Defaults to localhost only.
   * Pass ["*"] when the server is public and sits behind your own auth or proxy.
   */
  allowedHosts?: string[];
  /** Show the HTML landing page on a browser GET of /mcp. Default true. */
  landing?: boolean;
}

export interface RunningServer {
  url: string;
  port: number;
  server: Server;
  close: () => Promise<void>;
}

export type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export interface HttpHandlerOptions extends Pick<ServeHttpOptions, "allowedHosts" | "landing"> {
  getViews?: () => BuildOptions["views"] | Promise<BuildOptions["views"]>;
}

const LOCAL = ["localhost", "127.0.0.1", "[::1]"];

/**
 * A node:http handler for the MCP endpoint. `getServer` is read on every
 * request, so `plugmcp dev` can swap in freshly reloaded code.
 */
export function createHttpHandler(
  getServer: () => PlugServer | Promise<PlugServer>,
  options: HttpHandlerOptions = {},
): NodeHandler {
  const open = options.allowedHosts?.includes("*") ?? false;
  const hosts = [...LOCAL, ...(options.allowedHosts ?? [])];
  const checkHost = hostHeaderValidation(hosts);
  const checkOrigin = originValidation(hosts);
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "content-type, accept, authorization, mcp-session-id, mcp-protocol-version, mcp-method, mcp-name",
    );
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (!open && (!checkHost(req, res) || !checkOrigin(req, res))) return;
    const server = await getServer();
    const wantsHtml = req.method === "GET" && (req.headers.accept ?? "").includes("text/html");
    if (wantsHtml && options.landing !== false) {
      const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
      const html = landingPage(server, `${proto}://${req.headers.host}/mcp`);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
      return;
    }
    const views = await options.getViews?.();
    const handler = createMcpHandler(() => server.build({ views }));
    await toNodeHandler(handler)(req, res);
  };
}

/** Serve a server over Streamable HTTP at /mcp. */
export async function serveHttp(server: PlugServer, options: ServeHttpOptions = {}): Promise<RunningServer> {
  const host = options.host ?? "127.0.0.1";
  const mcp = createHttpHandler(() => server, { ...options, getViews: () => options.views });
  const node = createNodeServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/mcp" || path === "/") return void mcp(req, res);
    if (path === "/health") {
      return void res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    }
    res.writeHead(404, { "content-type": "application/json" }).end('{"error":"Not found. The MCP endpoint is /mcp."}');
  });
  const port = await listen(node, options.port ?? Number(process.env.PORT ?? 3333), host);
  const shown = host === "0.0.0.0" || host === "::" ? "localhost" : host;
  return {
    url: `http://${shown}:${port}/mcp`,
    port,
    server: node,
    close: () => new Promise((resolve) => node.close(() => resolve())),
  };
}

/** Listen on `port`, moving up one at a time if it is taken. */
export function listen(server: Server, port: number, host: string, tries = 20): Promise<number> {
  return new Promise((resolve, reject) => {
    const attempt = (p: number, left: number) => {
      const onError = (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE" && left > 0) attempt(p + 1, left - 1);
        else reject(error);
      };
      server.once("error", onError);
      server.listen(p, host, () => {
        server.off("error", onError);
        resolve(p);
      });
    };
    attempt(port, tries);
  });
}
