import { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/server";
import type { z } from "zod";

/** Mime type MCP Apps hosts expect for a UI resource. */
export const VIEW_MIME_TYPE = "text/html;profile=mcp-app";

const MARK = Symbol.for("plugmcp.server");
const CALLS = Symbol.for("plugmcp.calls");

export interface ViewCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

export interface ViewOptions {
  /** Domains the view may reach. Omit for a view that only talks to its host. */
  csp?: ViewCsp;
  /** Ask the host to draw a border around the view. */
  prefersBorder?: boolean;
}

type Schema = z.ZodType;
type Infer<S> = S extends Schema ? z.infer<S> : Record<string, never>;

export interface ToolConfig<I extends Schema | undefined = undefined, O extends Schema | undefined = undefined> {
  name: string;
  title?: string;
  description?: string;
  /** Zod object schema for the arguments. The handler input is typed from it. */
  input?: I;
  /** Optional Zod object schema for the structured result. */
  output?: O;
  annotations?: ToolAnnotations;
  /** Options for the view at `views/<name>.tsx`, or `false` to ignore that file. */
  view?: ViewOptions | false;
}

export type ToolResult =
  | string
  | CallToolResult
  | Record<string, unknown>
  | unknown[]
  | number
  | boolean
  | null
  | undefined
  | void;

export type ToolHandler<I extends Schema | undefined> = (
  input: Infer<I>,
  ctx: unknown,
) => ToolResult | Promise<ToolResult>;

export interface RegisteredTool {
  config: ToolConfig<Schema | undefined, Schema | undefined>;
  handler: (input: unknown, ctx: unknown) => ToolResult | Promise<ToolResult>;
}

export interface ServerInfo {
  name: string;
  version?: string;
  title?: string;
  description?: string;
  /** Instructions sent to the model when a client connects. */
  instructions?: string;
  websiteUrl?: string;
}

/** HTML for one view, supplied by `plugmcp dev` or `plugmcp start`. */
export interface ViewSource {
  html: () => string | Promise<string>;
  csp?: ViewCsp;
}

export interface BuildOptions {
  views?: Record<string, ViewSource>;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "server"
  );
}

export function viewUri(serverName: string, toolName: string): string {
  return `ui://${slugify(serverName)}/${toolName}.html`;
}

/** Turn whatever a handler returned into an MCP tool result. */
export function toToolResult(value: ToolResult): CallToolResult {
  if (typeof value === "string") return { content: [{ type: "text", text: value }] };
  if (value === undefined || value === null) return { content: [{ type: "text", text: "Done." }] };
  if (typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { content?: unknown }).content)) {
    return value as CallToolResult;
  }
  const structured: Record<string, unknown> =
    typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : { result: value };
  return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
}

export class PlugServer {
  readonly [MARK] = true;
  readonly info: ServerInfo;
  readonly tools = new Map<string, RegisteredTool>();
  private extenders: Array<(server: McpServer) => void> = [];

  constructor(info: ServerInfo) {
    this.info = info;
  }

  /** Add a tool. Return a string, a plain object, or a full MCP result. */
  tool<I extends Schema | undefined = undefined, O extends Schema | undefined = undefined>(
    config: ToolConfig<I, O>,
    handler: ToolHandler<I>,
  ): this {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(config.name)) {
      throw new Error(`Tool name "${config.name}" must be 1-64 characters of letters, numbers, "_", "-" or ".".`);
    }
    if (this.tools.has(config.name)) throw new Error(`Tool "${config.name}" is defined twice.`);
    this.tools.set(config.name, {
      config: config as ToolConfig<Schema | undefined, Schema | undefined>,
      handler: handler as RegisteredTool["handler"],
    });
    return this;
  }

  /** Escape hatch: register prompts, resources or anything else on the underlying McpServer. */
  extend(fn: (server: McpServer) => void): this {
    this.extenders.push(fn);
    return this;
  }

  /** Create a fresh McpServer. Called once per HTTP request or stdio connection. */
  build(options: BuildOptions = {}): McpServer {
    const { name, version = "0.1.0", title, description, websiteUrl, instructions } = this.info;
    const server = new McpServer(
      {
        name,
        version,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(websiteUrl ? { websiteUrl } : {}),
      },
      instructions ? { instructions } : undefined,
    );
    for (const { config, handler } of this.tools.values()) {
      const view = config.view === false ? undefined : options.views?.[config.name];
      const viewOptions = config.view === false ? undefined : config.view;
      const uri = view ? viewUri(name, config.name) : undefined;
      const csp = viewOptions?.csp ?? view?.csp;
      if (view && uri) {
        const uiMeta = {
          ...(csp ? { csp } : {}),
          ...(viewOptions?.prefersBorder !== undefined ? { prefersBorder: viewOptions.prefersBorder } : {}),
        };
        server.registerResource(
          `${config.name}-view`,
          uri,
          { title: `${config.title ?? config.name} view`, mimeType: VIEW_MIME_TYPE },
          async () => ({
            contents: [{ uri, mimeType: VIEW_MIME_TYPE, text: await view.html(), _meta: { ui: uiMeta } }],
          }),
        );
      }
      const tool = {
        ...(config.title ? { title: config.title } : {}),
        ...(config.description ? { description: config.description } : {}),
        ...(config.input ? { inputSchema: config.input } : {}),
        ...(config.output ? { outputSchema: config.output } : {}),
        ...(config.annotations ? { annotations: config.annotations } : {}),
        ...(uri ? { _meta: { ui: { resourceUri: uri }, "openai/outputTemplate": uri } } : {}),
      };
      const run = async (input: unknown, ctx: unknown): Promise<CallToolResult> => {
        const started = performance.now();
        let result: CallToolResult;
        try {
          result = toToolResult(await handler(input, ctx));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result = { content: [{ type: "text", text: message }], isError: true };
        }
        // `plugmcp dev` listens here to show calls in the Studio. Nothing listens in production.
        const report = (globalThis as Record<symbol, unknown>)[CALLS] as ((entry: unknown) => void) | undefined;
        report?.({ server: this.info.name, tool: config.name, input, ms: Math.round(performance.now() - started), result });
        return result;
      };
      // The SDK passes the context alone when a tool has no input schema.
      const callback = config.input ? run : (ctx: unknown) => run({}, ctx);
      (server.registerTool as (name: string, config: unknown, cb: unknown) => unknown)(config.name, tool, callback);
    }
    for (const fn of this.extenders) fn(server);
    return server;
  }
}

export function createServer(info: ServerInfo): PlugServer {
  if (!info?.name) throw new Error("createServer needs a name.");
  return new PlugServer(info);
}

export function isPlugServer(value: unknown): value is PlugServer {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[MARK] === true;
}

export { serveHttp, createHttpHandler, type ServeHttpOptions, type RunningServer } from "./http.js";
export { serveStdio } from "./stdio.js";
export type { CallToolResult, ToolAnnotations, McpServer };
