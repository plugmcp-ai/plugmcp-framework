import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import react from "@vitejs/plugin-react";
import { build as viteBuild } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { isPlugServer } from "./index.js";
import type { BuildOptions, PlugServer } from "./index.js";
import { listViews, resolveProject } from "./dev/project.js";
import { viewEntryPlugin, viewShell } from "./dev/views.js";

export interface BuildResult {
  outDir: string;
  views: string[];
  ms: number;
}

/** Bundle the server to dist/server.js and each view to one self-contained HTML file. */
export async function buildProject(root: string, entry?: string): Promise<BuildResult> {
  const started = performance.now();
  const project = resolveProject(root, entry);
  const outDir = join(root, "dist");
  rmSync(outDir, { recursive: true, force: true });

  await viteBuild({
    root,
    configFile: false,
    logLevel: "warn",
    build: {
      ssr: project.entry,
      outDir,
      emptyOutDir: false,
      target: "node20",
      rollupOptions: { output: { format: "esm", entryFileNames: "server.js" } },
    },
  });

  const views = listViews(project);
  const tmp = join(root, ".plugmcp", "build");
  mkdirSync(tmp, { recursive: true });
  mkdirSync(join(outDir, "views"), { recursive: true });
  for (const tool of Object.keys(views)) {
    const page = join(tmp, `${tool}.html`);
    writeFileSync(page, viewShell(tool));
    await viteBuild({
      root,
      configFile: false,
      logLevel: "warn",
      plugins: [react(), viewEntryPlugin(() => views), viteSingleFile()],
      build: { outDir: join(tmp, "out"), emptyOutDir: true, rollupOptions: { input: page } },
    });
    const built = findHtml(join(tmp, "out"));
    if (!built) throw new Error(`The view for ${tool} did not produce an HTML file.`);
    writeFileSync(join(outDir, "views", `${tool}.html`), readFileSync(built));
  }
  rmSync(tmp, { recursive: true, force: true });
  return { outDir, views: Object.keys(views), ms: Math.round(performance.now() - started) };
}

function findHtml(dir: string): string | undefined {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      const inner = findHtml(path);
      if (inner) return inner;
    } else if (item.name.endsWith(".html")) return path;
  }
  return undefined;
}

/** Load what `plugmcp build` produced. */
export async function loadBuilt(root: string): Promise<{ server: PlugServer; views: NonNullable<BuildOptions["views"]> }> {
  const file = join(root, "dist", "server.js");
  if (!existsSync(file)) throw new Error("No build found. Run `plugmcp build` first.");
  const module = (await import(pathToFileURL(file).href)) as { default?: unknown; server?: unknown };
  const server = module.default ?? module.server;
  if (!isPlugServer(server)) throw new Error('dist/server.js does not default-export a server. Add "export default server".');
  const views: NonNullable<BuildOptions["views"]> = {};
  const dir = join(root, "dist", "views");
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".html")) continue;
      const html = readFileSync(join(dir, name), "utf8");
      views[name.slice(0, -5)] = { html: () => html };
    }
  }
  return { server, views };
}
