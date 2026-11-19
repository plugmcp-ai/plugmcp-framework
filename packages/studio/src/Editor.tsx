import { IconCheck, IconDeviceFloppy } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import { errorText } from "./ui";

const TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(import|from|export|default|const|let|var|function|return|async|await|if|else|for|while|of|in|new|throw|try|catch|finally|interface|type|extends|typeof|true|false|null|undefined)\b|\b(\d+(?:\.\d+)?)\b/g;

/** Light colouring for TypeScript: comments, strings, keywords and numbers. */
function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of code.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) out.push(code.slice(last, at));
    const kind = match[1] ? "c" : match[2] ? "s" : match[3] ? "k" : "n";
    out.push(
      <span key={key++} className={`tok-${kind}`}>
        {match[0]}
      </span>,
    );
    last = at + match[0].length;
  }
  out.push(code.slice(last));
  return out;
}

/** Edit one project file in place. Saving reloads the server, so the change is live at once. */
export function Editor({ path, onSaved }: { path: string; onSaved?: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(null);
    setError(null);
    api
      .file(path)
      .then((file) => {
        setText(file.content);
        setSaved(file.content);
      })
      .catch((cause: unknown) => setError(errorText(cause)));
  }, [path]);

  const dirty = text !== null && text !== saved;

  const save = useCallback(async () => {
    if (text === null) return;
    setState("saving");
    try {
      const result = await api.saveFile(path, text);
      setSaved(text);
      setError(result.error);
      setState("done");
      setTimeout(() => setState("idle"), 1500);
      onSaved?.();
    } catch (cause) {
      setError(errorText(cause));
      setState("idle");
    }
  }, [path, text, onSaved]);

  const tokens = useMemo(() => highlight(text ?? ""), [text]);

  return (
    <div className="stack">
      <div className="editor-bar">
        <span className="row small muted">
          <span className="mono">{path}</span>
          {dirty ? <span className="pill pill-wait">Not saved</span> : null}
        </span>
        <span className="row">
          <span className="hint hide-sm">Ctrl S to save. Your own editor works too.</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!dirty || state === "saving"} onClick={() => void save()}>
            {state === "done" ? <IconCheck size={14} stroke={2} /> : <IconDeviceFloppy size={14} stroke={1.75} />}
            {state === "saving" ? "Saving" : state === "done" ? "Saved" : "Save"}
          </button>
        </span>
      </div>
      {error ? <pre className="code fault">{error}</pre> : null}
      <div className="editor">
        <div className="editor-inner">
          <pre aria-hidden="true">
            {tokens}
            {"\n"}
          </pre>
          <textarea
            value={text ?? ""}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={`Source of ${path}`}
            disabled={text === null}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void save();
              }
              if (event.key === "Tab" && !event.shiftKey) {
                event.preventDefault();
                const target = event.currentTarget;
                const { selectionStart: start, selectionEnd: stop, value } = target;
                setText(`${value.slice(0, start)}  ${value.slice(stop)}`);
                requestAnimationFrame(() => target.setSelectionRange(start + 2, start + 2));
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
