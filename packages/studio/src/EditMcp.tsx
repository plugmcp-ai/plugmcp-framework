import { useState } from "react";
import { api } from "./api";
import { useStudio, useWorkspace } from "./state";
import { Modal, errorText } from "./ui";

/** Change the open MCP server's display name and description without opening the code. */
export function EditMcp({ onClose }: { onClose: () => void }) {
  const { server, refresh } = useStudio();
  const space = useWorkspace();
  const [title, setTitle] = useState(server?.title ?? "");
  const [description, setDescription] = useState(server?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.describeServer({ title, description });
      refresh();
      await space.reload();
      onClose();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit this MCP server" lede={`Written to ${server?.file ?? "the server file"}. Clients and models see both when they connect.`} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="modal-body">
          <div className="field">
            <label htmlFor="mcp-title">
              Display name <span className="optional">shown in clients; the address keeps using {server?.name}</span>
            </label>
            <input id="mcp-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={server?.name} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="mcp-about">Description</label>
            <textarea id="mcp-about" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this server is for, in one or two sentences." />
          </div>
          {error ? <p className="small fault">{error}</p> : null}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || (!title.trim() && !description.trim())}>
            {busy ? "Saving" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
