import { IconAdjustmentsHorizontal, IconExternalLink, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { Conversation } from "../Conversation";
import type { ChatBody } from "../Conversation";
import { KeySetup, ModelSelect } from "../Models";
import { api } from "../api";
import { useStudio, useWorkspace } from "../state";
import { plural } from "../ui";

const notesKey = (mcp: string) => `plugmcp.instructions.${mcp}`;
const readNotes = (mcp: string) => {
  try {
    return localStorage.getItem(notesKey(mcp)) ?? "";
  } catch {
    return "";
  }
};

/** One test agent for the open MCP server: your model, your instructions, your tools. It can also build tools. */
export function Playground() {
  const { server, settings, setSettings, tools, remote, model } = useStudio();
  const space = useWorkspace();
  const [off, setOff] = useState<Set<string>>(new Set());
  const [rail, setRail] = useState(false);
  const [chat, setChat] = useState<{ clear: () => void; count: number } | null>(null);
  const [notes, setNotes] = useState(() => readNotes(space.current));

  const onModel = useCallback(
    (provider: string, name: string) => {
      void api.saveSettings({ provider, model: name }).then(setSettings);
    },
    [setSettings],
  );

  const saveNotes = (text: string) => {
    setNotes(text);
    try {
      localStorage.setItem(notesKey(space.current), text);
    } catch {
      // The instructions then last until the page is closed.
    }
  };

  const body: ChatBody | null = useMemo(() => {
    if (!model) return null;
    return {
      provider: model.provider,
      model: model.model,
      build: true,
      instructions: notes.trim() || undefined,
      tools: off.size ? tools.filter((tool) => !off.has(tool.id)).map((tool) => tool.id) : undefined,
    };
  }, [model, off, tools, notes]);

  if (!server) return null;
  const active = tools.filter((tool) => !off.has(tool.id));
  const groups = [{ name: server.name, local: true, tools: server.tools }, ...remote.map((item) => ({ name: item.name, local: false, tools: item.tools }))];
  const starters = [
    "Build an MCP app that draws a flowchart from a list of steps",
    "Build a tool that converts currencies with live rates, with a card",
    ...server.tools.slice(0, 1).map((tool) => `Use ${tool.name} and show me the result`),
  ];

  return (
    <div className={`play${rail ? " show-rail" : ""}`} style={{ position: "relative" }}>
      <div className="chat">
        <div className="chat-bar">
          <span className="pill">Test agent</span>
          {settings && model ? <ModelSelect compact provider={model.provider} model={model.model} onChange={onModel} /> : null}
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
          id="play"
          body={body}
          placeholder="Ask for a new tool or app, or use the ones you have"
          title={`Chat with ${server.title ?? server.name}`}
          lede="Ask for a tool or an MCP app and it is written into this server and run right here. The chat can also call the tools you already have, and their views show up the way they will in Claude or ChatGPT."
          starters={starters}
          onState={setChat}
          note="Runs on this machine with your own key."
          gate={
            <div className="panel keygate">
              <h2 style={{ fontSize: 18 }}>Add your model key to start</h2>
              <p className="muted" style={{ margin: "4px 0 18px" }}>
                The chat runs on your own model. Pick a provider and paste your key. It stays on this machine, you pay the provider directly and nothing passes through PlugMCP.
              </p>
              <KeySetup />
            </div>
          }
        />
      </div>

      <aside className="rail" aria-label="Chat setup">
        <div className="rail-section">
          <div className="rail-title">
            Instructions
            <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ display: rail ? undefined : "none" }} onClick={() => setRail(false)} aria-label="Close">
              <IconX size={14} />
            </button>
          </div>
          <textarea
            className="input"
            rows={4}
            value={notes}
            onChange={(event) => saveNotes(event.target.value)}
            placeholder="How the test agent should behave. For example: you are a support agent, keep answers short."
            aria-label="Instructions for the test agent"
          />
          <p className="hint">{notes.trim() ? "Used from your next message." : "Empty means the server's own instructions."}</p>
        </div>
        <div className="rail-section">
          <div className="rail-title">Tools in this chat</div>
          <p className="hint">Untick a tool to hide it from the model.</p>
        </div>
        {groups.map((group) => (
          <div className="rail-section" key={group.name}>
            <div className="rail-title">
              <span className="truncate">{group.name}</span>
              <span className="pill">{group.local ? "This server" : "Added"}</span>
            </div>
            {group.tools.length === 0 ? <p className="hint">No tools yet. Ask the chat to build one.</p> : null}
            <div>
              {group.tools.map((tool) => (
                <label key={tool.id} className="toggle-row">
                  <input
                    type="checkbox"
                    checked={!off.has(tool.id)}
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
              ))}
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
