import { IconBrowser, IconPlus, IconRobot, IconServer2, IconTool, IconX } from "@tabler/icons-react";
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow } from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { Agent, Tool } from "../api";
import { useStudio } from "../state";
import { Seg, go, plural } from "../ui";
import { ToolDetail } from "./Tools";

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

function ServerNode({ data }: NodeProps<Node<{ name: string; description: string | null; address: string; count: number; local: boolean }>>) {
  return (
    <div className="node node-server">
      <Handle type="target" position={Position.Left} />
      <div className="node-kind">
        <IconServer2 size={13} stroke={1.75} /> {data.local ? "Your MCP server" : "Added server"}
        {data.local ? <span className="dot dot-ok" style={{ marginLeft: "auto" }} /> : null}
      </div>
      <div className="node-title node-title-lg truncate">{data.name}</div>
      {data.description ? <div className="node-sub clamp-2">{data.description}</div> : null}
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

function AddNode() {
  return (
    <div className="node node-add">
      <Handle type="target" position={Position.Top} />
      <IconPlus size={18} stroke={1.75} />
      <span>New tool</span>
    </div>
  );
}

const nodeTypes = { agent: AgentNode, server: ServerNode, tool: ToolNode, add: AddNode };
const WIDTH = 250;
const COLUMN = 286;
const ROW = 196;
const PER_ROW = 4;
const SERVER_WIDTH = 320;

/** The server drawn the way it works: the MCP server on top, its tools under it, agents beside it. */
export function CanvasPage({ selected, onNew }: { selected?: string; onNew: () => void }) {
  const { server, remote, agents, tools, refresh } = useStudio();
  const tool = tools.find((item) => item.id === selected) ?? null;

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    if (!server) return { nodes, edges };
    const groups = [
      { name: server.name, description: server.description, address: server.mcpUrl.replace("127.0.0.1", "localhost").replace("http://", ""), local: true, tools: server.tools },
      ...remote.map((item) => ({ name: item.name, description: null, address: item.url.replace(/^https?:\/\//, ""), local: false, tools: item.tools })),
    ];
    let left = 0;
    for (const group of groups) {
      // Your own server always ends with a place to add the next tool.
      const items: Array<Tool | null> = group.local ? [...group.tools, null] : group.tools;
      const rows = Math.max(1, Math.ceil(items.length / PER_ROW));
      const widest = Math.min(Math.max(items.length, 1), PER_ROW);
      const span = Math.max(widest * COLUMN + (rows > 1 ? COLUMN / 2 : 0), SERVER_WIDTH + 40);
      const middle = left + span / 2;
      const id = `server:${group.name}`;
      nodes.push({
        id,
        type: "server",
        position: { x: middle - SERVER_WIDTH / 2, y: 0 },
        data: { name: group.name, description: group.description, address: group.address, count: group.tools.length, local: group.local },
        selectable: false,
      });
      items.forEach((item, index) => {
        const row = Math.floor(index / PER_ROW);
        const inRow = Math.min(PER_ROW, items.length - row * PER_ROW);
        // Every other row sits half a step over, so a line down to it passes between the tools above.
        const shift = rows > 1 && row % 2 === 1 ? COLUMN / 2 : 0;
        const x = middle - (inRow * COLUMN) / 2 + (index % PER_ROW) * COLUMN + (COLUMN - WIDTH) / 2 + (rows > 1 ? shift - COLUMN / 4 : 0);
        const position = { x, y: 220 + row * ROW };
        const nodeId = item ? `tool:${item.id}` : "add";
        if (item) nodes.push({ id: nodeId, type: "tool", position, data: { tool: item, picked: item.id === selected } });
        else nodes.push({ id: nodeId, type: "add", position, data: {} });
        edges.push({ id: `e:${id}:${nodeId}`, source: id, target: nodeId, type: "smoothstep" });
      });
      left += span + 140;
    }
    const home = nodes[0];
    agents.forEach((agent, index) => {
      const used = agent.tools === null ? tools : tools.filter((item) => agent.tools?.includes(item.id));
      nodes.push({
        id: `agent:${agent.id}`,
        type: "agent",
        position: { x: (home?.position.x ?? 0) - WIDTH - 110, y: -index * 104 },
        data: { agent, count: used.length },
      });
      const reached = new Set(used.map((item) => (item.local ? server.name : item.server)));
      for (const name of reached) edges.push({ id: `a:${agent.id}:${name}`, source: `agent:${agent.id}`, target: `server:${name}` });
    });
    return { nodes, edges };
  }, [server, remote, agents, tools, selected]);

  if (!server) return null;
  return (
    <div className={`canvas${tool ? " has-pick" : ""}`}>
      <div className="canvas-stage">
        <ReactFlow
          key={nodes.length}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.25}
          nodesConnectable={false}
          nodesDraggable={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => {
            if (node.type === "tool") go(`/canvas/${node.id.slice(5)}`);
            if (node.type === "add") onNew();
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
          <button type="button" className="btn btn-secondary btn-sm" onClick={onNew}>
            <IconPlus size={14} stroke={2} /> New tool
          </button>
          <a className="btn btn-outline btn-sm" href="#/agents/new">
            <IconPlus size={14} stroke={2} /> New agent
          </a>
        </div>
        {tool ? null : <div className="canvas-hint">Click a tool to edit its description, run it and change its code.</div>}
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
