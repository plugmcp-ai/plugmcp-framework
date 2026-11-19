import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { z } from "zod";
import { VIEW_MIME_TYPE, createServer, serveHttp, toToolResult, viewUri, type RunningServer } from "./index.js";

const server = createServer({ name: "Test Server", description: "For tests" });
server.tool(
  { name: "add", description: "Add two numbers", input: z.object({ a: z.number(), b: z.number() }) },
  ({ a, b }) => ({ sum: a + b }),
);
server.tool({ name: "hello", description: "Say hello" }, () => "hello");
server.tool({ name: "boom", description: "Always fails" }, () => {
  throw new Error("It broke.");
});

let running: RunningServer;
let client: Client;

beforeAll(async () => {
  running = await serveHttp(server, {
    port: 4810,
    views: { add: { html: () => "<!doctype html><p>view</p>" } },
  });
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(running.url)));
});

afterAll(async () => {
  await client?.close();
  await running?.close();
});

describe("toToolResult", () => {
  it("wraps strings, objects and arrays", () => {
    expect(toToolResult("hi")).toEqual({ content: [{ type: "text", text: "hi" }] });
    expect(toToolResult({ a: 1 }).structuredContent).toEqual({ a: 1 });
    expect(toToolResult([1, 2]).structuredContent).toEqual({ result: [1, 2] });
  });
  it("passes a full MCP result through", () => {
    const full = { content: [{ type: "text" as const, text: "x" }], isError: true };
    expect(toToolResult(full)).toBe(full);
  });
});

describe("serveHttp", () => {
  it("lists tools with a schema and a view link", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["add", "boom", "hello"]);
    const add = tools.find((t) => t.name === "add");
    expect(add?.inputSchema.properties).toHaveProperty("a");
    const uri = viewUri("Test Server", "add");
    expect(uri).toBe("ui://test-server/add.html");
    expect((add?._meta as { ui?: { resourceUri?: string } })?.ui?.resourceUri).toBe(uri);
    expect(tools.find((t) => t.name === "hello")?._meta).toBeUndefined();
  });

  it("calls a tool and returns structured content", async () => {
    const result = await client.callTool({ name: "add", arguments: { a: 2, b: 3 } });
    expect(result.structuredContent).toEqual({ sum: 5 });
  });

  it("calls a tool with no input", async () => {
    const result = await client.callTool({ name: "hello", arguments: {} });
    expect(result.content).toEqual([{ type: "text", text: "hello" }]);
  });

  it("turns a thrown error into an error result", async () => {
    const result = await client.callTool({ name: "boom", arguments: {} });
    expect(result.isError).toBe(true);
  });

  it("serves the view with the MCP Apps mime type", async () => {
    const { contents } = await client.readResource({ uri: "ui://test-server/add.html" });
    expect(contents[0]?.mimeType).toBe(VIEW_MIME_TYPE);
    expect((contents[0] as { text: string }).text).toContain("view");
  });

  it("shows a landing page to a browser", async () => {
    const response = await fetch(running.url, { headers: { accept: "text/html" } });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("Test Server");
    expect(html).toContain("plugmcp.ai");
  });
});
