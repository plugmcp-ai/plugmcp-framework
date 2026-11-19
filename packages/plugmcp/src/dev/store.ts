import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProviderId } from "./keys.js";
import type { Project } from "./project.js";

/** An agent made in the Studio: a prompt, a model and the tools it may use. */
export interface Agent {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  provider?: ProviderId;
  model?: string;
  /** Tool ids the agent may call. `null` means every tool. */
  tools: string[] | null;
  /** Opening messages offered in the chat. */
  starters?: string[];
}

const dir = (project: Project) => join(project.root, ".plugmcp");

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(project: Project, file: string, value: unknown): void {
  if (!existsSync(dir(project))) mkdirSync(dir(project), { recursive: true });
  writeFileSync(join(dir(project), file), JSON.stringify(value, null, 2));
}

export const readAgents = (project: Project): Agent[] => readJson(join(dir(project), "agents.json"), [] as Agent[]);
export const writeAgents = (project: Project, agents: Agent[]): void => writeJson(project, "agents.json", agents);

/** One tool call seen by the dev server, from the Studio or from any connected client. */
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

const MAX = 300;
const calls: CallRecord[] = [];
let nextId = 1;
let total = 0;
let failed = 0;

const clip = (value: unknown): unknown => {
  const text = JSON.stringify(value) ?? "";
  return text.length > 20_000 ? `${text.slice(0, 20_000)} ... (cut)` : value;
};

export function recordCall(entry: Omit<CallRecord, "id" | "at">): void {
  total += 1;
  if (!entry.ok) failed += 1;
  calls.unshift({ ...entry, input: clip(entry.input), output: clip(entry.output), id: nextId++, at: Date.now() });
  if (calls.length > MAX) calls.length = MAX;
}

export const callLog = () => ({ total, failed, calls });

export function clearCalls(): void {
  calls.length = 0;
  total = 0;
  failed = 0;
}

/**
 * Tools report each call through a process-wide hook, so calls from Cursor,
 * Claude or any other client show in the Studio next to the Studio's own.
 */
export function listenForCalls(): void {
  (globalThis as Record<symbol, unknown>)[Symbol.for("plugmcp.calls")] = (entry: {
    tool: string;
    ms: number;
    input: unknown;
    result: { isError?: boolean; structuredContent?: unknown; content?: unknown };
  }) =>
    recordCall({
      tool: entry.tool,
      server: "local",
      ms: entry.ms,
      ok: entry.result.isError !== true,
      input: entry.input,
      output: entry.result.structuredContent ?? entry.result.content,
    });
}
