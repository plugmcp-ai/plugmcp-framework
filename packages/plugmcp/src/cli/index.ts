#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { slugify } from "../index.js";
import { DIRECTORY_URL, directoryPage, readmeBadge } from "../install.js";
import { ACCOUNT_MCP_URL, SUBMIT_URL, accountClient, canWrapUrl, readAccountKey, saveAccountKey, submitListing } from "./cloud.js";
import type { Listing } from "./cloud.js";

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number) => (text: string) => (tty ? `\u001b[${code}m${text}\u001b[0m` : text);
const dim = paint(2);
const bold = paint(1);
const blue = paint(36);
const green = paint(32);
const red = paint(31);

interface Args {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parse(argv: string[]): Args {
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split("=", 2) as [string, string | undefined];
    const next = rest[i + 1];
    if (inline !== undefined) flags[key] = inline;
    else if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else flags[key] = true;
  }
  return { command, positional, flags };
}

const text = (value: string | boolean | undefined) => (typeof value === "string" ? value : undefined);

const HELP = `
${bold("plugmcp")}  Build MCP servers and MCP Apps. https://plugmcp.ai

  ${bold("Build")}
    plugmcp dev                 Run the server and open the Studio. No account needed.
    plugmcp build               Bundle the server and its views into dist/.
    plugmcp start               Run the build over HTTP. Add --stdio for stdio.

  ${bold("Directory")}
    plugmcp search <words>      Search 70,000+ MCP servers on plugmcp.ai.
    plugmcp add <slug>          Add a directory server to this project's Studio chat.

  ${bold("Ship")}
    plugmcp list                Give your server a page in the PlugMCP directory.
    plugmcp login               Save a plugmcp.ai account key on this machine.
    plugmcp deploy --url <url>  Put a server you already host behind plugmcp.ai.

  ${bold("Options")}
    --port <n>      Port for dev and start (default 3333)
    --entry <file>  Server file (default server.ts)
    --dry-run       For list and deploy: print what would be sent, send nothing
`;

function readPackage(root: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const { command, positional, flags } = parse(process.argv.slice(2));
  const root = resolve(text(flags.root) ?? process.cwd());
  const port = flags.port ? Number(flags.port) : undefined;
  const entry = text(flags.entry);

  switch (command) {
    case "dev": {
      const { startDev } = await import("../dev/dev.js");
      const dev = await startDev({ root, entry, port, studio: flags["no-studio"] !== true });
      console.log(`
  ${bold("PlugMCP")} ${dim(`ready in ${dev.readyMs} ms`)}

  ${dim("Studio")}   ${blue(`http://localhost:${dev.port}`)}
  ${dim("MCP")}      ${blue(`http://localhost:${dev.port}/mcp`)}

  ${dim("Edit server.ts or a file in views/ and it reloads. Ctrl+C to stop.")}
`);
      if (flags.open === true) {
        const { exec } = await import("node:child_process");
        const opener = process.platform === "win32" ? "start \"\"" : process.platform === "darwin" ? "open" : "xdg-open";
        exec(`${opener} http://localhost:${dev.port}`);
      }
      const stop = () => void dev.close().finally(() => process.exit(0));
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      return;
    }

    case "build": {
      const { buildProject } = await import("../build.js");
      const result = await buildProject(root, entry);
      console.log(`  ${green("Built")} dist/server.js and ${result.views.length} view${result.views.length === 1 ? "" : "s"} ${dim(`in ${result.ms} ms`)}`);
      console.log(`  ${dim("Run it with")} plugmcp start`);
      return;
    }

    case "start": {
      const { loadBuilt } = await import("../build.js");
      const { server, views } = await loadBuilt(root);
      if (flags.stdio === true) {
        const { serveStdio } = await import("../stdio.js");
        serveStdio(server, { views });
        return;
      }
      const { serveHttp } = await import("../http.js");
      // A host sets PORT. There the server must answer on every interface and any hostname.
      const hosted = Boolean(process.env.PORT) || flags.host === "0.0.0.0";
      const allowed = text(flags["allowed-hosts"]) ?? process.env.PLUGMCP_ALLOWED_HOSTS;
      const running = await serveHttp(server, {
        views,
        port,
        host: text(flags.host) ?? (hosted ? "0.0.0.0" : "127.0.0.1"),
        allowedHosts: allowed ? allowed.split(",").map((h) => h.trim()) : hosted ? ["*"] : undefined,
      });
      console.log(`  ${bold(server.info.name)} ${dim("is serving MCP at")} ${blue(running.url)}`);
      return;
    }

    case "search": {
      const query = positional.join(" ");
      if (!query) throw new Error("Say what to search for: plugmcp search stripe");
      const { directory } = await import("../dev/api.js");
      const params = new URLSearchParams({ q: query });
      if (flags.remote === true) params.set("remote", "1");
      const data = (await directory(`/servers?${params}`)) as {
        total: number;
        servers: Array<{ slug: string; name: string; summary?: string; stars?: number; remote?: boolean; verified?: boolean; url: string }>;
      };
      if (!data.servers.length) {
        console.log(`  Nothing matched "${query}". ${dim("That may be a gap worth filling.")}`);
        return;
      }
      console.log(`\n  ${data.total} server${data.total === 1 ? "" : "s"} for "${query}" ${dim("in the PlugMCP directory")}\n`);
      for (const server of data.servers.slice(0, Number(flags.limit ?? 8))) {
        const tags = [server.verified ? "verified" : "", server.remote ? "hosted" : "", server.stars ? `${server.stars} stars` : ""].filter(Boolean).join(", ");
        const summary = (server.summary ?? "").replace(/\s+/g, " ").slice(0, 110);
        console.log(`  ${bold(server.name)} ${dim(tags)}`);
        if (summary) console.log(`    ${summary}`);
        console.log(`    ${blue(server.url)}  ${dim(`plugmcp add ${server.slug}`)}\n`);
      }
      console.log(`  ${dim("More at")} ${DIRECTORY_URL}/mcp?q=${encodeURIComponent(query)}\n`);
      return;
    }

    case "add": {
      const slug = positional[0];
      if (!slug) throw new Error("Give the server's slug: plugmcp add <slug>. Find one with plugmcp search.");
      const { directory, writeServers } = await import("../dev/api.js");
      const { resolveProject } = await import("../dev/project.js");
      const record = (await directory(`/servers/${encodeURIComponent(slug)}`)) as { name: string; remote_url?: string | null; url: string };
      if (!record.remote_url) {
        console.log(`  ${record.name} is not hosted at an address, so it cannot join the Studio chat.`);
        console.log(`  Install steps: ${blue(record.url)}`);
        return;
      }
      const project = resolveProject(root, entry);
      const file = join(root, ".plugmcp", "servers.json");
      const current = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Array<{ name: string; url: string; slug?: string }>) : [];
      const name = slugify(record.name).slice(0, 32);
      writeServers(project, [...current.filter((s) => s.name !== name), { name, url: record.remote_url, slug }]);
      console.log(`  ${green("Added")} ${record.name}. Its tools are in the Studio chat next time you send a message.`);
      return;
    }

    case "list": {
      const pkg = readPackage(root);
      const repository = typeof pkg.repository === "string" ? pkg.repository : (pkg.repository as { url?: string } | undefined)?.url;
      const listing: Listing = {
        name: text(flags.name) ?? String(pkg.name ?? ""),
        description: text(flags.description) ?? String(pkg.description ?? ""),
        remoteUrl: text(flags.url),
        repoUrl: text(flags.repo) ?? repository?.replace(/^git\+/, "").replace(/\.git$/, ""),
        homepageUrl: text(flags.homepage) ?? (typeof pkg.homepage === "string" ? pkg.homepage : undefined),
        npm: text(flags.npm) ?? (pkg.private ? undefined : (pkg.name as string | undefined)),
      };
      for (const key of Object.keys(listing) as Array<keyof Listing>) if (!listing[key]) delete listing[key];
      if (!listing.name || (listing.description ?? "").length < 10) {
        throw new Error("A listing needs a name and a description of at least 10 characters. Set them in package.json or pass --name and --description.");
      }
      if (!listing.remoteUrl && !listing.repoUrl) {
        throw new Error("A listing needs a public address or a repository. Pass --url https://... or --repo https://github.com/you/project.");
      }
      if (flags["dry-run"] === true) {
        console.log(`  ${dim("Would POST to")} ${SUBMIT_URL}\n`);
        console.log(JSON.stringify(listing, null, 2));
        console.log(`\n  ${dim("Nothing was sent.")}`);
        return;
      }
      if (flags.yes !== true) {
        console.log(JSON.stringify(listing, null, 2));
        const answer = await ask(`\n  Publish this page in the public PlugMCP directory? (y/N) `);
        if (!/^y(es)?$/i.test(answer)) return void console.log("  Nothing was sent.");
      }
      const result = await submitListing(listing);
      const slug = String(result.slug ?? slugify(listing.name));
      console.log(`  ${green("Listed.")} ${blue(String(result.url ?? directoryPage(slug)))}`);
      console.log(`\n  ${dim("Badge for your README:")}\n  ${readmeBadge(slug)}\n`);
      return;
    }

    case "login": {
      const key = text(flags.key) ?? (await ask(`  Create an account key at ${DIRECTORY_URL}/app/settings/agent-access\n  Paste it here: `));
      saveAccountKey(key);
      const client = await accountClient(key);
      await client.close();
      console.log(`  ${green("Signed in.")} ${dim("The key is saved in ~/.plugmcp/credentials.json.")}`);
      return;
    }

    case "deploy": {
      const url = text(flags.url);
      if (!url) {
        console.log(`
  PlugMCP does not run your code yet. Host the build anywhere that runs Node:

    plugmcp build
    plugmcp start        ${dim("# reads PORT, serves /mcp")}

  Then put it behind plugmcp.ai for a gateway address, keys and call logs:

    plugmcp deploy --url https://your-host.example/mcp
`);
        return;
      }
      if (!/^https:\/\//.test(url)) throw new Error("The address must start with https://.");
      const pkg = readPackage(root);
      const payload = { name: text(flags.name) ?? String(pkg.name ?? "my-server"), description: String(pkg.description ?? ""), kind: "wrapped", upstream_url: url };
      if (flags["dry-run"] === true) {
        console.log(`  ${dim("Would call create_server on")} ${ACCOUNT_MCP_URL}\n`);
        console.log(JSON.stringify(payload, null, 2));
        console.log(`\n  ${dim("Nothing was sent.")}`);
        return;
      }
      const key = readAccountKey();
      if (!key) throw new Error("Sign in first: plugmcp login");
      const client = await accountClient(key);
      try {
        if (!(await canWrapUrl(client))) {
          console.log(`
  plugmcp.ai cannot register an outside address from the command line yet.
  Do it in the console, it takes a minute:

    1. Open ${blue(`${DIRECTORY_URL}/app/servers`)}
    2. Choose Add a server, then Connect existing MCP
    3. Paste ${url}
`);
          return;
        }
        const result = (await client.callTool({ name: "create_server", arguments: payload })) as { structuredContent?: { server?: { id?: string; endpoint?: string } }; isError?: boolean; content?: Array<{ text?: string }> };
        if (result.isError) throw new Error(result.content?.[0]?.text ?? "plugmcp.ai refused the server.");
        const server = result.structuredContent?.server;
        console.log(`  ${green("Created as a draft.")} Review and publish it:`);
        console.log(`  ${blue(`${DIRECTORY_URL}/app/servers/${server?.id ?? ""}`)}`);
      } finally {
        await client.close();
      }
      return;
    }

    case "version":
    case "--version":
    case "-v": {
      const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
      console.log(pkg.version);
      return;
    }

    default:
      console.log(HELP);
  }
}

main().catch((error: unknown) => {
  console.error(`\n  ${red("Error")} ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
