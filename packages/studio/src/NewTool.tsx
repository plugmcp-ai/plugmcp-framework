import { IconPencil, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "./api";
import { useStudio } from "./state";
import { Modal, Seg, errorText, go } from "./ui";

const IDEAS = [
  "Convert an amount between two currencies using live rates, with a card showing the result",
  "Look up a GitHub repository and show its stars, language and latest release",
  "Search Wikipedia and show the top three results as a list the user can open",
];

/** Add a tool two ways: describe it and let your own model write it, or start from a blank one. */
export function NewTool({ onClose }: { onClose: () => void }) {
  const { server, model, refresh } = useStudio();
  const [mode, setMode] = useState<"describe" | "blank">(model ? "describe" : "blank");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [view, setView] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let made: string;
      if (mode === "describe") {
        if (!model) throw new Error("Connect a model first.");
        made = (await api.generate({ description, view, provider: model.provider, model: model.model })).name;
      } else {
        await api.addTool({ name, description, view });
        made = name;
      }
      refresh();
      onClose();
      go(`/tools/${made}`);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New tool" lede={`Adds the tool to the ${server?.title ?? server?.name ?? "current"} MCP server, in ${server?.file ?? "its server file"}. It is live as soon as it is written.`} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="modal-body">
          <Seg
            value={mode}
            onChange={setMode}
            options={[
              { id: "describe", label: (<><IconSparkles size={14} stroke={1.75} /> Describe it</>) },
              { id: "blank", label: (<><IconPencil size={14} stroke={1.75} /> Start blank</>) },
            ]}
          />
          {mode === "describe" ? (
            model ? (
              <>
                <div className="field">
                  <label htmlFor="tool-ask">What should the tool do?</label>
                  <textarea id="tool-ask" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={IDEAS[0]} autoFocus />
                  <p className="hint">
                    Written by {model.label} <span className="mono">{model.model}</span> with your key. It is sent your description and your server file. You can read and edit the code afterwards.
                  </p>
                </div>
                <div className="row-wrap">
                  {IDEAS.slice(1).map((idea) => (
                    <button key={idea} type="button" className="chip" onClick={() => setDescription(idea)}>
                      {idea}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">
                This uses your own model. <a className="link" href="#/settings" onClick={onClose}>Add a model key</a> first, or start blank.
              </p>
            )
          ) : (
            <>
              <div className="field">
                <label htmlFor="tool-name">Name</label>
                <input id="tool-name" className="mono" value={name} onChange={(event) => setName(event.target.value)} placeholder="search_orders" autoFocus />
                <p className="hint">Lowercase letters, numbers and underscores.</p>
              </div>
              <div className="field">
                <label htmlFor="tool-what">
                  What it does <span className="optional">the model reads this to decide when to call it</span>
                </label>
                <textarea id="tool-what" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Find a customer's orders by email. Use it when the user asks about an order." />
              </div>
            </>
          )}
          <label className="check">
            <input type="checkbox" checked={view} onChange={(event) => setView(event.target.checked)} />
            Give it a view the user sees in the chat
          </label>
          {error ? <p className="small fault">{error}</p> : null}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || (mode === "describe" ? !model || !description.trim() : !name.trim())}>
            {busy ? (mode === "describe" ? "Writing the tool" : "Adding") : mode === "describe" ? "Write the tool" : "Add tool"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
