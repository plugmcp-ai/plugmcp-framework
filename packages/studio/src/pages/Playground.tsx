import { IconAdjustmentsHorizontal, IconExternalLink, IconPlus, IconRobot, IconTrash, IconX } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { Conversation } from "../Conversation";
import type { ChatBody } from "../Conversation";
import { KeySetup, ModelSelect } from "../Models";
import { api } from "../api";
import { useStudio } from "../state";
import { plural } from "../ui";

export function Playground({ agentId }: { agentId?: string }) {
  const { server, settings, setSettings, agents, tools, remote, model } = useStudio();
  const [picked, setPicked] = useState(agentId ?? "");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [rail, setRail] = useState(false);
  const [chat, setChat] = useState<{ clear: () => void; count: number } | null>(null);
  const agent = agents.find((item) => item.id === picked);

  const onModel = useCallback(
    (provider: string, name: string) => {
      void api.saveSettings({ provider, model: name }).then(setSettings);
    },
    [setSettings],
  );

  const body: ChatBody | null = useMemo(() => {
    if (agent) {
      const own = agent.provider && agent.model ? { provider: agent.provider, model: agent.model } : model;
      return own ? { provider: own.provider, model: own.model, agent: agent.id } : null;
    }
    if (!model) return null;
    return { provider: model.provider, model: model.model, tools: off.size ? tools.filter((tool) => !off.has(tool.id)).map((tool) => tool.id) : undefined };
  }, [agent, model, off, tools]);

  if (!server) return null;
  const active = agent ? (agent.tools === null ? tools : tools.filter((tool) => agent.tools?.includes(tool.id))) : tools.filter((tool) => !off.has(tool.id));
  const groups = [{ name: server.name, local: true, tools: server.tools }, ...remote.map((item) => ({ name: item.name, local: false, tools: item.tools }))];
  const starters = agent?.starters?.length ? agent.starters : server.tools.slice(0, 3).map((tool) => `Use ${tool.name} and show me the result`);

  return (
    <div className={`play${rail ? " show-rail" : ""}`} style={{ position: "relative" }}>
      <div className="chat">
        <div className="chat-bar">
          <select className="input" style={{ width: "auto", minHeight: 30, fontSize: 13, maxWidth: 200 }} aria-label="Who answers" value={picked} onChange={(event) => setPicked(event.target.value)}>
            <option value="">{server.name} (no agent)</option>
            {agents.map((item) => (
              <option key={item.id} value={item.id}>
                Agent: {item.name}
              </option>
            ))}
          </select>
          {agent?.provider && agent.model ? (
            <span className="pill mono">{agent.model}</span>
          ) : settings && model ? (
            <ModelSelect compact provider={model.provider} model={model.model} onChange={onModel} />
          ) : null}
          <span className="grow" />
          {chat?.count ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={chat.clear}>
              <IconTrash size={14} stroke={1.75} /> New chat
            </button>
          ) : null}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setRail((open) => !open)} aria-expanded={rail}>
            <IconAdjustmentsHorizontal size={14} stroke={1.75} /> {plural(active.length, "tool")}
          </button>
        </div>
        <Conversation
          key={picked}
          id={`play-${picked}`}
          body={body}
          title={agent ? agent.name : `Chat with ${server.name}`}
          lede={
            agent
              ? (agent.description ?? "This agent uses its own prompt and tools.")
              : "The model can call your tools, and their views show up in the conversation the way they will in Claude or ChatGPT."
          }
          starters={starters}
          onState={setChat}
          note="Runs on this machine with your own key."
          gate={
            <div className="panel keygate">
              <h2 style={{ fontSize: 18 }}>Connect a model to start</h2>
              <p className="muted" style={{ margin: "4px 0 18px" }}>
                Pick a provider and paste your key. You pay the provider directly and nothing passes through PlugMCP.
              </p>
              <KeySetup />
            </div>
          }
        />
      </div>

      <aside className="rail" aria-label="Chat setup">
        <div className="rail-section">
          <div className="rail-title">
            {agent ? "Agent" : "Tools in this chat"}
            <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ display: rail ? undefined : "none" }} onClick={() => setRail(false)} aria-label="Close">
              <IconX size={14} />
            </button>
          </div>
          {agent ? (
            <>
              <p className="small muted clamp-3">{agent.instructions || "No instructions yet."}</p>
              <a className="btn btn-outline btn-sm" href={`#/agents/${agent.id}`}>
                <IconRobot size={14} stroke={1.75} /> Edit agent
              </a>
            </>
          ) : (
            <p className="hint">Untick a tool to hide it from the model for this chat.</p>
          )}
        </div>
        {groups.map((group) => (
          <div className="rail-section" key={group.name}>
            <div className="rail-title">
              <span className="truncate">{group.name}</span>
              <span className="pill">{group.local ? "This server" : "Added"}</span>
            </div>
            {group.tools.length === 0 ? <p className="hint">No tools.</p> : null}
            <div>
              {group.tools.map((tool) => {
                const on = active.some((item) => item.id === tool.id);
                return (
                  <label key={tool.id} className="toggle-row">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={Boolean(agent)}
                      onChange={() =>
                        setOff((prev) => {
                          const next = new Set(prev);
                          if (next.has(tool.id)) next.delete(tool.id);
                          else next.add(tool.id);
                          return next;
                        })
                      }
                    />
                    <span className="grow">
                      <span className="mono" style={{ display: "block", fontSize: 12.5 }}>
                        {tool.name}
                      </span>
                      <span className="hint clamp-2">{tool.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <div className="rail-section">
          <div className="rail-title">More tools</div>
          <p className="hint">Add a hosted server from the PlugMCP directory to try it next to your own.</p>
          <a className="btn btn-outline btn-sm" href="#/directory">
            <IconPlus size={14} stroke={2} /> Browse the directory
          </a>
          <a className="link small" href="https://plugmcp.ai/mcp" target="_blank" rel="noopener">
            plugmcp.ai/mcp <IconExternalLink size={12} stroke={1.75} style={{ verticalAlign: -1 }} />
          </a>
        </div>
      </aside>
    </div>
  );
}
