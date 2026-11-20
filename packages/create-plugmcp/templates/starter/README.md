# {{name}}

{{about}}

Built with the [PlugMCP SDK](https://github.com/plugmcp-ai/sdk).

## Run it

```bash
npm run dev
```

This starts the server and opens the Studio in your browser:

- **Tools** lists your tools, schema first. Run one, see its view, and edit its code. New tool writes one from a description.
- **Canvas** draws the MCP server with its tools under it.
- **Chat** talks to your server with your own OpenAI, Anthropic or other key, and builds new tools and MCP apps when you ask.
- **Tests** runs the calls you saved with "Save as test". `npm test` runs them in a terminal.
- **Logs** shows every call the server handled.
- **Connect** has install buttons for Cursor, VS Code, Claude Code and more.
- **Directory** shows popular servers from [plugmcp.ai](https://plugmcp.ai/mcp), where 95,000+ are listed.

To use the chat, copy `.env.example` to `.env` and add a key, or paste one in the Studio.

## Change it

- Tools live in `server.ts`. Add one with `server.tool({ name, description, input }, handler)`.
- A file at `views/<tool_name>.tsx` becomes that tool's view. No registration.
- Save a file and the server and the Studio update.

## Ship it

```bash
npm run build
npm run start        # serves /mcp, reads PORT on a host
```

Then give it a page in the PlugMCP directory:

```bash
npx plugmcp list --url https://your-host.example/mcp
```
