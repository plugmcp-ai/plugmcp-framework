# Notes for coding agents

This is an MCP server built with the PlugMCP Framework (`plugmcp`).

## How it is laid out

- `server.ts` creates the server and defines every tool. It must `export default server`.
- `views/<tool_name>.tsx` is the UI for the tool with that exact name. The file name is the link. It default-exports a React component.
- `npm run dev` runs everything and serves the Studio at the printed address. The MCP endpoint is `/mcp`.

## Adding a tool

```ts
server.tool(
  {
    name: "search_orders",
    description: "Find a customer's orders by email. Use it when the user asks about an order.",
    input: z.object({ email: z.string().email() }),
  },
  async ({ email }) => {
    return { orders: [] }; // a plain object, a string, or a full MCP result
  },
);
```

- The description is what the model reads to decide when to call the tool. Say what it does and when to use it.
- Describe each input field with `.describe(...)`.
- Throw an `Error` with a clear message when something fails. It is returned to the model as an error result.

## Adding a view

```tsx
import { useTool } from "plugmcp/view";

export default function View() {
  const { output, isPending, callTool, sendMessage, theme } = useTool<{ orders: unknown[] }>();
  if (isPending) return <p>Loading</p>;
  return <pre>{JSON.stringify(output, null, 2)}</pre>;
}
```

- `output` is the object the handler returned.
- `callTool(name, args)` calls any tool on this server from the view.
- A view runs in a sandboxed frame. It cannot fetch outside addresses unless the tool sets `view: { csp: { connectDomains: [...] } }`. Prefer fetching in the tool handler and passing data through `output`.
- Support both `theme` values, `light` and `dark`.

## Checking your work

- Call the tool over MCP: `POST /mcp` with a `tools/call` request, or run it from the Tools page in the Studio.
- Before building something new, search for an existing server: `npx plugmcp search <words>`.
