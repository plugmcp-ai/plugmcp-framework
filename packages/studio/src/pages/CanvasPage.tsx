import { IconBrowser, IconLayoutGrid, IconPlus, IconServer2, IconTool, IconX } from "@tabler/icons-react";
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, useNodesState } from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import type { Tool } from "../api";
import { useStudio, useWorkspace } from "../state";
import { Seg, go, plural } from "../ui";
import { ToolDetail } from "./Tools";

function ServerNode({ data }: NodeProps<Node<{ name: string; description: string | null; address: string; count: number; added: boolean }>>) {
  return (
    <div className={`node node-server${data.added ? " node-server-added" : ""}`}>
      <div className="node-kind">
        <IconServer2 size={13} stroke={1.75} /> {data.added ? "Added from the directory" : "MCP server"}
        {data.added ? null : <span className="dot dot-ok" style={{ marginLeft: "auto" }} />}
      </div>
      <div className="node-title node-title-lg truncate">{data.name}</div>
      <div className="node-sub clamp-2">{data.description ?? (data.added ? "Its tools are in your chat." : "No description yet.")}</div>
      <div className="node-foot">
        <span className="node-chip mono truncate">{data.address}</span>
      </div>
      <div className="node-port">{plural(data.count, "tool")}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function ToolNode({ data }: NodeProps<Node<{ tool: Tool; picked: boolean }>>) {
  const fields = Object.keys(data.tool.inputSchema.properties ?? {});
  return (
    <div className={`node node-tool${data.picked ? " is-picked" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-kind">
        <IconTool size={13} stroke={1.75} /> {data.tool.view ? "MCP app" : "Tool"}
        {data.tool.view ? (
          <span className="node-view-tag">
            <IconBrowser size={12} stroke={1.75} /> View
          </span>
        ) : null}
      </div>
      <div className="node-title mono truncate">{data.tool.name}</div>
      <div className="node-sub clamp-3">{data.tool.description ?? "No description yet. Click to add one."}</div>
      <div className="node-foot">
        {fields.slice(0, 3).map((field) => (
          <span key={field} className="node-chip mono">
            {field}
          </span>
        ))}
        {fields.length > 3 ? <span className="node-chip">+{fields.length - 3}</span> : null}
        {fields.length === 0 ? <span className="node-chip">No input</span> : null}
      </div>
    </div>
  );
}

function AddNode() {
  return (
    <div className="node node-add">
      <Handle type="target" position={Position.Top} />
      <IconPlus size={18} stroke={1.75} />
      <span>New tool</span>
    </div>
  );
}

const nodeTypes = { server: ServerNode, tool: ToolNode, add: AddNode };
const WIDTH = 250;
const COLUMN = 286;
const ROW = 196;
const PER_ROW = 4;
const SERVER_WIDTH = 320;

type Places = Record<string, { x: number; y: number }>;
const readPlaces = (key: string): Places => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Places;
  } catch {
    return {};
  }
};

/** The open MCP server drawn the way it works: the server on top, its tools under it. One canvas per server. */
export function CanvasPage({ selected, onNew }: { selected?: string; onNew: () => void }) {
  const { server, remote, tools, refresh } = useStudio();
  const space = useWorkspace();
  const tool = tools.find((item) => item.id === selected) ?? null;
  // Where the user dragged each card, kept in this browser for each server.
  const placesKey = `plugmcp.canvas.${space.name}.${space.current}`;
  const [places, setPlaces] = useState<Places>(() => readPlaces(placesKey));
  useEffect(() => setPlaces(readPlaces(placesKey)), [placesKey]);

  const layout = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    if (!server) return { nodes, edges };
    const short = (url: string) => url.replace("127.0.0.1", "localhost").replace(/^https?:\/\//, "");
    const groups = [
      { key: "mcp", name: server.title ?? server.name, description: server.description, address: short(server.mcpUrl), added: false, tools: server.tools },
      ...remote.map((item) => ({ key: `added:${item.name}`, name: item.name, description: null, address: short(item.url), added: true, tools: item.tools })),
    ];
    let left = 0;
    for (const group of groups) {
      // Your own server always ends with a place to add the next tool.
      const items: Array<Tool | null> = group.added ? group.tools : [...group.tools, null];
      const rows = Math.max(1, Math.ceil(items.length / PER_ROW));
      const widest = Math.min(Math.max(items.length, 1), PER_ROW);
      const span = Math.max(widest * COLUMN + (rows > 1 ? COLUMN / 2 : 0), SERVER_WIDTH + 40);
      const middle = left + span / 2;
      nodes.push({
        id: group.key,
        type: "server",
        position: { x: middle - SERVER_WIDTH / 2, y: 0 },
        data: { name: group.name, description: group.description, address: group.address, count: group.tools.length, added: group.added },
      });
      items.forEach((item, index) => {
        const row = Math.floor(index / PER_ROW);
        const inRow = Math.min(PER_ROW, items.length - row * PER_ROW);
        // Every other row sits half a step over, so a line down to it passes between the tools above.
        const shift = rows > 1 ? (row % 2 === 1 ? COLUMN / 4 : -COLUMN / 4) : 0;
        const x = middle - (inRow * COLUMN) / 2 + (index % PER_ROW) * COLUMN + (COLUMN - WIDTH) / 2 + shift;
        const position = { x, y: 220 + row * ROW };
        const nodeId = item ? `tool:${group.key}:${item.id}` : "add";
        if (item) nodes.push({ id: nodeId, type: "tool", position, data: { tool: item, picked: item.id === selected } });
        else nodes.push({ id: nodeId, type: "add", position, data: {} });
        edges.push({ id: `e:${nodeId}`, source: group.key, target: nodeId, type: "smoothstep" });
      });
      left += span + 140;
    }
    return { nodes, edges };
  }, [server, remote, selected]);

  // The cards on screen: the automatic layout, with every card the user moved left where they put it.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  useEffect(() => {
    setNodes(layout.nodes.map((node) => (places[node.id] ? { ...node, position: places[node.id] as { x: number; y: number } } : node)));
  }, [layout, places, setNodes]);

  const save = (next: Places) => {
    setPlaces(next);
    try {
      localStorage.setItem(placesKey, JSON.stringify(next));
    } catch {
      // The layout then lasts until the page is closed.
    }
  };

  if (!server) return null;
  const moved = Object.keys(places).length > 0;
  return (
    <div className={`canvas${tool ? " has-pick" : ""}`}>
      <div className="canvas-stage">
        <ReactFlow
          key={`${space.current}:${layout.nodes.length}`}
          nodes={nodes}
          edges={layout.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.2}
          nodesConnectable={false}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, node) => save({ ...places, [node.id]: node.position })}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => {
            if (node.type === "tool") go(`/canvas/${(node.data.tool as Tool).id}`);
            if (node.type === "add") onNew();
          }}
          onPaneClick={() => tool && go("/canvas")}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="rgba(141,137,132,0.3)" />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
        <div className="canvas-tools">
          <Seg
            value="canvas"
            onChange={(next: "list" | "canvas") => next === "list" && go(selected ? `/tools/${selected}` : "/tools")}
            options={[
              { id: "list", label: "List" },
              { id: "canvas", label: "Canvas" },
            ]}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onNew}>
            <IconPlus size={14} stroke={2} /> New tool
          </button>
          {moved ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => save({})}>
              <IconLayoutGrid size={14} stroke={1.75} /> Tidy up
            </button>
          ) : null}
        </div>
        {tool ? null : <div className="canvas-hint">Drag a card to move it. Click a tool to see its schema, run it and change its code.</div>}
      </div>

      {tool ? (
        <aside className="inspector" aria-label={`Tool ${tool.name}`}>
          <button type="button" className="btn btn-ghost btn-sm btn-icon inspector-close" onClick={() => go("/canvas")} aria-label="Close">
            <IconX size={16} />
          </button>
          <ToolDetail key={tool.id} tool={tool} entry={server.entry} onSaved={refresh} back="/canvas" />
        </aside>
      ) : null}
    </div>
  );
}
