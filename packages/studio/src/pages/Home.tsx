import {
  IconAlertTriangle,
  IconBrowser,
  IconCheck,
  IconChevronRight,
  IconExternalLink,
  IconListDetails,
  IconMessage,
  IconPlayerPlay,
  IconPlus,
  IconSitemap,
  IconStack2,
  IconTool,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { CallRecord, DirectoryServer } from "../api";
import { useStudio, useWorkspace } from "../state";
import { CopyButton, Empty, Glyph, PageHead, SectionTitle, ago, plural } from "../ui";

export function Home({ onNew, onNewMcp }: { onNew: () => void; onNewMcp: () => void }) {
  const { server, model, remote } = useStudio();
  const space = useWorkspace();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [similar, setSimilar] = useState<DirectoryServer[]>([]);
  const total = server?.calls ?? 0;

  useEffect(() => {
    void api.logs().then((logs) => setCalls(logs.calls.slice(0, 5))).catch(() => undefined);
  }, [total]);

  // Show what already exists for this idea. One cached request per server name.
  const name = server?.name;
  useEffect(() => {
    if (!name) return;
    api
      .directory(name.replace(/[-_]/g, " "), false)
      .then((data) => setSimilar(data.servers.slice(0, 3)))
      .catch(() => undefined);
  }, [name]);

  if (!server) return null;
  const views = server.tools.filter((tool) => tool.view).length;
  const address = server.mcpUrl.replace("127.0.0.1", "localhost");
  const steps = [
    { id: "tool", label: "Add a tool", done: server.tools.length > 0, href: "#/tools", action: "Open tools" },
    { id: "run", label: "Run a tool and see its result", done: total > 0, href: server.tools[0] ? `#/tools/${server.tools[0].id}` : "#/tools", action: "Run one" },
    { id: "key", label: "Connect a model with your own key", done: Boolean(model), href: "#/settings", action: "Add a key" },
    { id: "chat", label: "Chat with your tools, or ask the chat to build one", done: Boolean(model) && total > 1, href: "#/playground", action: "Open the chat" },
    { id: "connect", label: "Connect Cursor, Claude or another client", done: false, href: "#/connect", action: "Install steps" },
  ];
  const done = steps.filter((step) => step.done).length;

  return (
    <div className="page">
      <PageHead
        title={space.name || "Workspace"}
        lede={`${plural(space.servers.length, "MCP server")} in this folder. Each one is a set of tools behind its own address. Pick one to work on it, or start another.`}
      >
        <button type="button" className="btn btn-primary" onClick={onNewMcp}>
          <IconPlus size={15} stroke={2} /> New MCP server
        </button>
      </PageHead>

      <div className="cards">
        {space.servers.map((item) => {
          const current = item.id === space.current;
          return (
            <button key={item.id} type="button" className={`card mcp-card${current ? " is-current" : ""}`} onClick={() => space.switchTo(item.id)} aria-pressed={current}>
              <div className="row">
                <Glyph name={item.ok ? item.name : item.id} />
                <div className="grow">
                  <div className="card-title truncate">{item.ok ? (item.title ?? item.name) : item.id}</div>
                  <div className="row-sub mono truncate">{item.mcpUrl.replace("http://127.0.0.1", "localhost")}</div>
                </div>
                <span className={`dot ${item.ok ? "dot-ok" : "dot-error"}`} />
              </div>
              <p className="card-text clamp-2">{item.ok ? (item.description ?? "No description yet.") : "The server file has an error. Open it to see what is wrong."}</p>
              <div className="card-foot">
                <span className="row">
                  {item.ok ? <span className="pill">{plural(item.tools.length, "tool")}</span> : <span className="pill pill-fault">Error</span>}
                  {item.ok && item.tools.some((tool) => tool.view) ? <span className="pill pill-signal">{plural(item.tools.filter((tool) => tool.view).length, "view")}</span> : null}
                </span>
                <span className={current ? "small" : "muted small"} style={current ? { color: "var(--signal-2)" } : undefined}>{current ? "Open now" : "Open"}</span>
              </div>
            </button>
          );
        })}
        <button type="button" className="card card-dashed" onClick={onNewMcp}>
          <IconPlus size={18} stroke={1.75} />
          New MCP server
        </button>
      </div>

      <div className="page-head mcp-head">
        <div className="hero grow">
          <Glyph name={server.title ?? server.name} large />
          <div className="grow">
            <h1 className="truncate">{server.title ?? server.name}</h1>
            <p className="lede" style={{ marginTop: 2 }}>{server.description ?? `Running from ${server.file}.`}</p>
          </div>
        </div>
        <div className="row-wrap">
          <a className="btn btn-outline" href="#/canvas">
            <IconSitemap size={15} stroke={1.75} /> Canvas
          </a>
          <a className="btn btn-outline" href="#/playground">
            <IconMessage size={15} stroke={1.75} /> Chat
          </a>
          <button type="button" className="btn btn-secondary" onClick={onNew}>
            <IconPlus size={15} stroke={2} /> New tool
          </button>
        </div>
      </div>

      <div className="stats">
        <Stat href="#/tools" icon={IconTool} label="Tools" value={server.tools.length} />
        <Stat href="#/tools" icon={IconBrowser} label="Views" value={views} />
        <Stat href="#/logs" icon={IconListDetails} label="Calls this session" value={total} />
        <Stat href="#/logs" icon={IconAlertTriangle} label="Failed calls" value={server.failed} tone={server.failed ? "fault" : undefined} />
      </div>

      <div className="grid-2">
        <div className="stack-lg">
          <section>
            <SectionTitle
              icon={IconTool}
              action={
                <a className="link small" href="#/tools">
                  All tools
                </a>
              }
            >
              Tools
            </SectionTitle>
            {server.tools.length === 0 ? (
              <Empty
                icon={IconTool}
                title="No tools yet"
                actions={
                  <button type="button" className="btn btn-primary" onClick={onNew}>
                    <IconPlus size={15} stroke={2} /> New tool
                  </button>
                }
              >
                A tool is one function a model can call. Describe what you want and your model writes it, or start from a blank one.
              </Empty>
            ) : (
              <div className="panel rows">
                {server.tools.slice(0, 6).map((tool) => (
                  <a key={tool.id} className="rowlink" href={`#/tools/${tool.id}`}>
                    <span className="icon-tile">{tool.view ? <IconBrowser size={16} stroke={1.75} /> : <IconTool size={16} stroke={1.75} />}</span>
                    <span className="grow">
                      <span className="row-title mono truncate" style={{ display: "block" }}>{tool.name}</span>
                      <span className="row-sub truncate" style={{ display: "block" }}>{tool.description ?? "No description yet"}</span>
                    </span>
                    {tool.view ? <span className="pill pill-signal hide-sm">View</span> : null}
                    <span className="btn btn-outline btn-sm hide-sm">
                      <IconPlayerPlay size={13} stroke={2} /> Run
                    </span>
                    <IconChevronRight size={14} className="chev" />
                  </a>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionTitle
              icon={IconListDetails}
              action={
                <a className="link small" href="#/logs">
                  All calls
                </a>
              }
            >
              Recent calls
            </SectionTitle>
            {calls.length === 0 ? (
              <p className="panel panel-pad muted small">Calls from the Studio, your editor and any other connected client show up here as they happen.</p>
            ) : (
              <div className="panel rows">
                {calls.map((call) => (
                  <a key={call.id} className="rowlink" href="#/logs">
                    <span className={`dot ${call.ok ? "dot-ok" : "dot-error"}`} />
                    <span className="mono grow truncate" style={{ fontSize: 13 }}>{call.tool}</span>
                    <span className="num">{call.ms} ms</span>
                    <span className="num hide-sm">{ago(call.at)}</span>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="stack-lg">
          {done < steps.length ? (
            <section>
              <SectionTitle
                icon={IconCheck}
                action={
                  <span className="progress" aria-label={`${done} of ${steps.length} done`}>
                    {steps.map((step) => (
                      <span key={step.id} className={step.done ? "is-done" : ""} />
                    ))}
                  </span>
                }
              >
                Get started
              </SectionTitle>
              <ul className="panel steps">
                {steps.map((step) => (
                  <li key={step.id} className={step.done ? "is-done" : ""}>
                    <span className={`step-mark${step.done ? " is-done" : ""}`}>{step.done ? <IconCheck size={12} stroke={3} /> : null}</span>
                    <span className="row-title grow">{step.label}</span>
                    {step.done ? null : (
                      <a className="link small" href={step.href}>
                        {step.action}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <SectionTitle icon={IconExternalLink} action={<a className="link small" href="#/connect">Install steps</a>}>
              Connect a client
            </SectionTitle>
            <div className="panel panel-pad stack">
              <p className="muted small">Point Cursor, VS Code, Claude Code or any MCP client at this address while the dev server runs.</p>
              <div className="row">
                <code className="code grow truncate" style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{address}</code>
                <CopyButton value={address} label="Copy the address" />
              </div>
            </div>
          </section>

          <section>
            <SectionTitle icon={IconStack2} action={<a className="link small" href="#/directory">Browse</a>}>
              Already in the directory
            </SectionTitle>
            <div className="panel rows">
              {similar.map((item) => (
                <a key={item.slug} className="rowlink" href={item.url} target="_blank" rel="noopener">
                  <Glyph name={item.name} />
                  <span className="grow">
                    <span className="row-title truncate" style={{ display: "block" }}>{item.name}</span>
                    <span className="row-sub truncate" style={{ display: "block" }}>{item.remote ? "Hosted" : "Runs locally"}{item.publisher ? ` · ${item.publisher}` : ""}</span>
                  </span>
                  <IconExternalLink size={14} className="chev" />
                </a>
              ))}
              {similar.length === 0 ? <p className="panel-pad muted small">Search 70,000+ servers on plugmcp.ai before you build, and add hosted ones to your chat.</p> : null}
            </div>
            {remote.length ? <p className="hint" style={{ marginTop: 8 }}>{remote.length} added to your chat.</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ href, icon: IconType, label, value, tone }: { href: string; icon: typeof IconTool; label: string; value: number; tone?: "fault" }) {
  return (
    <a className="panel stat" href={href}>
      <span className="grow">
        <span className="stat-label">
          <IconType size={14} stroke={1.75} style={tone ? { color: "var(--fault)" } : undefined} />
          <span className="truncate">{label}</span>
        </span>
        <span className="stat-value" style={{ display: "block" }}>{value.toLocaleString()}</span>
      </span>
      <IconChevronRight size={14} />
    </a>
  );
}
