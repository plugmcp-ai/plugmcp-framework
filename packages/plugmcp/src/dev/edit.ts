/**
 * Small, exact edits to a server file: change a tool's input description, or the server's
 * own title and description. Pure text in, text out. Each function throws a plain message
 * when the code is not written in a shape it can change safely, so the Studio can say
 * "change it on the Code tab" instead of guessing.
 */

const OPEN = "([{";
const CLOSE = ")]}";

/** Index just past a string, template or comment that starts at `at`, or `at` when none starts there. */
function skipQuiet(source: string, at: number): number {
  const char = source[at];
  if (char === '"' || char === "'" || char === "`") {
    for (let i = at + 1; i < source.length; i += 1) {
      if (source[i] === "\\") i += 1;
      else if (source[i] === char) return i + 1;
    }
    return source.length;
  }
  if (char === "/" && source[at + 1] === "/") {
    const end = source.indexOf("\n", at);
    return end === -1 ? source.length : end;
  }
  if (char === "/" && source[at + 1] === "*") {
    const end = source.indexOf("*/", at + 2);
    return end === -1 ? source.length : end + 2;
  }
  return at;
}

/** Index of the bracket that closes the one at `open`. */
export function matching(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const skipped = skipQuiet(source, i);
    if (skipped !== i) {
      i = skipped - 1;
      continue;
    }
    if (OPEN.includes(source[i] as string)) depth += 1;
    else if (CLOSE.includes(source[i] as string)) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error("The brackets in the server file do not match.");
}

/** Index where the expression starting at `from` ends: the comma or closing bracket after it. */
export function expressionEnd(source: string, from: number): number {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const skipped = skipQuiet(source, i);
    if (skipped !== i) {
      i = skipped - 1;
      continue;
    }
    const char = source[i] as string;
    if (OPEN.includes(char)) depth += 1;
    else if (CLOSE.includes(char)) {
      if (depth === 0) return i;
      depth -= 1;
    } else if (char === "," && depth === 0) return i;
  }
  return source.length;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LITERAL = "\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*'|`(?:[^`\\\\$]|\\\\.)*`";

/** Where the `.tool( ... )` call that defines this tool starts and ends. */
export function toolCall(source: string, tool: string): { start: number; end: number } {
  const named = new RegExp(`name:\\s*["'\`]${escape(tool)}["'\`]`).exec(source);
  if (!named) throw new Error(`Could not find the tool ${tool} in the server file.`);
  const before = source.slice(0, named.index);
  const calls = [...before.matchAll(/\.tool\s*\(/g)];
  const last = calls[calls.length - 1];
  if (!last || last.index === undefined) throw new Error(`Could not find where ${tool} is defined.`);
  const open = last.index + last[0].length - 1;
  return { start: open, end: matching(source, open) };
}

/** Change, or add, the description of one input of a tool. */
export function setInputDescription(source: string, tool: string, field: string, description: string): string {
  const call = toolCall(source, tool);
  const body = source.slice(call.start, call.end);
  const input = /\binput\s*:/.exec(body);
  if (!input) throw new Error(`${tool} has no input in the code. Change it on the Code tab.`);
  const key = new RegExp(`(^|[{,\\s])${escape(field)}\\s*:\\s*`, "g");
  key.lastIndex = input.index + input[0].length;
  const found = key.exec(body);
  if (!found) throw new Error(`Could not find the input ${field} of ${tool} in the code. Change it on the Code tab.`);
  const from = call.start + found.index + found[0].length;
  const to = expressionEnd(source, from);
  const expression = source.slice(from, to);
  const text = JSON.stringify(description);
  const described = [...expression.matchAll(new RegExp(`\\.describe\\(\\s*(?:${LITERAL})\\s*\\)`, "g"))];
  const last = described[described.length - 1];
  let next: string;
  if (last && last.index !== undefined) {
    next = `${expression.slice(0, last.index)}.describe(${text})${expression.slice(last.index + last[0].length)}`;
  } else if (/\.describe\s*\(/.test(expression)) {
    throw new Error(`The description of ${field} is not a plain string in the code. Change it on the Code tab.`);
  } else {
    const trimmed = expression.trimEnd();
    next = `${trimmed}.describe(${text})${expression.slice(trimmed.length)}`;
  }
  return `${source.slice(0, from)}${next}${source.slice(to)}`;
}

/** Change, or add, the title and description passed to createServer. An empty title removes nothing and adds nothing. */
export function setServerInfo(source: string, info: { title?: string; description?: string }): string {
  const created = /createServer\s*\(\s*\{/.exec(source);
  if (!created) throw new Error('Could not find "createServer({ ... })" in the server file. Change it on the Code tab.');
  let out = source;
  for (const key of ["description", "title"] as const) {
    const value = info[key]?.trim();
    if (!value) continue;
    const open = created.index + created[0].length - 1;
    const close = matching(out, open);
    const object = out.slice(open, close);
    const existing = new RegExp(`(^|[{,\\s])${key}\\s*:\\s*`).exec(object);
    if (existing) {
      const from = open + existing.index + existing[0].length;
      const to = expressionEnd(out, from);
      if (!new RegExp(`^(?:${LITERAL})\\s*$`).test(out.slice(from, to))) {
        throw new Error(`The server's ${key} is not a plain string in the code. Change it on the Code tab.`);
      }
      const tail = out.slice(from, to).match(/\s*$/)?.[0] ?? "";
      out = `${out.slice(0, from)}${JSON.stringify(value)}${tail}${out.slice(to)}`;
    } else {
      const indent = /\n([ \t]+)\S/.exec(object)?.[1] ?? "  ";
      out = `${out.slice(0, open + 1)}\n${indent}${key}: ${JSON.stringify(value)},${/^\s/.test(object.slice(1)) ? "" : " "}${out.slice(open + 1)}`;
    }
  }
  return out;
}
