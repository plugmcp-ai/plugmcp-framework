import { IconCheck, IconCopy, IconExternalLink } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { Ship as ShipData } from "./api";

export function CopyBox({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copybox">
      <pre className="code">{value}</pre>
      <button
        className="icon-btn"
        aria-label={`Copy ${label ?? "to clipboard"}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <IconCheck size={16} stroke={2} /> : <IconCopy size={16} stroke={1.75} />}
      </button>
    </div>
  );
}

export function Ship() {
  const [data, setData] = useState<ShipData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.ship().then(setData).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  if (error) return <div className="page"><p className="note fault">{error}</p></div>;
  if (!data) return <div className="page"><p className="note">Loading</p></div>;

  const links = data.snippets.filter((snippet) => snippet.kind === "link");
  const local = data.snippets.filter((snippet) => snippet.kind === "code" && !["claude", "chatgpt"].includes(snippet.id));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Ship</h1>
        <p className="note">Use the server on this machine now. Put it online and list it when it is ready.</p>
      </div>

      <section className="step">
        <div className="step-num">1</div>
        <div className="step-body">
          <h2>Use it on this machine</h2>
          <p className="note">These connect your editor to the server running here. It works while plugmcp dev is running.</p>
          <div className="row">
            {links.map((snippet) => (
              <a key={snippet.id} className="btn btn-secondary" href={snippet.value}>
                Add to {snippet.label}
              </a>
            ))}
          </div>
          {local.map((snippet) => (
            <div key={snippet.id}>
              <h3>{snippet.label}</h3>
              <CopyBox value={snippet.value} label={snippet.label} />
            </div>
          ))}
        </div>
      </section>

      <section className="step">
        <div className="step-num">2</div>
        <div className="step-body">
          <h2>Put it online</h2>
          <p className="note">
            Claude and ChatGPT need a public https address. Build it, then run it on any host that runs Node, such as Railway or Fly. It reads the PORT the host sets.
          </p>
          <CopyBox value={"plugmcp build\nplugmcp start"} label="build commands" />
        </div>
      </section>

      <section className="step">
        <div className="step-num">3</div>
        <div className="step-body">
          <h2>List it in the directory</h2>
          <p className="note">A page on plugmcp.ai where people and agents find your server, with install buttons for every client.</p>
          <CopyBox value={"plugmcp list --url https://your-host.example/mcp"} label="list command" />
          <h3>Badge for your README</h3>
          <CopyBox value={data.badge} label="badge" />
          <p className="hint">Optional. It links to your directory page once the server is listed.</p>
        </div>
      </section>

      <section className="step">
        <div className="step-num">4</div>
        <div className="step-body">
          <h2>Add keys, logs and alerts</h2>
          <p className="note">
            Put your hosted server behind plugmcp.ai to get an address on the PlugMCP gateway, API keys you can revoke, a log of every call, and alerts when it breaks.
          </p>
          <CopyBox value={"plugmcp login\nplugmcp deploy --url https://your-host.example/mcp"} label="deploy commands" />
          <div className="row">
            <a className="btn btn-ghost" href={data.hostUrl} target="_blank" rel="noopener">
              Open plugmcp.ai <IconExternalLink size={14} stroke={1.75} />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
