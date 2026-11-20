# create-plugmcp

Create an MCP server or MCP App in one command.

```bash
npx create-plugmcp my-server
cd my-server
npm run dev
```

You get a working server with one tool, a view that renders inside chat clients, and a local Studio: a canvas of your tools, a tester, and a chat that uses your own model key. No account needed.

## Templates

```bash
npx create-plugmcp my-server --template starter   # default: a weather tool with a view
npx create-plugmcp my-server --template blank     # one tool, nothing else
npx create-plugmcp my-agent  --template agent     # also runs the tools in the Claude Agent SDK
```

## Options

| | |
|---|---|
| `--template <name>` | `starter`, `blank` or `agent` |
| `--about "<words>"` | What the server will do. Shows similar servers from the [PlugMCP directory](https://plugmcp.ai/mcp) first. |
| `--no-install` | Skip installing dependencies |
| `--yes` | Ask nothing |

Full documentation: [github.com/plugmcp-ai/plugmcp-framework](https://github.com/plugmcp-ai/plugmcp-framework)

## License

MIT
