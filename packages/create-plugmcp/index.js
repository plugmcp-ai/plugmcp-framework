#!/usr/bin/env node
// @ts-check
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = {
  starter: "One tool with a view the user sees in the chat",
  blank: "One tool, nothing else",
  agent: "The starter, plus a script that runs the tools in the Claude Agent SDK",
};

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
/** @param {number} code */
const paint = (code) => (/** @type {string} */ text) => (tty ? `\u001b[${code}m${text}\u001b[0m` : text);
const dim = paint(2);
const bold = paint(1);
const blue = paint(36);
const green = paint(32);

/** @param {string[]} argv */
function parse(argv) {
  /** @type {string[]} */
  const positional = [];
  /** @type {Record<string, string | boolean>} */
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [key = "", inline] = arg.slice(2).split("=", 2);
    const next = argv[i + 1];
    if (inline !== undefined) flags[key] = inline;
    else if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else flags[key] = true;
  }
  return { positional, flags };
}

/** @param {string} question */
async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/**
 * Show servers that already do something similar. Never blocks the scaffold:
 * if the directory cannot be reached, say nothing.
 * @param {string} words
 */
async function showSimilar(words) {
  try {
    const response = await fetch(`https://plugmcp.ai/api/v1/servers?q=${encodeURIComponent(words)}`, {
      headers: { accept: "application/json", "user-agent": "create-plugmcp" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return;
    const data = /** @type {{ total: number, servers: Array<{ name: string, url: string, summary?: string }> }} */ (await response.json());
    if (!data.servers?.length) {
      console.log(`  ${dim("Nothing like it in the PlugMCP directory yet. Good gap.")}\n`);
      return;
    }
    console.log(`  ${dim(`${data.total} servers in the PlugMCP directory match. Worth a look before you build:`)}`);
    for (const server of data.servers.slice(0, 3)) console.log(`    ${server.name}  ${blue(server.url)}`);
    console.log("");
  } catch {
    // Offline is fine.
  }
}

/** @param {string} dir @param {(file: string) => void} visit */
function walk(dir, visit) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, visit);
    else visit(path);
  }
}

function packageManager() {
  const agent = process.env.npm_config_user_agent ?? "";
  if (agent.startsWith("pnpm")) return "pnpm";
  if (agent.startsWith("yarn")) return "yarn";
  if (agent.startsWith("bun")) return "bun";
  return "npm";
}

async function main() {
  const { positional, flags } = parse(process.argv.slice(2));
  if (flags.help) {
    console.log(`\n  ${bold("create-plugmcp")} <name> [--template starter|blank|agent] [--no-install]\n`);
    for (const [name, text] of Object.entries(TEMPLATES)) console.log(`    ${name.padEnd(8)} ${dim(text)}`);
    console.log("");
    return;
  }
  const interactive = Boolean(process.stdin.isTTY) && flags.yes !== true;
  const name = positional[0] ?? (interactive ? await ask("  Project name: ") : "") ?? "";
  if (!/^[a-z0-9][a-z0-9-_.]*$/i.test(name)) throw new Error("Give the project a name: npx create-plugmcp my-server");
  const template = typeof flags.template === "string" ? flags.template : "starter";
  if (!(template in TEMPLATES)) throw new Error(`Unknown template "${template}". Choose one of: ${Object.keys(TEMPLATES).join(", ")}.`);

  const target = resolve(name);
  if (existsSync(target) && readdirSync(target).length) throw new Error(`${name} already exists and is not empty.`);

  console.log("");
  const about = typeof flags.about === "string" ? flags.about : interactive ? await ask(`  What will it do? ${dim("(a few words, Enter to skip)")} `) : "";
  if (about) await showSimilar(about);

  mkdirSync(target, { recursive: true });
  cpSync(join(here, "templates", "starter"), target, { recursive: true });
  if (template !== "starter") cpSync(join(here, "templates", template), target, { recursive: true, force: true });
  if (template === "blank") {
    const { rmSync } = await import("node:fs");
    rmSync(join(target, "views"), { recursive: true, force: true });
  }
  if (existsSync(join(target, "gitignore"))) renameSync(join(target, "gitignore"), join(target, ".gitignore"));

  const version = /** @type {{ version: string }} */ (JSON.parse(readFileSync(join(here, "package.json"), "utf8"))).version;
  // --link is for working on the SDK itself: point the project at a local build.
  const plugmcp = typeof flags.link === "string" ? `file:${resolve(flags.link).replace(/\\/g, "/")}` : `^${version}`;
  walk(target, (file) => {
    if (!/\.(json|md|ts|tsx|example)$/.test(file)) return;
    const text = readFileSync(file, "utf8");
    const next = text
      .replaceAll("{{name}}", basename(target))
      .replaceAll("{{plugmcp}}", plugmcp)
      .replaceAll("{{about}}", about || "An MCP server built with the PlugMCP SDK.");
    if (next !== text) writeFileSync(file, next);
  });

  const pm = packageManager();
  if (flags["no-install"] !== true) {
    console.log(`  ${dim(`Installing with ${pm}`)}`);
    const result = spawnSync(pm, ["install"], { cwd: target, stdio: "inherit", shell: process.platform === "win32" });
    if (result.status !== 0) console.log(`  ${dim(`Install did not finish. Run "${pm} install" in ${name} yourself.`)}`);
  }

  console.log(`
  ${green("Created")} ${bold(name)}

    cd ${name}${flags["no-install"] === true ? `\n    ${pm} install` : ""}
    ${pm === "npm" ? "npm run dev" : `${pm} dev`}

  ${dim("That opens the Studio: a map of your tools, a tester, and a chat that uses your own key.")}
  ${dim("Search existing servers:")} ${blue("https://plugmcp.ai/mcp")}
`);
}

main().catch((error) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
