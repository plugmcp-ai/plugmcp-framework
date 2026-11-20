# Examples

| Example | What it shows | Where |
|---|---|---|
| **Weather** | The smallest MCP App: one tool with real data and one view. The same code as the `starter` template. | [`examples/weather`](weather/) |
| **Mind Map MCP** | A full MCP App: a diagram that streams in while the model writes it, full screen, tools only the view can call, and edits on the canvas sent back to the model. Tests, a gallery and a recorded demo are included. | [plugmcp-ai/mindmap-mcp](https://github.com/plugmcp-ai/mindmap-mcp) |

## Run the weather example

From the root of this repository:

```bash
pnpm install
pnpm build
cd examples/weather
pnpm dev
```

## Run Mind Map MCP

It lives in its own repository so it can be installed on its own:

```bash
git clone https://github.com/plugmcp-ai/mindmap-mcp.git
cd mindmap-mcp
pnpm install
pnpm dev
```

## Add yours

Small examples that show one idea belong in this folder. A whole app is better in its own repository: open a pull request that adds a row to the table above and to "Built with PlugMCP" in the main README.
