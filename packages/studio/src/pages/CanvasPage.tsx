import { IconBrowser, IconLayoutGrid, IconPlus, IconRobot, IconServer2, IconTool, IconX } from "@tabler/icons-react";
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, useNodesState } from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import type { Agent, Tool } from "../api";
import { useStudio, useWorkspace } from "../state";
import { Seg, go, plural } from "../ui";
import { ToolDetail } from "./Tools";

type Kind = "open" | "other" | "added";

function AgentNode({ data }: NodeProps<Node<{ agent: Agent; count: number }>>) {
  return (
    <div className="node node-agent">
      <div className="node-kind">
        <IconRobot size={13} stroke={1.75} /> Agent
      </div>
      <div className="node-title truncate">{data.agent.name}</div>
      <div className="node-sub">{data.agent.tools === null ? "Uses every tool" : `Uses ${plural(data.count, "tool")}`}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ServerNode({ data }: NodeProps<Node<{ name: string; description: string | null; address: string; count: number; kind: Kind; broken: boolean }>>) {
  return (
    <div className={`node node-server node-server-${data.kind}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-kind">
        <IconServer2 size={13} stroke={1.75} /> {data.kind === "added" ? "Added from the directory" : "MCP server"}
        {data.kind === "open" ? <span className="node-open">Open</span> : null}
        {data.kind !== "added" ? <span className={`dot ${data.broken ? "dot-error" : "dot-ok"}`} style={{ marginLeft: data.kind === "open" ? 6 : "auto" }} /> : null}
      </div>
      <div className="node-title node-title-lg truncate">{data.name}</div>
      <div className="node-sub clamp-2">{data.broken ? "The server file has an error." : (data.description ?? "No description yet.")}</div>
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
        <IconTool size={13} stroke={1.75} /> Tool
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

function AddNode({ data }: NodeProps<Node<{ label: string; wide?: boolean }>>) {
  return (
    <div className={`node node-add${data.wide ? " node-add-wide" : ""}`}>
      {data.wide ? null : <Handle type="target" position={Position.Top} />}
      <IconPlus size={18} stroke={1.75} />
      <span>{data.label}</span>
    </div>
  );
}

const nodeTypes = { agent: AgentNode, server: ServerNode, tool: ToolNode, add: AddNode };
const WIDTH = 250;
const COLUMN = 286;
const ROW = 196;
const PER_ROW = 4;
const SERVER_WIDTH = 320;

type Places = Record<string, { x: number; y: number }>;
const placesKey = (name: string) => `plugmcp.canvas.${name}`;
const readPlaces = (name: string): Places => {
  try {
    return JSON.parse(localStorage.getItem(placesKey(name)) ?? "{}") as Places;
  } catch {
    return {};
  }
};

/** Every MCP server in the folder drawn the way it works: the server on top, its tools under it. */
export function CanvasPage({ selected, onNew, onNewMcp }: { selected?: string; onNew: () => void; onNewMcp: () => void }) {
  const { server, remote, agents, tools, refresh } = useStudio();
  const space = useWorkspace();
  const tool = tools.find((item) => item.id === selected) ?? null;
  // Where the user dragged each card. Kept in this browser.
  const [places, setPlaces] = useState<Places>(() => readPlaces(space.name));
  useEffect(() => setPlaces(readPlaces(space.name)), [space.name]);

  const layout = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    if (!server) return { nodes, edges };
    const short = (url: string) => url.replace("127.0.0.1", "localhost").replace(/^https?:\/\//, "");
    const groups: Array<{ key: string; id?: string; name: string; description: string | null; address: string; kind: Kind; broken: boolean; tools: Tool[] }> = [
      // The open server first, with the freshest list of its tools.
      ...space.servers
        .map((item) => (item.id === space.current ? server : item))
        .sort((a, b) => Number(b.id === space.current) - Number(a.id === space.current))
        .map((item) => ({
          key: `mcp:${item.id}`,
          id: item.id,
          name: item.ok ? (item.title ?? item.name) : item.id,
          description: item.ok ? item.description : null,
          address: short(item.mcpUrl),
          kind: (item.id === space.current ? "open" : "other") as Kind,
          broken: !item.ok,
          tools: item.ok ? item.tools : [],
        })),
      ...remote.map((item) => ({ key: `added:${item.name}`, name: item.name, description: null, address: short(item.url), kind: "added" as Kind, broken: false, tools: item.tools })),
    ];
    let left = 0;
    for (const group of groups) {
      // Your own servers always end with a place to add the next tool.
      const items: Array<Tool | null> = group.kind === "added" || group.broken ? group.tools : [...group.tools, null];
      const rows = Math.max(1, Math.ceil(items.length / PER_ROW));
      const widest = Math.min(Math.max(items.length, 1), PER_ROW);
      const span = Math.max(widest * COLUMN + (rows > 1 ? COLUMN / 2 : 0), SERVER_WIDTH + 40);
      const middle = left + span / 2;
      nodes.push({
        id: group.key,
        type: "server",
        position: { x: middle - SERVER_WIDTH / 2, y: 0 },
        data: { name: group.name, description: group.description, address: group.address, count: group.tools.length, kind: group.kind, broken: group.broken },
      });
      items.forEach((item, index) => {
        const row = Math.floor(index / PER_ROW);
        const inRow = Math.min(PER_ROW, items.length - row * PER_ROW);
        // Every other row sits half a step over, so a line down to it passes between the tools above.
        const shift = rows > 1 ? (row % 2 === 1 ? COLUMN / 4 : -COLUMN / 4) : 0;
        const x = middle - (inRow * COLUMN) / 2 + (index % PER_ROW) * COLUMN + (COLUMN - WIDTH) / 2 + shift;
        const position = { x, y: 220 + row * ROW };
        const nodeId = item ? `tool:${group.key}:${item.id}` : `add:${group.key}`;
        if (item) nodes.push({ id: nodeId, type: "tool", position, data: { tool: item, picked: group.kind !== "other" && item.id === selected, mcp: group.id } });
        else nodes.push({ id: nodeId, type: "add", position, data: { label: "New tool", mcp: group.id } });
        edges.push({ id: `e:${nodeId}`, source: group.key, target: nodeId, type: "smoothstep" });
      });
      left += span + 140;
    }
    nodes.push({ id: "add:mcp", type: "add", position: { x: left, y: 8 }, data: { label: "New MCP server", wide: true } });
    const home = nodes[0];
    agents.forEach((agent, index) => {
      const used = agent.tools === null ? tools : tools.filter((item) => agent.tools?.includes(item.id));
      nodes.push({
        id: `agent:${agent.id}`,
        type: "agent",
        position: { x: (home?.position.x ?? 0) - WIDTH - 110, y: -index * 104 },
        data: { agent, count: used.length },
      });
      const reached = new Set(used.map((item) => (item.local ? `mcp:${space.current}` : `added:${item.server}`)));
      for (const key of reached) edges.push({ id: `a:${agent.id}:${key}`, source: `agent:${agent.id}`, target: key });
    });
    return { nodes, edges };
  }, [server, remote, agents, tools, selected, space.servers, space.current]);

  // The cards on screen: the automatic layout, with every card the user moved left where they put it.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  useEffect(() => {
    setNodes(layout.nodes.map((node) => (places[node.id] ? { ...node, position: places[node.id] as { x: number; y: number } } : node)));
  }, [layout, places, setNodes]);

  const save = (next: Places) => {
    setPlaces(next);
    try {
      localStorage.setItem(placesKey(space.name), JSON.stringify(next));
    } catch {
      // The layout then lasts until the page is closed.
    }
  };

  /** Open the server a card belongs to before acting on the card. */
  const open = (mcp: unknown) => {
    if (typeof mcp === "string" && mcp !== space.current) space.switchTo(mcp);
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
            if (node.type === "tool") {
              open(node.data.mcp);
              go(`/canvas/${(node.data.tool as Tool).id}`);
            }
            if (node.type === "server" && node.id.startsWith("mcp:")) open(node.id.slice(4));
            if (node.id === "add:mcp") onNewMcp();
            else if (node.type === "add") {
              open(node.data.mcp);
              onNew();
            }
            if (node.type === "agent") go(`/agents/${node.id.slice(6)}`);
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
          <button type="button" className="btn btn-secondary btn-sm" onClick={onNewMcp}>
            <IconPlus size={14} stroke={2} /> New MCP server
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onNew}>
            <IconPlus size={14} stroke={2} /> New tool
          </button>
          {moved ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => save({})}>
              <IconLayoutGrid size={14} stroke={1.75} /> Tidy up
            </button>
          ) : null}
        </div>
        {tool ? null : <div className="canvas-hint">Drag a card to move it. Click a tool to edit its description, run it and change its code.</div>}
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
