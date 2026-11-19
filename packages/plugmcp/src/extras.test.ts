import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { toAgentSdk } from "./agent.js";
import { saveAccountKey } from "./cli/cloud.js";
import { startDev, type DevServer } from "./dev/dev.js";
import { listViews, readEnvFile, resolveProject } from "./dev/project.js";
import { callLog, clearCalls, recordCall } from "./dev/store.js";
import { createServer } from "./index.js";
import { directoryPage, installSnippets, readmeBadge } from "./install.js";

describe("install snippets", () => {
  const snippets = installSnippets("weather", "https://example.com/mcp");
  it("covers the common clients", () => {
    expect(snippets.map((s) => s.id)).toEqual(["cursor", "vscode", "claude-code", "codex", "claude", "chatgpt", "json"]);
  });
  it("puts the address in a Cursor link the editor can decode", () => {
    const cursor = new URL(snippets[0]?.value ?? "");
    const config = JSON.parse(Buffer.from(cursor.searchParams.get("config") ?? "", "base64").toString("utf8"));
    expect(config).toEqual({ url: "https://example.com/mcp" });
  });
  it("links the badge to the directory page", () => {
    expect(directoryPage("weather")).toBe("https://plugmcp.ai/mcp/weather");
    expect(readmeBadge("weather")).toContain("(https://plugmcp.ai/mcp/weather)");
  });
});

describe("project files", () => {
  const root = mkdtempSync(join(tmpdir(), "plugmcp-"));
  writeFileSync(join(root, "server.ts"), "export default {}");
  mkdirSync(join(root, "views"));
  writeFileSync(join(root, "views", "get_weather.tsx"), "");
  writeFileSync(join(root, "views", "notes.md"), "");
  writeFileSync(join(root, ".env"), 'OPENAI_API_KEY="abc"\n# comment\nexport OTHER=1\n');

  it("finds the entry and the views", () => {
    const project = resolveProject(root);
    expect(project.entry).toBe("server.ts");
    expect(listViews(project)).toEqual({ get_weather: "views/get_weather.tsx" });
  });
  it("reads .env without touching the process", () => {
    expect(readEnvFile(root)).toEqual({ OPENAI_API_KEY: "abc", OTHER: "1" });
    expect(process.env.OTHER).toBeUndefined();
  });
  it("explains a missing server file", () => {
    expect(() => resolveProject(mkdtempSync(join(tmpdir(), "plugmcp-empty-")))).toThrow(/No server file/);
  });
});

describe("Claude Agent SDK adapter", () => {
  it("names the server and its tools the way the agent expects", () => {
    const server = createServer({ name: "My Shop" });
    server.tool({ name: "find_order", description: "Find an order", input: z.object({ id: z.string() }) }, ({ id }) => ({ id }));
    const { mcpServers, allowedTools } = toAgentSdk(server);
    expect(Object.keys(mcpServers)).toEqual(["my-shop"]);
    expect(allowedTools).toEqual(["mcp__my-shop__find_order"]);
    expect(mcpServers["my-shop"]).toMatchObject({ type: "sdk", name: "my-shop" });
  });
});

describe("account key", () => {
  it("refuses a key of the wrong kind", () => {
    expect(() => saveAccountKey(`pb_live_${"a".repeat(40)}`)).toThrow(/not an account key/);
  });
});

describe("dev server", () => {
  const example = resolve(dirname(fileURLToPath(import.meta.url)), "../../../examples/weather");
  let dev: DevServer;
  const api = (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${dev.port}/__studio/api${path}`, init);

  beforeAll(async () => {
    dev = await startDev({ root: example, port: 4820, studio: false });
  }, 30_000);
  afterAll(async () => {
    await dev?.close();
  });

  it("describes the project to the Studio", async () => {
    const info = (await (await api("/info")).json()) as { ok: boolean; tools: Array<{ name: string; view: string | null; viewFile: string | null }> };
    expect(info.ok).toBe(true);
    expect(info.tools[0]).toMatchObject({ name: "get_weather", view: "ui://weather/get_weather.html", viewFile: "views/get_weather.tsx" });
  });

  it("serves a view that loads its code from the dev server", async () => {
    const { html } = (await (await api("/view?uri=ui://weather/get_weather.html")).json()) as { html: string };
    expect(html).toContain(`http://127.0.0.1:${dev.port}/@plugmcp-view/get_weather.js`);
  });

  it("refuses another website and a sandboxed view", async () => {
    expect((await api("/settings", { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await api("/settings", { headers: { origin: "null" } })).status).toBe(403);
  });

  it("never sends a key to the browser", async () => {
    const body = await (await api("/settings")).text();
    expect(body).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
    expect(JSON.parse(body).providers.length).toBeGreaterThan(3);
  });

  it("rejects a bad tool name before writing anything", async () => {
    const response = await api("/tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Bad Name" }) });
    expect(response.status).toBe(400);
  });

  it("opens the server file and nothing outside the project's code", async () => {
    const file = (await (await api("/file?path=server.ts")).json()) as { content: string };
    expect(file.content).toContain("createServer");
    for (const path of [".env", "package.json", "../../package.json", "views/../.env"]) {
      expect((await api(`/file?path=${encodeURIComponent(path)}`)).status).toBe(400);
    }
  });

  it("saves an agent, writes its code and removes it", async () => {
    const post = (body: unknown) => api("/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const name = `Test agent ${Date.now()}`;
    const { agent } = (await (await post({ name, instructions: "Be brief.", tools: ["get_weather"] })).json()) as { agent: { id: string } };
    try {
      expect((await post({ name, instructions: "Again." })).status).toBe(400);
      const { code, saved } = (await (await api(`/agents/code?id=${agent.id}`)).json()) as { code: string; saved: boolean };
      expect(saved).toBe(false);
      expect(code).toContain('from "../server.js"');
      expect(code).toContain('"mcp__weather__get_weather"');
      expect(code).toContain('systemPrompt: "Be brief."');
    } finally {
      await api(`/agents?id=${agent.id}`, { method: "DELETE" });
    }
    const { agents } = (await (await api("/agents")).json()) as { agents: Array<{ id: string }> };
    expect(agents.some((item) => item.id === agent.id)).toBe(false);
  });
});

describe("call log", () => {
  it("counts calls and failures, newest first", () => {
    clearCalls();
    recordCall({ tool: "a", server: "local", ms: 3, ok: true, input: {}, output: "x" });
    recordCall({ tool: "b", server: "local", ms: 5, ok: false, input: {}, output: "boom" });
    const log = callLog();
    expect(log).toMatchObject({ total: 2, failed: 1 });
    expect(log.calls[0]?.tool).toBe("b");
    clearCalls();
  });
});
