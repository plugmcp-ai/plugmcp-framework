import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const ENTRIES = ["server.ts", "server.tsx", "src/server.ts", "index.ts", "src/index.ts", "server.js", "index.js"];

export interface Project {
  root: string;
  name: string;
  /** Entry file, relative to root, with forward slashes. */
  entry: string;
  viewsDir: string;
}

export function resolveProject(root: string, entry?: string): Project {
  const found = entry ?? ENTRIES.find((file) => existsSync(join(root, file)));
  if (!found || !existsSync(join(root, found))) {
    throw new Error(
      `No server file found in ${root}. Create server.ts that default-exports createServer(...), or pass --entry.`,
    );
  }
  return { root, name: basename(root), entry: found.replace(/\\/g, "/"), viewsDir: join(root, "views") };
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
