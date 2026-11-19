import { IconBrowser, IconPlus, IconRobot, IconServer2, IconTool } from "@tabler/icons-react";
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow } from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { Agent, Tool } from "../api";
import { useStudio } from "../state";
import { go, plural } from "../ui";

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

function ServerNode({ data }: NodeProps<Node<{ name: string; count: number; local: boolean }>>) {
  return (
    <div className="node node-server">
      <Handle type="target" position={Position.Left} />
      <div className="node-kind">
        <IconServer2 size={13} stroke={1.75} /> {data.local ? "Your server" : "Added server"}
      </div>
      <div className="node-title truncate">{data.name}</div>
      <div className="node-sub">{plural(data.count, "tool")}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ToolNode({ data }: NodeProps<Node<{ tool: Tool }>>) {
  return (
    <div className="node node-tool">
      <Handle type="target" position={Position.Left} />
      <div className="node-kind">
        <IconTool size={13} stroke={1.75} /> Tool
      </div>
      <div className="node-title mono truncate">{data.tool.name}</div>
      <div className="node-sub clamp-2">{data.tool.description ?? "No description yet"}</div>
      {data.tool.view ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}

function ViewNode({ data }: NodeProps<Node<{ file: string }>>) {
  return (
    <div className="node node-view">
      <Handle type="target" position={Position.Left} />
      <div className="node-kind">
        <IconBrowser size={13} stroke={1.75} /> View
      </div>
      <div className="node-title mono truncate">{data.file}</div>
      <div className="node-sub">Shown inside the chat</div>
    </div>
  );
}

const nodeTypes = { agent: AgentNode, server: ServerNode, tool: ToolNode, view: ViewNode };
const GAP = 112;
const COLUMN = 300;

/** A map of the project: agents, servers, tools and views, and what uses what. */
export function CanvasPage({ onNew }: { onNew: () => void }) {
  const { server, remote, agents, tools } = useStudio();

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    if (!server) return { nodes, edges };
    const servers = [{ name: server.name, local: true, tools: server.tools }, ...remote.map((item) => ({ name: item.name, local: false, tools: item.tools }))];
    let row = 0;
    for (const group of servers) {
      const first = row;
      const height = Math.max(group.tools.length, 1);
      for (const tool of group.tools) {
        nodes.push({ id: `tool:${tool.id}`, type: "tool", position: { x: COLUMN * 2, y: row * GAP }, data: { tool } });
        edges.push({ id: `e:${group.name}:${tool.id}`, source: `server:${group.name}`, target: `tool:${tool.id}` });
        if (tool.view) {
          nodes.push({ id: `view:${tool.id}`, type: "view", position: { x: COLUMN * 3, y: row * GAP }, data: { file: tool.viewFile ?? `${tool.name} view` }, selectable: false });
          edges.push({ id: `v:${tool.id}`, source: `tool:${tool.id}`, target: `view:${tool.id}` });
        }
        row += 1;
      }
      if (group.tools.length === 0) row += 1;
      nodes.push({
        id: `server:${group.name}`,
        type: "server",
        position: { x: COLUMN, y: (first + (height - 1) / 2) * GAP },
        data: { name: group.name, count: group.tools.length, local: group.local },
        selectable: false,
      });
      row += 0.4;
    }
    const top = ((row - agents.length) / 2) * GAP;
    agents.forEach((agent, index) => {
      const used = agent.tools === null ? tools : tools.filter((tool) => agent.tools?.includes(tool.id));
      nodes.push({ id: `agent:${agent.id}`, type: "agent", position: { x: 0, y: Math.max(0, top) + index * GAP }, data: { agent, count: used.length } });
      const reached = new Set(used.map((tool) => (tool.local ? server.name : tool.server)));
      for (const name of reached) edges.push({ id: `a:${agent.id}:${name}`, source: `agent:${agent.id}`, target: `server:${name}` });
    });
    return { nodes, edges };
  }, [server, remote, agents, tools]);

  if (!server) return null;
  return (
    <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.25}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (node.type === "tool") go(`/tools/${node.id.slice(5)}`);
          if (node.type === "agent") go(`/agents/${node.id.slice(6)}`);
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="rgba(141,137,132,0.3)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <div className="canvas-tools">
        <button type="button" className="btn btn-secondary" onClick={onNew}>
          <IconPlus size={15} stroke={2} /> New tool
        </button>
        <a className="btn btn-outline" href="#/agents/new">
          <IconPlus size={15} stroke={2} /> New agent
        </a>
      </div>
      <div className="canvas-legend">
        <span><i className="swatch" style={{ background: "var(--later)" }} /> Agent</span>
        <span><i className="swatch" style={{ background: "var(--cable)" }} /> Server</span>
        <span><i className="swatch" style={{ background: "var(--signal-2)" }} /> Tool</span>
        <span><i className="swatch" style={{ background: "#c4a1ff" }} /> View</span>
        <span>Click a tool or an agent to open it</span>
      </div>
    </div>
  );
}
