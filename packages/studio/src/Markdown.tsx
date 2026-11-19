import type { ReactNode } from "react";

/**
 * A small renderer for what models write in chat: paragraphs, lists, code,
 * bold, italics and links. Everything is built as React nodes, never as HTML.
 */

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = match[0];
    if (token.startsWith("`")) out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("*")) out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    else {
      const [, label = "", href = ""] = /^\[([^\]]+)\]\((.+)\)$/.exec(token) ?? [];
      out.push(
        <a key={key++} href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>,
      );
    }
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) code.push(lines[i++] ?? "");
      i++;
      blocks.push(
        <pre key={key++} className="code">
          {code.join("\n")}
        </pre>,
      );
      continue;
    }
    const bullet = /^\s*([-*]|\d+[.)])\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && bullet.test(lines[i] ?? "")) items.push((lines[i++] ?? "").replace(bullet, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key++}>
          {items.map((item, index) => (
            <li key={index}>{inline(item)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={key++} className="md-heading">
          {inline(heading[2] ?? "")}
        </p>,
      );
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() && !bullet.test(lines[i] ?? "") && !(lines[i] ?? "").startsWith("```")) {
      paragraph.push(lines[i++] ?? "");
    }
    blocks.push(<p key={key++}>{inline(paragraph.join("\n"))}</p>);
  }
  return <div className="md">{blocks}</div>;
}
