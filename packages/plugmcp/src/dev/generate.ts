import { generateText } from "ai";
import { createModel } from "./chat.js";
import { readSettings, resolveKey } from "./keys.js";
import type { ProviderId } from "./keys.js";

export interface Draft {
  name: string;
  description: string;
  /** One complete `server.tool(...)` statement. */
  tool: string;
  /** A complete view file, or an empty string for no view. */
  view: string;
}

/** How a tool and a view are written. Shared by the tool writer and the chat that builds. */
export const GUIDE = `A tool is one statement:

server.tool(
  {
    name: "get_weather",
    description: "Current weather for a city. Shows a weather card.",
    input: z.object({ city: z.string().describe("City name, for example Lisbon") }),
  },
  async ({ city }) => {
    const data = await fetch("https://example.com/api?q=" + encodeURIComponent(city)).then((r) => r.json());
    return { city, tempC: data.temp };
  },
);

Rules for the tool:
- "z" (zod) and the global "fetch" are available. Do not write import statements. Use no other packages.
- The name is lowercase letters, numbers and underscores.
- The description tells a model what the tool does and when to call it.
- Every input field has a .describe() with an example.
- Return a plain object with clear field names. Throw an Error with a readable message when something fails.
- Use only public APIs that need no key. If the task needs a private API or a key, read the key from process.env and name the variable in the description. If no real data source fits, return realistic sample data and say "sample data" in the description.
- Use the exact server variable name you are given.

A view is an optional React file that draws the tool's result inside the chat:

import { useTool } from "plugmcp/view";

interface Output { city: string; tempC: number }

export default function View() {
  const { output, isPending, isError, text, theme, callTool, sendMessage } = useTool<Output>();
  const dark = theme === "dark";
  if (isPending) return <p style={{ padding: 16, margin: 0 }}>Loading</p>;
  if (isError) return <p style={{ padding: 16, margin: 0, color: "#F87171" }}>{text}</p>;
  if (!output) return null;
  return <div>...</div>;
}

Rules for the view:
- One file, a default-exported component. Import only from "react" and "plugmcp/view".
- Inline styles only. Support both themes: dark uses text #F2EFE9 on #141414 with #2A2A2A borders, light uses text #141414 on #FFFFFF with #E2DFD9 borders. Accent #0099FF. Radius 14px on the card, 10px on controls. No emojis.
- "output" is exactly the object the tool returns. Type it.
- callTool(name, args) calls a tool on the same server and returns { output }. sendMessage(text) puts a message into the chat. Use them when they make the view more useful. useTool also gives partialInput (the arguments while they stream), displayMode and requestDisplayMode("fullscreen") for a tool with view: { displayModes: ["inline", "fullscreen"] }, and updateModelContext(text) to tell the model what the user did.
- For charts and diagrams, draw inline SVG yourself and work out the layout in code. No chart or diagram packages.
- Keep it compact: it is shown inline in a conversation, at most about 420px wide. A diagram may use the full width and scroll.`;

const RULES = `You write one tool for an MCP server built with the "plugmcp" TypeScript SDK.

${GUIDE}

Answer with one JSON object and nothing else:
{"name": "...", "description": "...", "tool": "server.tool(...);", "view": "full file text, or an empty string"}`;

function parse(text: string): Draft {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The model did not answer with a tool. Try again or use another model.");
  let draft: Partial<Draft>;
  try {
    draft = JSON.parse(text.slice(start, end + 1)) as Partial<Draft>;
  } catch {
    throw new Error("The model's answer could not be read. Try again or use another model.");
  }
  if (typeof draft.name !== "string" || typeof draft.tool !== "string" || !/\.tool\s*\(/.test(draft.tool)) {
    throw new Error("The model's answer has no tool in it. Try again or use another model.");
  }
  if (/^\s*import\s/m.test(draft.tool)) throw new Error("The model added imports to the tool, which is not supported. Try again.");
  return {
    name: draft.name,
    description: typeof draft.description === "string" ? draft.description : "",
    tool: draft.tool.trim(),
    view: typeof draft.view === "string" ? draft.view.trim() : "",
  };
}

/** Ask the user's own model to write a tool, and a view when wanted, from a description. */
export async function draftTool(input: {
  root: string;
  provider: ProviderId;
  model: string;
  description: string;
  wantView: boolean;
  variable: string;
  source: string;
}): Promise<Draft> {
  const { key } = resolveKey(input.provider, input.root);
  const model = createModel(input.provider, input.model, key, readSettings().customBaseUrl);
  const { text } = await generateText({
    model,
    system: RULES,
    prompt: [
      `The server variable is named "${input.variable}".`,
      `The server file now:\n\n${input.source.slice(0, 12_000)}`,
      `Write a new tool for this request: ${input.description}`,
      input.wantView ? "Write a view for it too." : 'No view is wanted. Set "view" to an empty string.',
      "Do not reuse the name of a tool that already exists.",
    ].join("\n\n"),
    abortSignal: AbortSignal.timeout(120_000),
  });
  return parse(text);
}
