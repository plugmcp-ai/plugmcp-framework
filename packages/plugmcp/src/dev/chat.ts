import type { ServerResponse } from "node:http";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { convertToModelMessages, dynamicTool, isStepCount, jsonSchema, streamText } from "ai";
import type { LanguageModel, ToolSet, UIMessage } from "ai";
import { PROVIDERS, readSettings, resolveKey } from "./keys.js";
import type { ProviderId } from "./keys.js";
import { recordCall } from "./store.js";

export interface RemoteServer {
  name: string;
  url: string;
  headers?: Record<string, string>;
  /** Directory slug, when it was added from the PlugMCP directory. */
  slug?: string;
}

export interface ToolInfo {
  /** Name the model sees. */
  id: string;
  name: string;
  server: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  /** ui:// address of the tool's view, if it has one. */
  view: string | null;
  local: boolean;
}

export async function connect(server: RemoteServer): Promise<Client> {
  const client = new Client({ name: "plugmcp-studio", version: "0.1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(server.url), server.headers ? { requestInit: { headers: server.headers } } : undefined),
  );
  return client;
}

const safe = (text: string) => text.replace(/[^A-Za-z0-9_-]/g, "_");

export async function listTools(client: Client, server: RemoteServer, local: boolean): Promise<ToolInfo[]> {
  const { tools } = await client.listTools();
  return tools.map((tool) => {
    const meta = tool._meta as { ui?: { resourceUri?: string }; "ui/resourceUri"?: string } | undefined;
    return {
      id: local ? tool.name : `${safe(server.name)}__${safe(tool.name)}`.slice(0, 64),
      name: tool.name,
      server: server.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
      view: meta?.ui?.resourceUri ?? meta?.["ui/resourceUri"] ?? null,
      local,
    };
  });
}

const BASE_URLS = { openrouter: "https://openrouter.ai/api/v1", ollama: "http://localhost:11434/v1" };

export function createModel(provider: ProviderId, model: string, key: string | undefined, customBaseUrl: string | undefined): LanguageModel {
  if (PROVIDERS[provider].needsKey && !key) {
    throw new Error(`No ${PROVIDERS[provider].label} key. Add one in the Studio under Models and keys, or as ${PROVIDERS[provider].env} in .env.`);
  }
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey: key })(model);
    case "anthropic":
      return createAnthropic({ apiKey: key })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: key })(model);
    case "openrouter":
      return createOpenAICompatible({ name: "openrouter", baseURL: BASE_URLS.openrouter, apiKey: key })(model);
    case "ollama":
      return createOpenAICompatible({ name: "ollama", baseURL: BASE_URLS.ollama })(model);
    case "custom":
      if (!customBaseUrl) throw new Error("Set the base address for the OpenAI-compatible provider first.");
      return createOpenAICompatible({ name: "custom", baseURL: customBaseUrl, apiKey: key })(model);
  }
}

/** Ask the provider which models this key can use, so nothing is hard-coded here. */
export async function listModels(provider: ProviderId, root: string): Promise<string[]> {
  const { key } = resolveKey(provider, root);
  const settings = readSettings();
  const get = async (url: string, headers: Record<string, string>) => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`${PROVIDERS[provider].label} answered ${response.status} when listing models.`);
    return (await response.json()) as Record<string, unknown>;
  };
  const ids = (rows: unknown, field = "id") =>
    (Array.isArray(rows) ? rows : []).map((row) => String((row as Record<string, unknown>)[field])).filter(Boolean);
  const bearer: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
  switch (provider) {
    case "openai": {
      const data = (await get("https://api.openai.com/v1/models", bearer)).data as Array<{ id: string; created?: number }>;
      const chat = data.filter((m) => /^(gpt|o\d|chatgpt)/.test(m.id) && !/(audio|realtime|tts|transcribe|image|embedding|search|instruct)/.test(m.id));
      return chat.sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).map((m) => m.id);
    }
    case "anthropic":
      return ids((await get("https://api.anthropic.com/v1/models?limit=100", { "x-api-key": key ?? "", "anthropic-version": "2023-06-01" })).data);
    case "google":
      return ids((await get(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200`, { "x-goog-api-key": key ?? "" })).models, "name")
        .map((name) => name.replace(/^models\//, ""))
        .filter((name) => name.startsWith("gemini"));
    case "openrouter":
      return ids((await get(`${BASE_URLS.openrouter}/models`, bearer)).data);
    case "ollama":
      return ids((await get("http://localhost:11434/api/tags", {})).models, "name");
    case "custom":
      if (!settings.customBaseUrl) return [];
      return ids((await get(`${settings.customBaseUrl.replace(/\/$/, "")}/models`, bearer)).data);
  }
}

interface ChatRequest {
  messages: UIMessage[];
  provider: ProviderId;
  model: string;
}

export interface McpResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

/** What the model reads back from a tool call. */
export function resultForModel(result: McpResult) {
  const text = (result.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const value = text || JSON.stringify(result.structuredContent ?? {});
  return result.isError ? ({ type: "error-text", value } as const) : ({ type: "text", value } as const);
}

/** Run one chat turn: the model, the tools of every connected server, streamed to the browser. */
export async function streamChat(
  res: ServerResponse,
  body: ChatRequest,
  context: {
    root: string;
    servers: Array<{ server: RemoteServer; local: boolean }>;
    instructions?: string;
    /** Tool ids the model may call. Leave out for all of them. */
    allow?: string[] | null;
    /** Tools of the Studio itself, such as the ones that write code. */
    extra?: ToolSet;
  },
): Promise<void> {
  const { key } = resolveKey(body.provider, context.root);
  const model = createModel(body.provider, body.model, key, readSettings().customBaseUrl);
  const clients: Client[] = [];
  const tools: ToolSet = {};
  const close = async (): Promise<void> => {
    await Promise.allSettled(clients.map((client) => client.close()));
  };
  try {
    for (const { server, local } of context.servers) {
      let client: Client;
      try {
        client = await connect(server);
      } catch (error) {
        if (local) throw error;
        continue; // A remote server that is down should not block the chat.
      }
      clients.push(client);
      for (const info of await listTools(client, server, local)) {
        if (context.allow && !context.allow.includes(info.id)) continue;
        tools[info.id] = dynamicTool({
          description: info.description ?? info.title ?? info.name,
          inputSchema: jsonSchema(info.inputSchema),
          execute: async (input) => {
            const started = performance.now();
            const result = (await client.callTool({ name: info.name, arguments: (input ?? {}) as Record<string, unknown> })) as McpResult;
            // Local tools report their own calls. Record the ones that ran somewhere else.
            if (!local) {
              recordCall({
                tool: info.name,
                server: server.name,
                ms: Math.round(performance.now() - started),
                ok: result.isError !== true,
                input,
                output: result.structuredContent ?? result.content,
              });
            }
            return result;
          },
          toModelOutput: ({ output }) => resultForModel(output as McpResult),
        });
      }
    }
    Object.assign(tools, context.extra);
    const result = streamText({
      model,
      system: context.instructions,
      messages: await convertToModelMessages(body.messages, { tools }),
      tools,
      stopWhen: isStepCount(context.extra ? 24 : 12),
      onFinish: close,
      onError: close,
      onAbort: close,
    });
    await result.pipeUIMessageStreamToResponse(res, {
      onError: (error) => (error instanceof Error ? error.message : String(error)),
    });
  } catch (error) {
    await close();
    throw error;
  }
}
