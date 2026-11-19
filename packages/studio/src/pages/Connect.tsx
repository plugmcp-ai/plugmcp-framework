import { IconExternalLink } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Ship } from "../api";
import { CopyBox, PageHead, Seg, errorText } from "../ui";

export function Connect() {
  const [data, setData] = useState<Ship | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"local" | "live">("local");
  const [client, setClient] = useState("");

  useEffect(() => {
    api.ship().then(setData).catch((cause: unknown) => setError(errorText(cause)));
  }, []);

  const links = data?.snippets.filter((snippet) => snippet.kind === "link") ?? [];
  const local = data?.snippets.filter((snippet) => snippet.kind === "code" && !["claude", "chatgpt"].includes(snippet.id)) ?? [];
  const shown = local.find((snippet) => snippet.id === client) ?? local[0];

  return (
    <div className="page page-narrow">
      <PageHead title="Connect" lede="Use the server in your editor now. Put it online and list it when it is ready for other people.">
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { id: "local", label: "On this machine" },
            { id: "live", label: "Go live" },
          ]}
        />
      </PageHead>
      {error ? <p className="small fault">{error}</p> : null}

      {data && tab === "local" ? (
        <>
          <section className="panel panel-pad stack">
            <h2>One click</h2>
            <p className="muted small">These add the server running here to your editor. It works while plugmcp dev is running.</p>
            <div className="row-wrap">
              {links.map((snippet) => (
                <a key={snippet.id} className="btn btn-secondary" href={snippet.value}>
                  Add to {snippet.label}
                </a>
              ))}
            </div>
          </section>
          {shown ? (
            <section className="panel panel-pad stack">
              <div className="row-wrap" style={{ justifyContent: "space-between" }}>
                <h2>Other clients</h2>
                <Seg value={shown.id} onChange={setClient} options={local.map((snippet) => ({ id: snippet.id, label: snippet.label }))} />
              </div>
              {shown.hint ? <p className="muted small">{shown.hint}</p> : null}
              <CopyBox value={shown.value} label={shown.label} />
            </section>
          ) : null}
          <p className="muted small">
            Claude and ChatGPT connect over the internet, so they need a public address.{" "}
            <button type="button" className="link" onClick={() => setTab("live")}>
              See how to go live
            </button>
          </p>
        </>
      ) : null}

      {data && tab === "live" ? (
        <ol className="numbered">
          <li className="panel">
            <div className="stack">
              <h2>Put it online</h2>
              <p className="muted small">Build it, then run it on any host that runs Node, such as Railway or Fly. It reads the PORT the host sets. The result is a plain Node server with nothing tied to PlugMCP.</p>
              <CopyBox value={"plugmcp build\nplugmcp start"} label="the build commands" />
            </div>
          </li>
          <li className="panel">
            <div className="stack">
              <h2>List it in the directory</h2>
              <p className="muted small">A page on plugmcp.ai where people and agents find your server, with install buttons for every client.</p>
              <CopyBox value={"plugmcp list --url https://your-host.example/mcp"} label="the list command" />
              <p className="hint">Optional badge for your README. It links to your page once the server is listed.</p>
              <CopyBox value={data.badge} label="the badge" />
            </div>
          </li>
          <li className="panel">
            <div className="stack">
              <h2>Add keys, logs and alerts</h2>
              <p className="muted small">Put the hosted server behind plugmcp.ai to get a gateway address, API keys you can revoke, a log of every call and alerts when it breaks.</p>
              <CopyBox value={"plugmcp login\nplugmcp deploy --url https://your-host.example/mcp"} label="the deploy commands" />
              <div className="row-wrap">
                <a className="btn btn-outline" href={data.hostUrl} target="_blank" rel="noopener">
                  Open plugmcp.ai <IconExternalLink size={14} stroke={1.75} />
                </a>
              </div>
            </div>
          </li>
        </ol>
      ) : null}
    </div>
  );
}
