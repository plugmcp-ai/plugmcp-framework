import { IconBook2, IconCheck, IconCopy, IconMessage, IconRocket, IconSchema, IconWorldSearch } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { Canvas } from "./Canvas";
import { Chat } from "./Chat";
import { Directory } from "./Directory";
import { Ship } from "./Ship";
import { api } from "./api";
import type { Info } from "./api";

const TABS = [
  { id: "canvas", label: "Canvas", icon: IconSchema },
  { id: "chat", label: "Chat", icon: IconMessage },
  { id: "directory", label: "Directory", icon: IconWorldSearch },
  { id: "ship", label: "Ship", icon: IconRocket },
] as const;

type TabId = (typeof TABS)[number]["id"];

const initialTab = (): TabId => {
  const hash = window.location.hash.slice(1);
  return TABS.some((tab) => tab.id === hash) ? (hash as TabId) : "canvas";
};

export function App() {
  const [info, setInfo] = useState<Info | null>(null);
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState<TabId>(initialTab);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    api
      .info()
      .then((next) => {
        setOffline(false);
        // Keep the same object when nothing changed so the canvas does not redraw.
        setInfo((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      })
      .catch(() => setOffline(true));
  }, []);

  // The server reloads when a file is saved. Ask it what it has now.
  useEffect(() => {
    refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), 1500);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    window.history.replaceState(null, "", `#${tab}`);
  }, [tab]);

  useEffect(() => {
    const onHash = () => setTab(initialTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const status = offline ? "offline" : info?.ok ? "ok" : info ? "error" : "loading";
  const mcpUrl = info?.ok ? info.mcpUrl.replace("127.0.0.1", "localhost") : "";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">PlugMCP</span>
          <span className="brand-sub">Studio</span>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`tab${tab === id ? " is-active" : ""}`} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}>
              <Icon size={16} stroke={1.75} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="topbar-end">
          {mcpUrl ? (
            <button
              className="address"
              title="Copy the MCP address"
              onClick={async () => {
                await navigator.clipboard.writeText(mcpUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <span className={`dot dot-${status}`} />
              <span className="mono">{mcpUrl.replace("http://", "")}</span>
              {copied ? <IconCheck size={14} stroke={2} /> : <IconCopy size={14} stroke={1.75} />}
            </button>
          ) : (
            <span className="address">
              <span className={`dot dot-${status}`} />
              {offline ? "Server stopped" : "Starting"}
            </span>
          )}
          <a className="icon-btn" href="https://github.com/plugmcp-ai/sdk#readme" target="_blank" rel="noopener" aria-label="Docs" title="Docs">
            <IconBook2 size={18} stroke={1.75} />
          </a>
        </div>
      </header>

      <main className="main">
        {offline ? (
          <div className="page">
            <div className="page-head">
              <h1>The server is not running</h1>
              <p className="note">
                Start it again with <span className="mono">plugmcp dev</span>. This page reconnects by itself.
              </p>
            </div>
          </div>
        ) : !info ? null : !info.ok ? (
          <div className="page">
            <div className="page-head">
              <h1>{info.entry} has an error</h1>
              <p className="note">Fix it and save. This page updates by itself.</p>
            </div>
            <pre className="code fault">{info.error}</pre>
          </div>
        ) : (
          <>
            {/* Chat stays mounted so a conversation survives a look at another tab. */}
            <div hidden={tab !== "canvas"} className="tab-panel">
              {tab === "canvas" ? <Canvas info={info} onChanged={refresh} /> : null}
            </div>
            <div hidden={tab !== "chat"} className="tab-panel">
              <Chat info={info} />
            </div>
            {tab === "directory" ? <Directory /> : null}
            {tab === "ship" ? <Ship /> : null}
          </>
        )}
      </main>
    </div>
  );
}
