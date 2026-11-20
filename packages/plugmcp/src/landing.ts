import type { PlugServer } from "./index.js";
import { DIRECTORY_URL, installSnippets } from "./install.js";

const esc = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** The page a person sees when they open the MCP address in a browser. */
export function landingPage(server: PlugServer, url: string): string {
  const { name, title, description } = server.info;
  const tools = [...server.tools.values()].filter(({ config }) => !config.visibility || config.visibility.includes("model"));
  const snippets = installSnippets(name, url);
  const links = snippets
    .filter((s) => s.kind === "link")
    .map((s) => `<a class="btn" href="${esc(s.value)}">Add to ${esc(s.label)}</a>`)
    .join("");
  const code = snippets
    .filter((s) => s.kind === "code")
    .map(
      (s) =>
        `<section><h3>${esc(s.label)}</h3>${s.hint ? `<p class="muted">${esc(s.hint)}</p>` : ""}<pre>${esc(s.value)}</pre></section>`,
    )
    .join("");
  const toolRows = tools
    .map(
      ({ config }) =>
        `<li><code>${esc(config.name)}</code><span>${esc(config.description ?? config.title ?? "")}</span></li>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ?? name)} - MCP server</title>
<meta name="description" content="${esc(description ?? `${name} is an MCP server with ${tools.length} tools.`)}">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0A0A0A;color:#F2EFE9;font:15px/1.6 Geist,ui-sans-serif,system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:56px 16px 80px}
h1{font-size:30px;font-weight:500;margin:0 0 8px;letter-spacing:-.01em}
h2{font-size:17px;font-weight:500;margin:40px 0 12px}
h3{font-size:14px;font-weight:500;margin:20px 0 4px}
p{margin:0 0 12px}.muted{color:#8D8984}
.url{font:13px/1.5 "Geist Mono",ui-monospace,monospace;background:#121212;border:1px solid #222;border-radius:10px;padding:12px 14px;overflow-x:auto;white-space:nowrap}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.btn{display:inline-block;padding:9px 14px;border-radius:10px;background:#F2EFE9;color:#0A0A0A;text-decoration:none;font-weight:500;font-size:14px}
ul{list-style:none;padding:0;margin:0;border:1px solid #222;border-radius:10px}
li{display:flex;gap:12px;padding:10px 14px;border-top:1px solid #222;flex-wrap:wrap}
li:first-child{border-top:0}
code{font:13px "Geist Mono",ui-monospace,monospace;color:#3DB2FF}
li span{color:#C4C0B9}
pre{font:13px/1.5 "Geist Mono",ui-monospace,monospace;background:#121212;border:1px solid #222;border-radius:10px;padding:12px 14px;overflow-x:auto;margin:6px 0 0}
footer{margin-top:56px;padding-top:20px;border-top:1px solid #222;color:#8D8984;font-size:13px}
footer a{color:#C4C0B9}
</style>
</head>
<body>
<main>
<h1>${esc(title ?? name)}</h1>
<p class="muted">${esc(description ?? "An MCP server. Connect it to an AI client to use its tools.")}</p>
<div class="url">${esc(url)}</div>
<div class="row">${links}</div>
<h2>Tools</h2>
${tools.length ? `<ul>${toolRows}</ul>` : `<p class="muted">This server has no tools yet.</p>`}
<h2>Connect</h2>
${code}
<footer>Built with the <a href="https://github.com/plugmcp-ai/plugmcp-framework">PlugMCP Framework</a>. Find more servers in the <a href="${DIRECTORY_URL}/mcp">PlugMCP directory</a>.</footer>
</main>
</body>
</html>`;
}
