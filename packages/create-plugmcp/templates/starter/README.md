# {{name}}

{{about}}

Built with the [PlugMCP SDK](https://github.com/plugmcp-ai/sdk).

## Run it

```bash
npm run dev
```

This starts the server and opens the Studio in your browser:

- **Canvas** shows your tools. Select one to test it and see its view.
- **Chat** talks to your server with your own OpenAI, Anthropic or other key.
- **Directory** searches 70,000+ existing servers on [plugmcp.ai](https://plugmcp.ai/mcp).
- **Ship** has install buttons for Cursor, VS Code, Claude Code and more.

To use the chat, copy `.env.example` to `.env` and add a key, or paste one in the Chat tab.

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
