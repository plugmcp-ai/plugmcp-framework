import { IconArrowLeft, IconBrowser, IconMessage, IconPlayerPlay, IconPlus, IconSearch, IconTool } from "@tabler/icons-react";
import { useState } from "react";
import { Editor } from "../Editor";
import { SchemaForm } from "../SchemaForm";
import { ViewFrame } from "../ViewFrame";
import { api } from "../api";
import type { JsonSchema, Tool, ToolResult } from "../api";
import { useStudio } from "../state";
import { CopyButton, Empty, Seg, errorText, go, plural } from "../ui";

export function Tools({ selected, onNew }: { selected?: string; onNew: () => void }) {
  const { server, remote, tools, refresh } = useStudio();
  const [query, setQuery] = useState("");
  if (!server) return null;
  const match = (tool: Tool) => !query || `${tool.name} ${tool.description ?? ""}`.toLowerCase().includes(query.toLowerCase());
  const groups = [
    { name: server.name, note: "This server", tools: server.tools.filter(match) },
    ...remote.map((item) => ({ name: item.name, note: "Added from the directory", tools: item.tools.filter(match) })),
  ];
  const tool = tools.find((item) => item.id === selected) ?? null;

  return (
    <div className={`split${tool ? " has-pick" : ""}`}>
      <div className="split-list">
        <div className="split-list-head">
          <div className="row">
            <h2 className="grow" style={{ paddingLeft: 4 }}>
              Tools <span className="muted" style={{ fontWeight: 400 }}>{tools.length}</span>
            </h2>
            <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>
              <IconPlus size={14} stroke={2} /> New tool
            </button>
          </div>
          {tools.length > 5 ? (
            <div className="search">
              <IconSearch size={15} stroke={1.75} />
              <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter tools" aria-label="Filter tools" />
            </div>
          ) : null}
        </div>
        <div className="split-list-body">
          {groups.map((group) =>
            group.tools.length || group.note === "This server" ? (
              <div key={group.name}>
                <div className="group-label">
                  {group.name} <span style={{ fontWeight: 400 }}>· {group.note}</span>
                </div>
                {group.tools.map((item) => (
                  <button key={item.id} type="button" className={`tool-item${item.id === selected ? " is-active" : ""}`} onClick={() => go(`/tools/${item.id}`)}>
                    <span className="tool-item-name">
                      <span className="truncate">{item.name}</span>
                      {item.view ? <IconBrowser size={13} stroke={1.75} aria-label="Has a view" /> : null}
                    </span>
                    <span className="tool-item-desc truncate">{item.description ?? "No description yet"}</span>
                  </button>
                ))}
                {group.tools.length === 0 ? <p className="hint" style={{ padding: "4px 8px" }}>{query ? "Nothing matches." : "No tools yet."}</p> : null}
              </div>
            ) : null,
          )}
        </div>
      </div>

      <div className="split-detail">
        {tool ? (
          <ToolDetail key={tool.id} tool={tool} entry={server.entry} onSaved={refresh} />
        ) : (
          <div className="detail">
            <Empty
              icon={IconTool}
              title={tools.length ? "Pick a tool" : "No tools yet"}
              actions={
                <button type="button" className="btn btn-primary" onClick={onNew}>
                  <IconPlus size={15} stroke={2} /> New tool
                </button>
              }
            >
              {tools.length
                ? "Choose a tool on the left to run it, see its view, and edit its code."
                : `A tool is one function a model can call. Add one here, or write server.tool(...) in ${server.entry}.`}
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = "test" | "code" | "view" | "schema";

function ToolDetail({ tool, entry, onSaved }: { tool: Tool; entry: string; onSaved: () => void }) {
  const [tab, setTab] = useState<Tab>("test");
  const tabs: Array<{ id: Tab; label: string }> = [{ id: "test", label: "Test" }];
  if (tool.local) tabs.push({ id: "code", label: "Code" });
  if (tool.local && tool.viewFile) tabs.push({ id: "view", label: "View code" });
  tabs.push({ id: "schema", label: "Schema" });

  return (
    <div className="detail">
      <div className="detail-head">
        <div className="grow">
          <button type="button" className="btn btn-ghost btn-sm only-sm" style={{ marginLeft: -10, marginBottom: 6 }} onClick={() => go("/tools")}>
            <IconArrowLeft size={14} /> All tools
          </button>
          <div className="row">
            <h1 className="truncate">{tool.name}</h1>
            <CopyButton value={tool.name} label="Copy the name" />
            {tool.view ? <span className="pill pill-signal">Has a view</span> : null}
            {!tool.local ? <span className="pill">{tool.server}</span> : null}
          </div>
          <p className="muted" style={{ marginTop: 6, maxWidth: "72ch" }}>
            {tool.description ?? "No description yet. Add one so a model knows when to call this tool."}
          </p>
        </div>
        <a className="btn btn-outline" href="#/playground">
          <IconMessage size={15} stroke={1.75} /> Try in chat
        </a>
      </div>

      <Seg value={tab} options={tabs} onChange={setTab} />

      {tab === "test" ? <TestPane tool={tool} /> : null}
      {tab === "code" ? <Editor path={entry} onSaved={onSaved} /> : null}
      {tab === "view" && tool.viewFile ? <Editor path={tool.viewFile} onSaved={onSaved} /> : null}
      {tab === "schema" ? <SchemaPane schema={tool.inputSchema} /> : null}
    </div>
  );
}

function TestPane({ tool }: { tool: Tool }) {
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [sent, setSent] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<ToolResult | undefined>();
  const [ms, setMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [show, setShow] = useState<"view" | "json">(tool.view ? "view" : "json");

  async function test() {
    setBusy(true);
    setError(null);
    setResult(undefined);
    setSent(args);
    setRun((count) => count + 1);
    try {
      const response = await api.call(tool.local ? "local" : tool.server, tool.name, args);
      setResult(response.result);
      setMs(response.ms);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  const text = result?.content?.filter((block) => block.type === "text").map((block) => block.text).join("\n");
  const json = result ? (result.structuredContent ? JSON.stringify(result.structuredContent, null, 2) : (text ?? "")) : "";

  return (
    <div className="test-grid">
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          void test();
        }}
      >
        <div className="panel-head">
          <h2 className="section-title">Input</h2>
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
            <IconPlayerPlay size={14} stroke={2} /> {busy ? "Running" : "Run tool"}
          </button>
        </div>
        <div className="panel-pad">
          <SchemaForm schema={tool.inputSchema} value={args} onChange={setArgs} />
        </div>
      </form>

      <div className="panel">
        <div className="panel-head">
          <h2 className="section-title">
            Result
            {result ? <span className={`pill ${result.isError ? "pill-fault" : "pill-ok"}`}>{result.isError ? "Error" : "OK"}</span> : null}
            {result && ms !== null ? <span className="num">{ms} ms</span> : null}
          </h2>
          {tool.view ? (
            <Seg
              value={show}
              onChange={setShow}
              options={[
                { id: "view", label: "View" },
                { id: "json", label: "Data" },
              ]}
            />
          ) : result ? (
            <CopyButton value={json} label="Copy the result" />
          ) : null}
        </div>
        <div className="panel-pad stack">
          {error ? <p className="small fault">{error}</p> : null}
          {!sent && !error ? (
            <p className="muted small">Fill in the input and run the tool. {tool.view ? "Its view appears here the way a chat client shows it." : "The result appears here."}</p>
          ) : null}
          {tool.view && sent ? (
            <div className="view-stage" hidden={show !== "view"}>
              <ViewFrame key={run} server={tool.local ? "local" : tool.server} uri={tool.view} input={sent} result={result} />
            </div>
          ) : null}
          {sent && (show === "json" || !tool.view) ? <pre className="code">{busy ? "Running" : json}</pre> : null}
          {tool.view && tool.viewFile && sent && show === "view" ? <p className="hint">Edit {tool.viewFile} and this updates without a restart.</p> : null}
        </div>
      </div>
    </div>
  );
}

const typeName = (schema: JsonSchema): string => {
  const type = Array.isArray(schema.type) ? schema.type.filter((item) => item !== "null").join(" or ") : schema.type;
  if (schema.enum) return "one of";
  return type === "array" && schema.items ? `${typeName(schema.items)} list` : (type ?? "any");
};

function SchemaPane({ schema }: { schema: JsonSchema }) {
  const fields = Object.entries(schema.properties ?? {});
  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <h2 className="section-title">Input fields</h2>
          <span className="muted small">{plural(fields.length, "field")}</span>
        </div>
        {fields.length === 0 ? <p className="panel-pad muted small">This tool takes no input.</p> : null}
        {fields.map(([name, field]) => (
          <div className="schema-row" key={name}>
            <span className="mono">
              {name}
              {schema.required?.includes(name) ? null : <span className="muted"> ?</span>}
            </span>
            <span className="muted">{typeName(field)}</span>
            <span className="muted">
              {field.enum ? `${field.enum.map(String).join(", ")}. ` : ""}
              {field.description ?? ""}
            </span>
          </div>
        ))}
      </div>
      <div>
        <div className="section-head">
          <h2 className="section-title">JSON Schema</h2>
          <CopyButton value={JSON.stringify(schema, null, 2)} label="Copy the schema" />
        </div>
        <pre className="code">{JSON.stringify(schema, null, 2)}</pre>
      </div>
    </div>
  );
}
