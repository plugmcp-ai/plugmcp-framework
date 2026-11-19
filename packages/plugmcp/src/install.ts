/** Install snippets for the common MCP clients, for a server reachable at a URL. */

export interface InstallSnippet {
  id: string;
  label: string;
  kind: "link" | "code";
  value: string;
  hint?: string;
}

const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

export function installSnippets(name: string, url: string): InstallSnippet[] {
  const json = JSON.stringify({ mcpServers: { [name]: { url } } }, null, 2);
  return [
    {
      id: "cursor",
      label: "Cursor",
      kind: "link",
      value: `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(name)}&config=${encodeURIComponent(base64(JSON.stringify({ url })))}`,
    },
    {
      id: "vscode",
      label: "VS Code",
      kind: "link",
      value: `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name, type: "http", url }))}`,
    },
    {
      id: "claude-code",
      label: "Claude Code",
      kind: "code",
      value: `claude mcp add --transport http ${name} ${url}`,
    },
    {
      id: "codex",
      label: "Codex",
      kind: "code",
      value: `codex mcp add ${name} --url ${url}`,
    },
    {
      id: "claude",
      label: "Claude",
      kind: "code",
      value: url,
      hint: "Settings, Connectors, Add custom connector, then paste this address. It must be a public https address.",
    },
    {
      id: "chatgpt",
      label: "ChatGPT",
      kind: "code",
      value: url,
      hint: "Settings, Apps and Connectors, Create, then paste this address. It must be a public https address.",
    },
    { id: "json", label: "JSON", kind: "code", value: json, hint: "For any client that reads an mcpServers block." },
  ];
}

export const DIRECTORY_URL = "https://plugmcp.ai";

export function directoryPage(slug: string): string {
  return `${DIRECTORY_URL}/mcp/${slug}`;
}

/** Markdown badge for a README. The link is the useful part; the image is a plain shields.io badge. */
export function readmeBadge(slug: string): string {
  return `[![Listed on PlugMCP](https://img.shields.io/badge/listed%20on-PlugMCP-0099FF)](${directoryPage(slug)})`;
}
