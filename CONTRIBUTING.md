# Contributing

Thanks for helping. This repo holds the PlugMCP SDK, its command line, the local Studio and the project scaffolder.

## Set up

You need Node 20.19 or newer and pnpm 10.

```bash
git clone https://github.com/plugmcp-ai/sdk.git
cd sdk
pnpm install
pnpm build
```

Run the example with the Studio:

```bash
cd examples/weather
pnpm dev
```

## Layout

| Path | |
|---|---|
| `packages/plugmcp/src/index.ts` | `createServer`, `tool`, result handling |
| `packages/plugmcp/src/http.ts`, `stdio.ts` | Transports |
| `packages/plugmcp/src/view/` | `useTool` and the view runtime |
| `packages/plugmcp/src/dev/` | The dev server and the Studio's local API |
| `packages/plugmcp/src/cli/` | The `plugmcp` command |
| `packages/studio/` | The Studio interface. Built into `packages/plugmcp/studio-dist` |
| `packages/create-plugmcp/` | The scaffolder and its templates |
| `examples/weather/` | The project used for manual testing and by the tests |

To work on the Studio with hot reload, run `pnpm exec plugmcp dev --port 3333` in `examples/weather`, then `pnpm dev` in `packages/studio`.

## Before you open a pull request

```bash
pnpm build
pnpm typecheck
pnpm test
```

Then check the change by hand in the Studio. A tool call that works in a test can still look wrong in the chat.

## Ground rules

- Keep the developer API small. A new option needs a clear case that the existing ones cannot cover.
- No telemetry and no network calls the user did not ask for. The directory is contacted only for `search`, `add`, `list`, the Directory tab and the one-time check in `create-plugmcp`.
- API keys never go to the browser and never go anywhere but the provider the user picked.
- The Studio's local API accepts requests only from the Studio page on the same machine. Keep it that way.
- Plain words in messages and UI copy. No emojis.
- Follow the MCP and MCP Apps specifications. Do not guess SDK signatures; read the types.

## Reporting bugs

Open an issue with what you ran, what you expected, and what happened. The output of `plugmcp version` and your Node version help.
