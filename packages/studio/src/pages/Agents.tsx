import { IconArrowLeft, IconCheck, IconCode, IconDeviceFloppy, IconMessage, IconPlus, IconRobot, IconTrash } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Conversation } from "../Conversation";
import type { ChatBody } from "../Conversation";
import { KeySetup, ModelSelect } from "../Models";
import { api } from "../api";
import type { Agent } from "../api";
import { useStudio } from "../state";
import { CopyBox, Empty, Modal, PageHead, errorText, go, plural } from "../ui";

const TEMPLATES: Array<{ name: string; description: string; instructions: string }> = [
  {
    name: "Support agent",
    description: "Answers customers using your tools, and says so when it cannot help.",
    instructions:
      "You are a support agent. Answer using the tools you have. Keep answers short and concrete. If the tools cannot answer the question, say what you could not find and what the customer can do next. Never invent order numbers, prices or policies.",
  },
  {
    name: "Research agent",
    description: "Gathers facts with several tool calls and gives a sourced summary.",
    instructions:
      "You are a research assistant. Break the question into parts, call tools for each part, and compare what you find. Answer with a short summary first, then the details, and say which tool each fact came from.",
  },
  {
    name: "Operations agent",
    description: "Carries out tasks step by step and confirms before anything that changes data.",
    instructions:
      "You carry out tasks for the user with the tools you have. Plan the steps, then run them one at a time. Before any step that creates, changes or deletes something, say what you are about to do and wait for a yes.",
  },
];

export function Agents() {
  const { agents, server, tools } = useStudio();
  return (
    <div className="page">
      <PageHead
        title="Agents"
        lede="An agent is a prompt, a model and a set of tools. Build one here, talk to it, then take the code and run it with the Claude Agent SDK."
      >
        <a className="btn btn-primary" href="#/agents/new">
          <IconPlus size={15} stroke={2} /> New agent
        </a>
      </PageHead>

      {agents.length === 0 ? (
        <Empty
          icon={IconRobot}
          title="Make your first agent"
          actions={
            <a className="btn btn-primary" href="#/agents/new">
              <IconPlus size={15} stroke={2} /> New agent
            </a>
          }
        >
          Give it instructions, choose which of your {plural(tools.length, "tool")} it may use, and test it in a chat next to the form. Nothing leaves this machine.
        </Empty>
      ) : (
        <div className="cards">
          {agents.map((agent) => (
            <a key={agent.id} className="card" href={`#/agents/${agent.id}`}>
              <div className="row">
                <span className="icon-tile">
                  <IconRobot size={17} stroke={1.75} />
                </span>
                <div className="grow">
                  <div className="card-title truncate">{agent.name}</div>
                  <div className="row-sub mono truncate">{agent.model ?? "Uses the chat's model"}</div>
                </div>
              </div>
              <p className="card-text clamp-2">{agent.description ?? (agent.instructions || "No instructions yet.")}</p>
              <div className="card-foot">
                <span className="pill">{agent.tools === null ? "All tools" : plural(agent.tools.length, "tool")}</span>
                <span className="muted small">Open</span>
              </div>
            </a>
          ))}
          <a className="card card-dashed" href="#/agents/new">
            <IconPlus size={18} stroke={1.75} />
            New agent
          </a>
        </div>
      )}

      {agents.length === 0 && server ? (
        <div>
          <h2 className="section-title" style={{ marginBottom: 10 }}>Start from an example</h2>
          <div className="cards">
            {TEMPLATES.map((template, index) => (
              <a key={template.name} className="card" href={`#/agents/new?from=${index}`}>
                <div className="card-title">{template.name}</div>
                <p className="card-text">{template.description}</p>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface Draft {
  name: string;
  description: string;
  instructions: string;
  ownModel: boolean;
  provider: string;
  model: string;
  allTools: boolean;
  tools: string[];
  starters: string;
}

function toDraft(agent: Agent | undefined, template: (typeof TEMPLATES)[number] | undefined, fallback: string): Draft {
  return {
    name: agent?.name ?? template?.name ?? "",
    description: agent?.description ?? template?.description ?? "",
    instructions: agent?.instructions ?? template?.instructions ?? fallback,
    ownModel: Boolean(agent?.provider && agent.model),
    provider: agent?.provider ?? "",
    model: agent?.model ?? "",
    allTools: !agent || agent.tools === null,
    tools: agent?.tools ?? [],
    starters: (agent?.starters ?? []).join("\n"),
  };
}

export function AgentEditor({ id }: { id: string }) {
  const { agents, agentsReady, server, tools, model, settings, reloadAgents } = useStudio();
  const isNew = id === "new" || id.startsWith("new?");
  const existing = agents.find((item) => item.id === id);
  const template = isNew ? TEMPLATES[Number(/from=(\d)/.exec(id)?.[1] ?? -1)] : undefined;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(false);
  const [chat, setChat] = useState<{ clear: () => void; count: number } | null>(null);

  const [loaded, setLoaded] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  /** The id a new agent got when it was saved, so the form and the chat carry over. */
  const created = useRef<string | null>(null);

  // Fill the form once the agent is known. A new agent starts from the server's own instructions.
  useEffect(() => {
    if (loaded === id || !server) return;
    if (created.current === id) return setLoaded(id);
    if (!isNew && !existing) return;
    setDraft(toDraft(existing, template, server.instructions ?? ""));
    setLoaded(id);
    setSession((count) => count + 1);
  }, [loaded, id, server, isNew, existing, template]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  const onModel = useCallback((provider: string, name: string) => setDraft((prev) => (prev ? { ...prev, provider, model: name } : prev)), []);

  const body: ChatBody | null = useMemo(() => {
    if (!draft) return null;
    const use = draft.ownModel && draft.provider && draft.model ? { provider: draft.provider, model: draft.model } : model;
    if (!use) return null;
    return { provider: use.provider, model: use.model, instructions: draft.instructions, tools: draft.allTools ? null : draft.tools };
  }, [draft, model]);

  if (!server) return null;
  const current = loaded === id || created.current === id;
  if (!current && !isNew && !existing && agentsReady) {
    return (
      <div className="page">
        <Empty icon={IconRobot} title="No such agent" actions={<a className="btn btn-outline" href="#/agents">All agents</a>}>
          It may have been removed. Open the list to see the agents in this project.
        </Empty>
      </div>
    );
  }
  if (!draft || !current) return null;

  async function save(): Promise<string | null> {
    if (!draft) return null;
    setState("saving");
    setError(null);
    try {
      const { agent } = await api.saveAgent({
        id: existing?.id,
        name: draft.name,
        description: draft.description,
        instructions: draft.instructions,
        provider: draft.ownModel ? draft.provider : undefined,
        model: draft.ownModel ? draft.model : undefined,
        tools: draft.allTools ? null : draft.tools,
        starters: draft.starters.split("\n"),
      });
      await reloadAgents();
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
      if (!existing) {
        created.current = agent.id;
        go(`/agents/${agent.id}`);
      }
      return agent.id;
    } catch (cause) {
      setError(errorText(cause));
      setState("idle");
      return null;
    }
  }

  const starters = draft.starters.split("\n").map((text) => text.trim()).filter(Boolean);
  const provider = draft.provider || settings?.provider || "openai";

  return (
    <div className="agent-edit">
      <form
        className="agent-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="row">
          <a className="btn btn-ghost btn-sm" href="#/agents" style={{ marginLeft: -8 }}>
            <IconArrowLeft size={14} /> Agents
          </a>
          <span className="grow" />
          {existing ? (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setCode(true)}>
                <IconCode size={14} stroke={1.75} /> Get the code
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm btn-icon"
                aria-label="Delete this agent"
                title="Delete this agent"
                onClick={async () => {
                  if (!window.confirm(`Delete the agent ${existing.name}? This cannot be undone.`)) return;
                  await api.removeAgent(existing.id);
                  await reloadAgents();
                  go("/agents");
                }}
              >
                <IconTrash size={14} stroke={1.75} />
              </button>
            </>
          ) : null}
          <button type="submit" className="btn btn-primary btn-sm" disabled={state === "saving" || !draft.name.trim()}>
            {state === "saved" ? <IconCheck size={14} stroke={2} /> : <IconDeviceFloppy size={14} stroke={1.75} />}
            {state === "saving" ? "Saving" : state === "saved" ? "Saved" : existing ? "Save" : "Create agent"}
          </button>
        </div>
        {error ? <p className="small fault">{error}</p> : null}

        <div className="field">
          <label htmlFor="agent-name">Name</label>
          <input id="agent-name" value={draft.name} onChange={(event) => set("name", event.target.value)} placeholder="Support agent" autoFocus={isNew} />
        </div>
        <div className="field">
          <label htmlFor="agent-about">
            What it is for <span className="optional">optional</span>
          </label>
          <input id="agent-about" value={draft.description} onChange={(event) => set("description", event.target.value)} placeholder="Answers customers about their orders" />
        </div>
        <div className="field">
          <label htmlFor="agent-prompt">Instructions</label>
          <textarea id="agent-prompt" rows={9} value={draft.instructions} onChange={(event) => set("instructions", event.target.value)} placeholder="Who the agent is, how it should answer, and what it must never do." />
          <p className="hint">Changes apply to the next message in the chat on the right. No need to save first.</p>
        </div>

        <div className="field">
          <span className="label">Model</span>
          <label className="check">
            <input type="checkbox" checked={!draft.ownModel} onChange={(event) => set("ownModel", !event.target.checked)} />
            Use whichever model the chat uses
          </label>
          {draft.ownModel ? <ModelSelect provider={provider} model={draft.model} onChange={onModel} /> : null}
        </div>

        <div className="field">
          <span className="label">
            Tools <span className="optional">{draft.allTools ? `all ${tools.length}` : `${draft.tools.length} of ${tools.length}`}</span>
          </span>
          <label className="check">
            <input type="checkbox" checked={draft.allTools} onChange={(event) => setDraft({ ...draft, allTools: event.target.checked, tools: event.target.checked ? [] : tools.map((tool) => tool.id) })} />
            Every tool, including ones added later
          </label>
          {!draft.allTools ? (
            <div className="picklist">
              {tools.map((tool) => (
                <label key={tool.id}>
                  <input
                    type="checkbox"
                    checked={draft.tools.includes(tool.id)}
                    onChange={(event) => set("tools", event.target.checked ? [...draft.tools, tool.id] : draft.tools.filter((item) => item !== tool.id))}
                  />
                  <span className="grow">
                    <span className="mono" style={{ fontSize: 12.5 }}>{tool.name}</span>
                    {!tool.local ? <span className="muted small"> · {tool.server}</span> : null}
                    <span className="hint clamp-2" style={{ display: "block" }}>{tool.description}</span>
                  </span>
                </label>
              ))}
              {tools.length === 0 ? <p className="hint" style={{ padding: 12 }}>This server has no tools yet.</p> : null}
            </div>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="agent-starters">
            Opening questions <span className="optional">one per line, up to four</span>
          </label>
          <textarea id="agent-starters" rows={3} value={draft.starters} onChange={(event) => set("starters", event.target.value)} placeholder={"Where is my order?\nWhat is your refund policy?"} />
        </div>
      </form>

      <div className="agent-preview">
        <div className="chat-bar">
          <IconMessage size={15} stroke={1.75} style={{ color: "var(--ink-45)" }} />
          <span className="small" style={{ fontWeight: 500 }}>Try it</span>
          <span className="muted small truncate">{body ? `${body.model}` : "No model connected"}</span>
          <span className="grow" />
          {chat?.count ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={chat.clear}>
              New chat
            </button>
          ) : null}
        </div>
        <Conversation
          id={`agent-${session}`}
          body={body}
          title={draft.name || "Your agent"}
          lede={draft.description || "Send a message to see how it answers with these instructions and tools."}
          starters={starters}
          onState={setChat}
          gate={
            <div className="panel keygate">
              <h2 style={{ fontSize: 18 }}>Connect a model to try the agent</h2>
              <p className="muted" style={{ margin: "4px 0 18px" }}>Your key stays on this machine.</p>
              <KeySetup />
            </div>
          }
        />
      </div>

      {code && existing ? <AgentCode agent={existing} onClose={() => setCode(false)} /> : null}
    </div>
  );
}

function AgentCode({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [data, setData] = useState<{ path: string; code: string; saved: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.agentCode(agent.id).then(setData).catch((cause: unknown) => setError(errorText(cause)));
  }, [agent]);
  return (
    <Modal wide title={`Run ${agent.name} in your own code`} lede="A Claude Agent SDK script with this agent's prompt and tools. Your tools run inside the same process." onClose={onClose}>
      <div className="modal-body">
        {error ? <p className="small fault">{error}</p> : null}
        {data ? (
          <>
            <CopyBox value={data.code} label="the code" />
            <div className="field">
              <span className="label">Run it</span>
              <CopyBox value={`npm install @anthropic-ai/claude-agent-sdk\nnpx tsx ${data.path} "your message"`} label="the commands" />
              <p className="hint">Needs ANTHROPIC_API_KEY in your environment. Save the unsaved changes in the form first if you made any.</p>
            </div>
          </>
        ) : !error ? (
          <p className="muted">Loading</p>
        ) : null}
      </div>
      <div className="modal-foot">
        {data?.saved ? <span className="small ok" style={{ marginRight: "auto", alignSelf: "center" }}>Saved to {data.path}</span> : null}
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-primary" disabled={!data} onClick={() => api.agentCode(agent.id, true).then(setData).catch((cause: unknown) => setError(errorText(cause)))}>
          Save to {data?.path ?? "the project"}
        </button>
      </div>
    </Modal>
  );
}
