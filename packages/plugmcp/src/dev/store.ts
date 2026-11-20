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

/** A saved call of a tool and what it should give back. `plugmcp test` and the Studio run these. */
export interface SavedTest {
  id: string;
  tool: string;
  name: string;
  arguments: Record<string, unknown>;
  /** The call should end in an error. Default false. */
  expectError?: boolean;
  /** Text the result must contain, compared without regard to case. */
  contains?: string;
}

export const readTests = (project: Project): SavedTest[] => readJson(join(dir(project), "tests.json"), [] as SavedTest[]);
export const writeTests = (project: Project, tests: SavedTest[]): void => writeJson(project, "tests.json", tests);

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
const perServer = new Map<string, { total: number; failed: number }>();

// The log is kept on disk too, so it is still there after the dev server restarts.
let file: string | null = null;
let saving: ReturnType<typeof setTimeout> | null = null;

function save(): void {
  if (!file || saving) return;
  saving = setTimeout(() => {
    saving = null;
    if (!file) return;
    try {
      const folder = join(file, "..");
      if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
      writeFileSync(file, JSON.stringify({ calls }));
    } catch {
      // A log that cannot be saved is still shown until the server stops.
    }
  }, 400);
  saving.unref?.();
}

/** Read the saved log from this folder and keep writing to it. */
export function keepCalls(home: string): void {
  file = join(home, ".plugmcp", "calls.json");
  const saved = readJson<{ calls?: CallRecord[] }>(file, {}).calls ?? [];
  calls.length = 0;
  perServer.clear();
  total = 0;
  failed = 0;
  for (const call of saved.slice(0, MAX)) {
    calls.push(call);
    total += 1;
    if (!call.ok) failed += 1;
    const count = perServer.get(call.server) ?? { total: 0, failed: 0 };
    count.total += 1;
    if (!call.ok) count.failed += 1;
    perServer.set(call.server, count);
    nextId = Math.max(nextId, call.id + 1);
  }
}

const clip = (value: unknown): unknown => {
  const text = JSON.stringify(value) ?? "";
  return text.length > 20_000 ? `${text.slice(0, 20_000)} ... (cut)` : value;
};

export function recordCall(entry: Omit<CallRecord, "id" | "at">): void {
  total += 1;
  if (!entry.ok) failed += 1;
  const count = perServer.get(entry.server) ?? { total: 0, failed: 0 };
  count.total += 1;
  if (!entry.ok) count.failed += 1;
  perServer.set(entry.server, count);
  calls.unshift({ ...entry, input: clip(entry.input), output: clip(entry.output), id: nextId++, at: Date.now() });
  if (calls.length > MAX) calls.length = MAX;
  save();
}

export const callLog = () => ({ total, failed, calls });

/** How many calls one server has handled since the dev server started. */
export const callsFor = (server: string) => perServer.get(server) ?? { total: 0, failed: 0 };

export function clearCalls(): void {
  calls.length = 0;
  total = 0;
  failed = 0;
  perServer.clear();
  save();
}

/**
 * Tools report each call through a process-wide hook, so calls from Cursor,
 * Claude or any other client show in the Studio next to the Studio's own.
 */
export function listenForCalls(home?: string): void {
  if (home) keepCalls(home);
  (globalThis as Record<symbol, unknown>)[Symbol.for("plugmcp.calls")] = (entry: {
    server?: string;
    tool: string;
    ms: number;
    input: unknown;
    result: { isError?: boolean; structuredContent?: unknown; content?: unknown };
  }) =>
    recordCall({
      tool: entry.tool,
      server: entry.server ?? "local",
      ms: entry.ms,
      ok: entry.result.isError !== true,
      input: entry.input,
      output: entry.result.structuredContent ?? entry.result.content,
    });
}
