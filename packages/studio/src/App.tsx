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
  IconSelector,
  IconSitemap,
  IconStack2,
  IconTestPipe,
  IconTool,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { EditMcp } from "./EditMcp";
import { NewMcp } from "./NewMcp";
import { TestsPage } from "./Tests";
import { NewTool } from "./NewTool";
import { CanvasPage } from "./pages/CanvasPage";
import { Connect } from "./pages/Connect";
import { DirectoryPage } from "./pages/DirectoryPage";
import { Home } from "./pages/Home";
import { Logs } from "./pages/Logs";
import { Playground } from "./pages/Playground";
import { SettingsPage } from "./pages/SettingsPage";
import { Tools } from "./pages/Tools";
import { WorkspaceProvider, useStudio, useWorkspace } from "./state";
import { Empty, Glyph, Mark, useCopy, useRoute } from "./ui";

interface NavItem {
  id: string;
  label: string;
  icon: Icon;
  badge?: number;
}

export function App() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

function Shell() {
  const { info, server, offline, tools, model } = useStudio();
  const route = useRoute();
  const page = route[0] ?? "home";
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingMcp, setAddingMcp] = useState(false);
  const [editingMcp, setEditingMcp] = useState(false);
  const [picker, setPicker] = useState(false);
  const [copied, copy] = useCopy();
  const space = useWorkspace();

  useEffect(() => {
    setMenu(false);
    setPicker(false);
  }, [route]);

  const sections: Array<{ label: string; items: NavItem[] }> = [
    {
      label: "Build",
      items: [
        { id: "home", label: "Overview", icon: IconHome },
        { id: "tools", label: "Tools", icon: IconTool, badge: tools.length },
        { id: "canvas", label: "Canvas", icon: IconSitemap },
      ],
    },
    {
      label: "Test",
      items: [
        { id: "playground", label: "Chat", icon: IconMessage },
        { id: "tests", label: "Tests", icon: IconTestPipe },
        { id: "logs", label: "Logs", icon: IconListDetails, badge: server?.calls || undefined },
      ],
    },
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
  const fixed = ["tools", "playground", "canvas"].includes(page);
  const sub = page === "tools" || page === "canvas" ? route[1] : undefined;

  return (
    <div className={`shell${menu ? " menu-open" : ""}`} onClick={(event) => menu && event.target === event.currentTarget && setMenu(false)}>
      <aside className="side">
        <a className="brand" href="#/" aria-label="PlugMCP Studio, overview">
          <Mark size={26} />
          <span className="brand-name">PlugMCP</span>
          <span className="brand-tag">Studio</span>
        </a>

        <div className="server-card">
          <button type="button" className="server-card-top switch-btn" onClick={() => setPicker((open) => !open)} aria-expanded={picker} aria-label="Choose an MCP server">
            <Glyph name={server?.name ?? info?.project ?? "?"} />
            <div className="grow">
              <div className="server-name truncate">{server?.title ?? server?.name ?? info?.project ?? "Starting"}</div>
              <div className="server-state">
                <span className={`dot dot-${status}`} />
                {offline ? "Stopped" : broken ? "Error in the code" : server ? "MCP server, running" : "Starting"}
              </div>
            </div>
            <IconSelector size={15} stroke={1.75} className="muted" />
          </button>
          {picker ? (
            <div className="switch-menu">
              <p className="nav-label">MCP servers in {space.name || "this folder"}</p>
              {space.servers.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`switch-item${item.id === space.current ? " is-active" : ""}`}
                  onClick={() => {
                    setPicker(false);
                    space.switchTo(item.id);
                  }}
                >
                  <Glyph name={item.ok ? item.name : item.id} />
                  <span className="grow">
                    <span className="truncate" style={{ display: "block" }}>{item.ok ? (item.title ?? item.name) : item.id}</span>
                    <span className="row-sub" style={{ display: "block" }}>{item.ok ? `${item.tools.length} tool${item.tools.length === 1 ? "" : "s"}` : "Error in the code"}</span>
                  </span>
                  {item.id === space.current ? <IconCheck size={14} stroke={2} /> : null}
                </button>
              ))}
              <button
                type="button"
                className="switch-item switch-new"
                onClick={() => {
                  setPicker(false);
                  setAddingMcp(true);
                }}
              >
                <span className="icon-tile" style={{ width: 28, height: 28 }}>
                  <IconPlus size={15} stroke={2} />
                </span>
                New MCP server
              </button>
            </div>
          ) : null}
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
          <a className="go-live" href="https://plugmcp.ai/app" target="_blank" rel="noopener">
            <span className="go-live-title">Go live on plugmcp.ai</span>
            <span className="go-live-sub">Hosting, API keys, call logs and a directory page for this server.</span>
          </a>
          <a className="nav-item" href="https://github.com/plugmcp-ai/plugmcp-framework#readme" target="_blank" rel="noopener">
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
            {space.servers.length > 1 ? (
              <>
                <span className="truncate hide-sm">{space.name || "Workspace"}</span>
                <IconChevronRight size={13} className="hide-sm" />
              </>
            ) : null}
            <span className="truncate hide-sm">{server?.title ?? server?.name ?? info?.project ?? "MCP server"}</span>
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
              <strong style={{ fontWeight: 500 }}>{broken.file} has an error.</strong> Fix it and save. The Studio shows the last working version until then.
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
                  The Studio opens as soon as {broken.file} loads without errors.
                </Empty>
              </div>
            ) : null
          ) : (
            <>
              {/* The chat stays mounted so a conversation survives a look at another page. */}
              <div hidden={page !== "playground"} style={{ flex: 1, minHeight: 0, display: page === "playground" ? "flex" : undefined }}>
                <Playground />
              </div>
              {page === "home" ? <Home onNew={() => setAdding(true)} onNewMcp={() => setAddingMcp(true)} onEditMcp={() => setEditingMcp(true)} /> : null}
              {page === "tests" ? <TestsPage /> : null}
              {page === "tools" ? <Tools selected={route[1]} onNew={() => setAdding(true)} /> : null}
              {page === "canvas" ? <CanvasPage selected={route[1]} onNew={() => setAdding(true)} onEditMcp={() => setEditingMcp(true)} /> : null}
              {page === "logs" ? <Logs /> : null}
              {page === "directory" ? <DirectoryPage /> : null}
              {page === "connect" ? <Connect /> : null}
              {page === "settings" ? <SettingsPage /> : null}
            </>
          )}
        </main>
      </div>

      {adding ? <NewTool onClose={() => setAdding(false)} /> : null}
      {addingMcp ? <NewMcp onClose={() => setAddingMcp(false)} /> : null}
      {editingMcp ? <EditMcp onClose={() => setEditingMcp(false)} /> : null}
    </div>
  );
}
