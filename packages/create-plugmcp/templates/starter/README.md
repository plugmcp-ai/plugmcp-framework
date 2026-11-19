# {{name}}

{{about}}

Built with the [PlugMCP SDK](https://github.com/plugmcp-ai/sdk).

## Run it

```bash
npm run dev
```

This starts the server and opens the Studio in your browser:

- **Tools** lists your tools. Run one, see its view, and edit its code. New tool writes one from a description.
- **Playground** talks to your server with your own OpenAI, Anthropic or other key.
- **Agents** makes an agent from a prompt and your tools, and gives you the code to run it.
- **Canvas** and **Logs** show how the project fits together and every call it handled.
- **Connect** has install buttons for Cursor, VS Code, Claude Code and more.
- **Directory** searches 70,000+ existing servers on [plugmcp.ai](https://plugmcp.ai/mcp).

To use the playground, copy `.env.example` to `.env` and add a key, or paste one in the Studio.

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
