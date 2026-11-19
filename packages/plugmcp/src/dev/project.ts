import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const ENTRIES = ["server.ts", "server.tsx", "src/server.ts", "index.ts", "src/index.ts", "server.js", "index.js"];

export interface Project {
  root: string;
  name: string;
  /** Entry file, relative to root, with forward slashes. */
  entry: string;
  viewsDir: string;
  /** Short name used in addresses and by the Studio. "main" for the server at the top of the folder. */
  id: string;
  /** The folder `plugmcp dev` was started in. Keys and .env are read from here. */
  home: string;
  /** Path from home to root with a trailing slash, or an empty string. */
  rel: string;
  /** Where this server answers MCP requests in dev. */
  mount: string;
}

export function resolveProject(root: string, entry?: string): Project {
  const found = entry ?? ENTRIES.find((file) => existsSync(join(root, file)));
  if (!found || !existsSync(join(root, found))) {
    throw new Error(
      `No server file found in ${root}. Create server.ts that default-exports createServer(...), or pass --entry.`,
    );
  }
  return { root, name: basename(root), entry: found.replace(/\\/g, "/"), viewsDir: join(root, "views"), id: "main", home: root, rel: "", mount: "/mcp" };
}

export const SERVER_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/**
 * Every MCP server in a folder: the one at the top, and one per folder in servers/.
 * Each has its own server file and its own views.
 */
export function resolveWorkspace(home: string, entry?: string): Project[] {
  const list: Project[] = [];
  let missing: unknown;
  try {
    list.push(resolveProject(home, entry));
  } catch (error) {
    missing = error;
  }
  const dir = join(home, "servers");
  if (existsSync(dir)) {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!item.isDirectory() || !SERVER_ID.test(item.name) || item.name === "main") continue;
      const root = join(dir, item.name);
      const found = ENTRIES.find((file) => existsSync(join(root, file)));
      if (!found) continue;
      list.push({ root, name: item.name, entry: found, viewsDir: join(root, "views"), id: item.name, home, rel: `servers/${item.name}/`, mount: `/mcp/${item.name}` });
    }
  }
  if (list.length === 0) throw missing;
  return list;
}

/** Tool name to view file (relative to root), from views/<tool>.tsx. */
export function listViews(project: Project): Record<string, string> {
  if (!existsSync(project.viewsDir)) return {};
  const views: Record<string, string> = {};
  for (const file of readdirSync(project.viewsDir)) {
    const match = /^(.+)\.(tsx|jsx)$/.exec(file);
    if (match?.[1]) views[match[1]] = `views/${file}`;
  }
  return views;
}

/** Read KEY=value pairs from the project's .env without touching process.env. */
export function readEnvFile(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [".env", ".env.local"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match?.[1]) continue;
      out[match[1]] = (match[2] ?? "").replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return out;
}
