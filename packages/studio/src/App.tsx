import {
  IconBook2,
  IconCheck,
  IconChevronRight,
  IconCopy,
  IconHome,
  IconKey,
  IconListDetails,
  IconMenu2,
  IconMessage,
  IconPlugConnected,
  IconPlus,
  IconRobot,
  IconSitemap,
  IconStack2,
  IconTool,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { NewTool } from "./NewTool";
import { AgentEditor, Agents } from "./pages/Agents";
import { CanvasPage } from "./pages/CanvasPage";
import { Connect } from "./pages/Connect";
import { DirectoryPage } from "./pages/DirectoryPage";
import { Home } from "./pages/Home";
import { Logs } from "./pages/Logs";
import { Playground } from "./pages/Playground";
import { SettingsPage } from "./pages/SettingsPage";
import { Tools } from "./pages/Tools";
import { StudioProvider, useStudio } from "./state";
import { Empty, Glyph, Mark, useCopy, useRoute } from "./ui";

interface NavItem {
  id: string;
  label: string;
  icon: Icon;
  badge?: number;
}

export function App() {
  return (
    <StudioProvider>
      <Shell />
    </StudioProvider>
  );
}

function Shell() {
  const { info, server, offline, agents, tools, model } = useStudio();
  const route = useRoute();
  const page = route[0] ?? "home";
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [copied, copy] = useCopy();

  useEffect(() => setMenu(false), [route]);

  const sections: Array<{ label: string; items: NavItem[] }> = [
    {
      label: "Build",
      items: [
        { id: "home", label: "Overview", icon: IconHome },
        { id: "tools", label: "Tools", icon: IconTool, badge: tools.length },
        { id: "playground", label: "Playground", icon: IconMessage },
        { id: "agents", label: "Agents", icon: IconRobot, badge: agents.length },
        { id: "canvas", label: "Canvas", icon: IconSitemap },
      ],
    },
    { label: "Observe", items: [{ id: "logs", label: "Logs", icon: IconListDetails, badge: server?.calls || undefined }] },
    {
      label: "Share",
      items: [
        { id: "connect", label: "Connect", icon: IconPlugConnected },
        { id: "directory", label: "Directory", icon: IconStack2 },
      ],
    },
  ];
  const labels: Record<string, string> = { settings: "Models and keys" };
  for (const section of sections) for (const item of section.items) labels[item.id] = item.label;

  const broken = info && !info.ok ? info : null;
  const status = offline ? "offline" : broken ? "error" : server ? "ok" : "loading";
  const address = server ? server.mcpUrl.replace("127.0.0.1", "localhost") : "";
  const fixed = ["tools", "playground", "canvas"].includes(page) || (page === "agents" && Boolean(route[1]));
  const sub = page === "agents" && route[1] ? (route[1].startsWith("new") ? "New agent" : (agents.find((agent) => agent.id === route[1])?.name ?? route[1])) : page === "tools" ? route[1] : undefined;

  return (
    <div className={`shell${menu ? " menu-open" : ""}`} onClick={(event) => menu && event.target === event.currentTarget && setMenu(false)}>
      <aside className="side">
        <a className="brand" href="#/" aria-label="PlugMCP Studio, overview">
          <Mark size={26} />
          <span className="brand-name">PlugMCP</span>
          <span className="brand-tag">Studio</span>
        </a>

        <div className="server-card">
          <div className="server-card-top">
            <Glyph name={server?.name ?? info?.project ?? "?"} />
            <div className="grow">
              <div className="server-name truncate">{server?.title ?? server?.name ?? info?.project ?? "Starting"}</div>
              <div className="server-state">
                <span className={`dot dot-${status}`} />
                {offline ? "Stopped" : broken ? "Error in the code" : server ? "Running" : "Starting"}
              </div>
            </div>
          </div>
          {address ? (
            <button type="button" className="addr" title="Copy the MCP address" onClick={() => copy(address)}>
              <span className="grow truncate">{address.replace("http://", "")}</span>
              {copied ? <IconCheck size={13} stroke={2} /> : <IconCopy size={13} stroke={1.75} />}
            </button>
          ) : null}
        </div>

        <nav className="nav" aria-label="Studio">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="nav-label">{section.label}</p>
              {section.items.map(({ id, label, icon: IconType, badge }) => (
                <a key={id} href={id === "home" ? "#/" : `#/${id}`} className={`nav-item${page === id ? " is-active" : ""}`} aria-current={page === id ? "page" : undefined}>
                  <IconType size={16} stroke={1.75} aria-hidden="true" />
                  {label}
                  {badge ? <span className="nav-badge">{badge}</span> : null}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <a className="nav-item" href="https://github.com/plugmcp-ai/sdk#readme" target="_blank" rel="noopener">
            <IconBook2 size={16} stroke={1.75} aria-hidden="true" />
            Docs
          </a>
          <a className={`key-card${page === "settings" ? " is-active" : ""}`} href="#/settings">
            <span className="icon-tile" style={{ width: 28, height: 28 }}>
              <IconKey size={15} stroke={1.75} />
            </span>
            <span className="grow">
              <span className="key-card-title truncate" style={{ display: "block" }}>{model ? model.label : "Connect a model"}</span>
              <span className="key-card-sub mono truncate" style={{ display: "block" }}>{model ? model.model : "Your own key, kept here"}</span>
            </span>
            <span className={`dot ${model ? "dot-ok" : ""}`} />
          </a>
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <div className="crumbs">
            <button type="button" className="btn btn-ghost btn-icon menu-btn" onClick={() => setMenu(true)} aria-label="Open menu">
              <IconMenu2 size={18} />
            </button>
            <span className="truncate hide-sm">{info?.project ?? "Project"}</span>
            <IconChevronRight size={13} className="hide-sm" />
            {sub ? (
              <>
                <a href={`#/${page}`}>{labels[page]}</a>
                <IconChevronRight size={13} />
                <span className="here truncate">{sub}</span>
              </>
            ) : (
              <span className="here">{labels[page] ?? "Overview"}</span>
            )}
          </div>
          <div className="top-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setAdding(true)} disabled={!server}>
              <IconPlus size={14} stroke={2} /> New tool
            </button>
            <a className="btn btn-ghost btn-sm hide-sm" href="https://plugmcp.ai/mcp" target="_blank" rel="noopener">
              plugmcp.ai
            </a>
          </div>
        </header>

        {broken ? (
          <div className="banner" role="alert">
            <span className="dot dot-error" style={{ marginTop: 6 }} />
            <div className="grow">
              <strong style={{ fontWeight: 500 }}>{broken.entry} has an error.</strong> Fix it and save. The Studio shows the last working version until then.
              <pre>{broken.error}</pre>
            </div>
          </div>
        ) : null}

        <main className={`content${fixed ? " is-fixed" : ""}`}>
          {offline ? (
            <div className="page">
              <Empty icon={IconPlugConnected} title="The dev server is not running">
                Start it again with plugmcp dev in your project folder. This page reconnects by itself.
              </Empty>
            </div>
          ) : !server ? (
            broken ? (
              <div className="page">
                <Empty icon={IconTool} title="Waiting for a working server file">
                  The Studio opens as soon as {broken.entry} loads without errors.
                </Empty>
              </div>
            ) : null
          ) : (
            <>
              {/* The playground stays mounted so a conversation survives a look at another page. */}
              <div hidden={page !== "playground"} style={{ flex: 1, minHeight: 0, display: page === "playground" ? "flex" : undefined }}>
                <Playground />
              </div>
              {page === "home" ? <Home onNew={() => setAdding(true)} /> : null}
              {page === "tools" ? <Tools selected={route[1]} onNew={() => setAdding(true)} /> : null}
              {page === "agents" ? route[1] ? <AgentEditor id={route[1]} /> : <Agents /> : null}
              {page === "canvas" ? <CanvasPage onNew={() => setAdding(true)} /> : null}
              {page === "logs" ? <Logs /> : null}
              {page === "directory" ? <DirectoryPage /> : null}
              {page === "connect" ? <Connect /> : null}
              {page === "settings" ? <SettingsPage /> : null}
            </>
          )}
        </main>
      </div>

      {adding ? <NewTool onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
