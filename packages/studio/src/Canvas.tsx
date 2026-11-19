import { IconBrowser, IconPlayerPlay, IconPlus, IconServer2, IconTool, IconX } from "@tabler/icons-react";
import { Background, BackgroundVariant, Handle, Position, ReactFlow } from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import { SchemaForm } from "./SchemaForm";
import { ViewFrame } from "./ViewFrame";
import { api } from "./api";
import type { Info, Tool, ToolResult } from "./api";

type Ok = Extract<Info, { ok: true }>;

function ServerNode({ data }: NodeProps<Node<{ name: string; count: number }>>) {
  return (
    <div className="node node-server">
      <div className="node-kind">
        <IconServer2 size={14} stroke={1.75} /> MCP server
      </div>
      <div className="node-title">{data.name}</div>
      <div className="node-sub">
        {data.count} tool{data.count === 1 ? "" : "s"}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ToolNode({ data, selected }: NodeProps<Node<{ tool: Tool }>>) {
  return (
    <div className={`node node-tool${selected ? " is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-kind">
        <IconTool size={14} stroke={1.75} /> Tool
      </div>
      <div className="node-title mono">{data.tool.name}</div>
      <div className="node-sub clamp">{data.tool.description ?? "No description yet"}</div>
      {data.tool.view ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}

function ViewNode({ data }: NodeProps<Node<{ file: string }>>) {
  return (
    <div className="node node-view">
      <Handle type="target" position={Position.Left} />
      <div className="node-kind">
        <IconBrowser size={14} stroke={1.75} /> View
      </div>
      <div className="node-title mono">{data.file}</div>
      <div className="node-sub">Shown inside the chat</div>
    </div>
  );
}

const nodeTypes = { server: ServerNode, tool: ToolNode, view: ViewNode };

export function Canvas({ info, onChanged }: { info: Ok; onChanged: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const tool = info.tools.find((item) => item.name === selected) ?? null;

  const { nodes, edges } = useMemo(() => {
    const gap = 124;
    const top = -((info.tools.length - 1) * gap) / 2;
    const nodes: Node[] = [
      { id: "server", type: "server", position: { x: 0, y: -44 }, data: { name: info.name, count: info.tools.length }, selectable: false },
    ];
    const edges: Edge[] = [];
    info.tools.forEach((item, index) => {
      const y = top + index * gap - 44;
      nodes.push({ id: item.name, type: "tool", position: { x: 320, y }, data: { tool: item }, selected: item.name === selected });
      edges.push({ id: `s-${item.name}`, source: "server", target: item.name });
      if (item.view) {
        nodes.push({ id: `${item.name}:view`, type: "view", position: { x: 640, y }, data: { file: item.viewFile ?? "view" }, selectable: false });
        edges.push({ id: `v-${item.name}`, source: item.name, target: `${item.name}:view`, className: "edge-view" });
      }
    });
    return { nodes, edges };
  }, [info, selected]);

  return (
    <div className={`canvas${tool || adding ? " has-panel" : ""}`}>
      <div className="canvas-map">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          minZoom={0.3}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => {
            if (node.type === "tool") {
              setAdding(false);
              setSelected(node.id);
            }
          }}
          onPaneClick={() => setSelected(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#262626" />
        </ReactFlow>
        <div className="canvas-actions">
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSelected(null);
              setAdding(true);
            }}
          >
            <IconPlus size={16} stroke={2} /> New tool
          </button>
        </div>
        {info.tools.length === 0 ? (
          <div className="canvas-empty">
            <p>This server has no tools yet.</p>
            <p className="note">
              Add one with New tool, or call <span className="mono">server.tool(...)</span> in {info.entry}.
            </p>
          </div>
        ) : !tool && !adding ? (
          <div className="canvas-tip">Select a tool to test it</div>
        ) : null}
      </div>
      {tool ? <Inspector key={tool.name} tool={tool} onClose={() => setSelected(null)} /> : null}
      {adding ? (
        <NewTool
          entry={info.entry}
          onClose={() => setAdding(false)}
          onAdded={(name) => {
            setAdding(false);
            onChanged();
            setSelected(name);
          }}
        />
      ) : null}
    </div>
  );
}

function Inspector({ tool, onClose }: { tool: Tool; onClose: () => void }) {
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [sent, setSent] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<ToolResult | undefined>();
  const [ms, setMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);

  async function test() {
    setBusy(true);
    setError(null);
    setResult(undefined);
    setSent(args);
    setRun((count) => count + 1);
    try {
      const response = await api.call("local", tool.name, args);
      setResult(response.result);
      setMs(response.ms);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const text = result?.content?.filter((block) => block.type === "text").map((block) => block.text).join("\n");

  return (
    <aside className="panel" aria-label={`Test ${tool.name}`}>
      <header className="panel-head">
        <div>
          <div className="panel-title mono">{tool.name}</div>
          {tool.description ? <p className="note">{tool.description}</p> : null}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <IconX size={18} stroke={1.75} />
        </button>
      </header>
      <form
        className="panel-body"
        onSubmit={(event) => {
          event.preventDefault();
          void test();
        }}
      >
        <h3>Input</h3>
        <SchemaForm schema={tool.inputSchema} value={args} onChange={setArgs} />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          <IconPlayerPlay size={16} stroke={2} /> {busy ? "Running" : "Test tool"}
        </button>
        {error ? <p className="note fault">{error}</p> : null}
        {result ? (
          <>
            <h3>
              Result
              <span className={`pill ${result.isError ? "pill-fault" : "pill-ok"}`}>{result.isError ? "Error" : "OK"}</span>
              {ms !== null ? <span className="meta">{ms} ms</span> : null}
            </h3>
            <pre className="code">{result.structuredContent ? JSON.stringify(result.structuredContent, null, 2) : text}</pre>
          </>
        ) : null}
        {tool.view && sent ? (
          <>
            <h3>View</h3>
            <div className="view-wrap">
              <ViewFrame key={run} server="local" uri={tool.view} input={sent} result={result} />
            </div>
            <p className="hint">This is what a chat client shows. Edit {tool.viewFile} and it updates here.</p>
          </>
        ) : null}
      </form>
    </aside>
  );
}

function NewTool({ entry, onClose, onAdded }: { entry: string; onClose: () => void; onAdded: (name: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [view, setView] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setError(null), [name]);

  return (
    <aside className="panel" aria-label="New tool">
      <header className="panel-head">
        <div>
          <div className="panel-title">New tool</div>
          <p className="note">Adds a starting point to {entry}. You fill in the logic.</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <IconX size={18} stroke={1.75} />
        </button>
      </header>
      <form
        className="panel-body"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await api.addTool({ name, description, view });
            onAdded(name);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form">
          <div className="field">
            <label htmlFor="tool-name">Name</label>
            <input id="tool-name" className="mono" value={name} onChange={(event) => setName(event.target.value)} placeholder="search_orders" autoFocus />
            <p className="hint">Lowercase letters, numbers and underscores.</p>
          </div>
          <div className="field">
            <label htmlFor="tool-description">What it does</label>
            <textarea id="tool-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Find a customer's orders by email. Use it when the user asks about an order." />
            <p className="hint">The model reads this to decide when to call the tool.</p>
          </div>
          <label className="check">
            <input type="checkbox" checked={view} onChange={(event) => setView(event.target.checked)} />
            Also create a view the user sees in the chat
          </label>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy || !name}>
          <IconPlus size={16} stroke={2} /> Add tool
        </button>
        {error ? <p className="note fault">{error}</p> : null}
      </form>
    </aside>
  );
}
