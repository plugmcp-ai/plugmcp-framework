import { IconCheck, IconCopy, IconX } from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";

export const errorText = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** The PlugMCP mark: a contact, a cable and the P-shaped socket. */
export function Mark({ size = 24 }: { size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="290 105 860 860" width={size} height={size} aria-hidden="true" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={`p${id}`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#0b6bff" />
          <stop offset="0.55" stopColor="#1c86ff" />
          <stop offset="1" stopColor="#47b8ff" />
        </linearGradient>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1696ff" />
          <stop offset="1" stopColor="#0f74ff" />
        </linearGradient>
        <linearGradient id={`d${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9aa6ff" />
          <stop offset="1" stopColor="#6c88ff" />
        </linearGradient>
      </defs>
      <rect x="316" y="420" width="154" height="132" rx="34" fill={`url(#d${id})`} />
      <rect x="508" y="420" width="334" height="132" rx="66" fill={`url(#b${id})`} />
      <path
        d="M637 266H860A207 207 0 0 1 860 680H800A86 86 0 0 0 714 766V808"
        fill="none"
        stroke={`url(#p${id})`}
        strokeWidth="126"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Glyph({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span className={`glyph${large ? " glyph-lg" : ""}`} aria-hidden="true">
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

export function PageHead({ title, lede, children }: { title: ReactNode; lede?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="grow">
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
      {children ? <div className="row-wrap">{children}</div> : null}
    </div>
  );
}

export function SectionTitle({ icon: IconType, children, action }: { icon: Icon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-head">
      <h2 className="section-title">
        <IconType size={16} stroke={1.75} aria-hidden="true" />
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Empty({ icon: IconType, title, children, actions }: { icon: Icon; title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <IconType size={20} stroke={1.75} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {actions ? <div className="row-wrap">{actions}</div> : null}
    </div>
  );
}

export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  return [
    copied,
    (text) => {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
  ];
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, copy] = useCopy();
  return (
    <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={label} title={label} onClick={() => copy(value)}>
      {copied ? <IconCheck size={15} stroke={2} /> : <IconCopy size={15} stroke={1.75} />}
    </button>
  );
}

export function CopyBox({ value, label }: { value: string; label?: string }) {
  return (
    <div className="copybox">
      <pre className="code">{value}</pre>
      <CopyButton value={value} label={`Copy ${label ?? "to clipboard"}`} />
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: Array<{ id: T; label: ReactNode }>; onChange: (next: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={value === option.id ? "is-active" : ""}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, lede, onClose, children, wide = false }: { title: string; lede?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: 640 } : undefined}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {lede ? <p className="muted small" style={{ marginTop: 4 }}>{lede}</p> : null}
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close">
            <IconX size={16} stroke={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Hash routes, so the Studio works from any address without server rewrites. */
export function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const onHash = () => setParts(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return parts;
}

export const go = (path: string) => {
  window.location.hash = path;
};

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function ago(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
