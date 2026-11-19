import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { configDir } from "../dev/keys.js";
import { DIRECTORY_URL } from "../install.js";

/** Everything that talks to plugmcp.ai. Nothing here runs unless the user asks for it. */

const credentialsPath = () => join(configDir(), "credentials.json");

export function readAccountKey(): string | undefined {
  if (process.env.PLUGMCP_ACCOUNT_KEY) return process.env.PLUGMCP_ACCOUNT_KEY;
  try {
    return (JSON.parse(readFileSync(credentialsPath(), "utf8")) as { accountKey?: string }).accountKey;
  } catch {
    return undefined;
  }
}

export function saveAccountKey(key: string): void {
  if (!/^pb_acct_[A-Za-z0-9]{40}$/.test(key)) {
    throw new Error("That is not an account key. Account keys start with pb_acct_ and are created at plugmcp.ai/app/settings/agent-access.");
  }
  if (!existsSync(configDir())) mkdirSync(configDir(), { recursive: true });
  writeFileSync(credentialsPath(), JSON.stringify({ accountKey: key }, null, 2), { mode: 0o600 });
}

export interface Listing {
  name: string;
  description: string;
  remoteUrl?: string;
  repoUrl?: string;
  homepageUrl?: string;
  npm?: string;
}

export const SUBMIT_URL = `${DIRECTORY_URL}/api/directory/submit`;

export async function submitListing(listing: Listing): Promise<Record<string, unknown>> {
  const response = await fetch(SUBMIT_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "plugmcp-sdk" },
    body: JSON.stringify(listing),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error ?? `The directory answered ${response.status}.`));
  return body;
}

export const ACCOUNT_MCP_URL = `${DIRECTORY_URL}/account-mcp`;

export async function accountClient(key: string): Promise<Client> {
  const client = new Client({ name: "plugmcp-cli", version: "0.1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(ACCOUNT_MCP_URL), {
      requestInit: { headers: { authorization: `Bearer ${key}` } },
    }),
  );
  return client;
}

/**
 * Whether the account MCP can register a server that already runs at an address.
 * Checked live, so the CLI starts working the day plugmcp.ai adds it.
 */
export async function canWrapUrl(client: Client): Promise<boolean> {
  const { tools } = await client.listTools();
  const create = tools.find((tool) => tool.name === "create_server");
  const properties = (create?.inputSchema.properties ?? {}) as Record<string, unknown>;
  return "upstream_url" in properties;
}
