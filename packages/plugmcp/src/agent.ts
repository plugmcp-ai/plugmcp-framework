import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { z } from "zod";
import { slugify, toToolResult } from "./index.js";
import type { PlugServer } from "./index.js";

/**
 * Use a PlugMCP server's tools inside the Claude Agent SDK, in the same
 * process and with no network hop:
 *
 *   import { query } from "@anthropic-ai/claude-agent-sdk";
 *   import { toAgentSdk } from "plugmcp/agent";
 *   import server from "./server.js";
 *
 *   const { mcpServers, allowedTools } = toAgentSdk(server);
 *   for await (const message of query({ prompt, options: { mcpServers, allowedTools } })) { ... }
 */
export function toAgentSdk(server: PlugServer) {
  const name = slugify(server.info.name);
  // Tools marked for views only are not for the model.
  const visible = [...server.tools.values()].filter(({ config }) => !config.visibility || config.visibility.includes("model"));
  const tools = visible.map(({ config, handler }) => {
    // The Agent SDK takes the fields of a Zod object, not the object itself.
    const shape = (config.input as z.ZodObject | undefined)?.shape ?? {};
    return tool(config.name, config.description ?? config.title ?? config.name, shape, async (args: unknown, extra: unknown) => {
      try {
        return toToolResult(await handler(args, extra)) as never;
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text }], isError: true } as never;
      }
    });
  });
  return {
    /** Pass as `options.mcpServers`. */
    mcpServers: { [name]: createSdkMcpServer({ name, version: server.info.version ?? "0.1.0", tools }) },
    /** Pass as `options.allowedTools` so the agent may call them without asking. */
    allowedTools: visible.map(({ config }) => config.name).map((toolName) => `mcp__${name}__${toolName}`),
  };
}
