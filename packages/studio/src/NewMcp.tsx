import { useState } from "react";
import { api } from "./api";
import { useWorkspace } from "./state";
import { Modal, errorText, go } from "./ui";

/** Start another MCP server in this folder. It gets its own tools, views and address. */
export function NewMcp({ onClose }: { onClose: () => void }) {
  const space = useWorkspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const made = await api.createMcp({ name, description });
      await space.reload();
      space.switchTo(made.id);
      onClose();
      go("/canvas");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New MCP server" lede="An MCP server is a set of tools behind one address. Make one for each product or job, then add tools under it." onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="modal-body">
          <div className="field">
            <label htmlFor="mcp-name">Name</label>
            <input id="mcp-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Billing" autoFocus />
            <p className="hint">
              {id ? (
                <>
                  Written to <span className="mono">servers/{id}/server.ts</span> and served at <span className="mono">/mcp/{id}</span>.
                </>
              ) : (
                "For example Billing, Support desk or Diagrams."
              )}
            </p>
          </div>
          <div className="field">
            <label htmlFor="mcp-what">
              What it is for <span className="optional">shown to people and models that connect</span>
            </label>
            <textarea id="mcp-what" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Look up invoices, payments and refunds for a customer." />
          </div>
          {error ? <p className="small fault">{error}</p> : null}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !id}>
            {busy ? "Creating" : "Create MCP server"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
