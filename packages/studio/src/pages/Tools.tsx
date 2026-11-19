import { IconArrowLeft, IconBrowser, IconList, IconMessage, IconPencil, IconPlayerPlay, IconPlus, IconSearch, IconSitemap, IconTool } from "@tabler/icons-react";
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
          <Seg
            value="list"
            onChange={(next: "list" | "canvas") => next === "canvas" && go(selected ? `/canvas/${selected}` : "/canvas")}
            options={[
              { id: "list", label: (<><IconList size={14} stroke={1.75} /> List</>) },
              { id: "canvas", label: (<><IconSitemap size={14} stroke={1.75} /> Canvas</>) },
            ]}
          />
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
                ? "Choose a tool on the left to see its schema, run it, and edit its code."
                : `A tool is one function a model can call. Add one here, or write server.tool(...) in ${server.entry}.`}
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = "schema" | "code" | "view";

/** Change a tool's description without opening the code. */
function Description({ tool, onSaved }: { tool: Tool; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tool.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <p className="muted" style={{ marginTop: 6, maxWidth: "72ch" }}>
        {tool.description ?? "No description yet. Add one so a model knows when to call this tool."}{" "}
        {tool.local ? (
          <button type="button" className="link small" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setEditing(true)}>
            <IconPencil size={12} stroke={1.75} style={{ verticalAlign: -1 }} /> Edit
          </button>
        ) : null}
      </p>
    );
  }
  return (
    <form
      className="stack"
      style={{ marginTop: 8, gap: 8 }}
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        api
          .describeTool(tool.name, draft)
          .then(() => {
            onSaved();
            setEditing(false);
          })
          .catch((cause: unknown) => setError(errorText(cause)))
          .finally(() => setBusy(false));
      }}
    >
      <textarea className="input" rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Description" autoFocus />
      <p className="hint">The model reads this to decide when to call the tool.</p>
      {error ? <p className="small fault">{error}</p> : null}
      <div className="row">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !draft.trim()}>
          {busy ? "Saving" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ToolDetail({ tool, entry, onSaved, back = "/tools" }: { tool: Tool; entry: string; onSaved: () => void; back?: string }) {
  const [tab, setTab] = useState<Tab>("schema");
  const tabs: Array<{ id: Tab; label: string }> = [{ id: "schema", label: "Schema" }];
  if (tool.local) tabs.push({ id: "code", label: "Code" });
  if (tool.local && tool.viewFile) tabs.push({ id: "view", label: "View code" });

  return (
    <div className="detail">
      <div className="detail-head">
        <div className="grow">
          <button type="button" className="btn btn-ghost btn-sm only-sm" style={{ marginLeft: -10, marginBottom: 6 }} onClick={() => go(back)}>
            <IconArrowLeft size={14} /> {back === "/tools" ? "All tools" : "Canvas"}
          </button>
          <div className="row">
            <h1 className="truncate">{tool.name}</h1>
            <CopyButton value={tool.name} label="Copy the name" />
            <span className={`pill${tool.view ? " pill-signal" : ""}`}>{tool.view ? "MCP app" : "Tool"}</span>
            {!tool.local ? <span className="pill">{tool.server}</span> : null}
          </div>
          <Description key={tool.description} tool={tool} onSaved={onSaved} />
        </div>
        <a className="btn btn-outline" href="#/playground">
          <IconMessage size={15} stroke={1.75} /> Try in chat
        </a>
      </div>

      <div className="tool-body">
        <div className="stack" style={{ minWidth: 0 }}>
          <Seg value={tab} options={tabs} onChange={setTab} />
          {tab === "schema" ? <SchemaPane tool={tool} /> : null}
          {tab === "code" ? <Editor path={entry} onSaved={onSaved} /> : null}
          {tab === "view" && tool.viewFile ? <Editor path={tool.viewFile} onSaved={onSaved} /> : null}
        </div>
        <aside className="tool-run" aria-label="Run the tool">
          <TestPane tool={tool} />
        </aside>
      </div>
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
          <h2 className="section-title">Try it</h2>
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
            <p className="muted small">Fill in the input and press Run. {tool.view ? "Its view appears here the way a chat client shows it." : "The result appears here."}</p>
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

function SchemaPane({ tool }: { tool: Tool }) {
  const schema = tool.inputSchema;
  const fields = Object.entries(schema.properties ?? {});
  const [raw, setRaw] = useState(false);
  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <h2 className="section-title">Input</h2>
          <span className="muted small">{fields.length ? `${plural(fields.length, "field")} the model fills in` : "Nothing to fill in"}</span>
        </div>
        {fields.length === 0 ? <p className="panel-pad muted small">This tool takes no input. The model calls it as is.</p> : null}
        {fields.map(([name, field]) => {
          const required = schema.required?.includes(name) ?? false;
          return (
            <div className="field-row" key={name}>
              <div className="field-row-top">
                <span className="mono field-name">{name}</span>
                <span className="pill">{typeName(field)}</span>
                <span className={`pill${required ? " pill-signal" : ""}`}>{required ? "Required" : "Optional"}</span>
              </div>
              <p className="field-text">{field.description ?? "No description. Add .describe(...) in the code so the model knows what to send."}</p>
              {field.enum ? (
                <div className="row-wrap">
                  {field.enum.map((value) => (
                    <span key={String(value)} className="node-chip mono">
                      {String(value)}
                    </span>
                  ))}
                </div>
              ) : null}
              {field.default !== undefined ? <p className="hint">Default: <span className="mono">{JSON.stringify(field.default)}</span></p> : null}
            </div>
          );
        })}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2 className="section-title">Output</h2>
          <span className={`pill${tool.view ? " pill-signal" : ""}`}>{tool.view ? "Data and a view" : "Data"}</span>
        </div>
        <p className="panel-pad muted small">
          {tool.view
            ? `The tool returns data, and ${tool.viewFile ?? "its view"} draws it inside the chat. That makes this tool an MCP app.`
            : "The tool returns data the model reads. Add a view file to show it as a card in the chat."}
        </p>
      </div>

      <div>
        <div className="section-head">
          <button type="button" className="link small" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setRaw((open) => !open)} aria-expanded={raw}>
            {raw ? "Hide" : "Show"} the JSON Schema
          </button>
          {raw ? <CopyButton value={JSON.stringify(schema, null, 2)} label="Copy the schema" /> : null}
        </div>
        {raw ? <pre className="code">{JSON.stringify(schema, null, 2)}</pre> : null}
      </div>
    </div>
  );
}
