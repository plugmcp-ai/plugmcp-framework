# PlugMCP SDK: how it is built

This is the full picture of the open-source SDK: what each part is, how the parts talk to each other, what is finished, and what is not.

## What it is, in one paragraph

A developer installs one package, `plugmcp`. They write MCP servers in TypeScript: a server is a set of tools behind one address, and a tool can have a view (an interactive card shown inside the chat, which is what "MCP App" means). One command, `plugmcp dev`, runs their servers on their own machine and opens the Studio, a local web app to build, see, test and connect those servers. Nothing needs an account. The PlugMCP directory and hosting are linked from inside it.

## What is and is not in this repository

- This repository is separate from the private PlugMCP product. It was written from scratch.
- It contains no code from the private product: no workflow canvas, no workflow nodes, no n8n workflows, no gateway code, no database schema.
- The canvas here only draws MCP servers and their tools. It is not the product's workflow builder and cannot run workflows.
- The only link to the product is over the public internet: the public directory API on plugmcp.ai, and an account key the user pastes for `login` and `deploy`.

## The three packages

| Package | What it is | Published |
|---|---|---|
| `packages/plugmcp` | The SDK, the command line and the dev server. Ships the Studio as ready-made static files. | Not yet |
| `packages/studio` | The Studio web app (React). Built once, then copied into `plugmcp`. Never built on a user's machine. | Never, it is internal |
| `packages/create-plugmcp` | `npx create-plugmcp my-server`. Templates: `starter`, `blank`, `agent`. | Not yet |

`examples/weather` is a working project used for tests and screenshots.

## The layers

```
  Your code            server.ts, views/*.tsx, servers/<name>/server.ts
        |
  SDK                  createServer, server.tool, useTool (views), toAgentSdk (agents)
        |
  Dev server           one Node process: MCP endpoints + Studio API + view bundler
        |
  Studio               web page at localhost: overview, tools, canvas, playground, agents, logs
        |
  Outside (optional)   your model provider (your key), plugmcp.ai directory, plugmcp.ai hosting
```

### 1. The SDK (`packages/plugmcp/src`)

| File | Job |
|---|---|
| `index.ts` | `createServer({ name, description })` and `server.tool({ name, description, input }, handler)`. Input is a zod schema. A returned object becomes the tool result. Built on the official MCP TypeScript SDK v2. |
| `view.tsx` | `useTool()` for views: the input, the output, `callTool`, `sendMessage`, the theme. Wraps the MCP Apps bridge. |
| `http.ts` | Serves a server over Streamable HTTP, with host and origin checks. |
| `stdio.ts` | Serves a server over stdio. |
| `agent.ts` | `toAgentSdk(server)`: the same tools inside the Claude Agent SDK, in process. |
| `build.ts` | `plugmcp build`: bundles the server to `dist/server.js` and each view to one HTML file. |
| `install.ts`, `landing.ts` | Install snippets for each client, the README badge, the page shown when a browser opens `/mcp`. |

A view is bound to a tool by file name: `views/get_weather.tsx` is the view of the tool `get_weather`. It is served as `ui://<server>/<tool>.html` with the MCP Apps mime type, so it shows in Claude, ChatGPT and any other host that supports MCP Apps.

### 2. The MCP layer: several servers in one folder

| On disk | Is | Answers at |
|---|---|---|
| `server.ts` and `views/` | The main MCP server | `/mcp` |
| `servers/billing/server.ts` and `servers/billing/views/` | Another MCP server | `/mcp/billing` |

Each server has its own tools, views, agents and added directory servers. Model keys are shared by the whole folder. `resolveWorkspace` in `dev/project.ts` finds them. **New MCP server** in the Studio writes a new folder in `servers/`.

### 3. The dev server (`packages/plugmcp/src/dev`)

`plugmcp dev` starts one Node process on port 3333.

| File | Job |
|---|---|
| `dev.ts` | The process. Routes `/mcp` and `/mcp/<name>` to the right server, serves the Studio, and runs one Vite instance that loads the server files and hot reloads views. |
| `project.ts` | Finds the servers in the folder and their views. Reads `.env`. |
| `api.ts` | The Studio's local API under `/__studio/api/`. Every request names the MCP server it is about. Only a page on localhost may call it. |
| `chat.ts` | The chat loop. Runs in Node with the AI SDK, so a model key never reaches the browser. |
| `generate.ts` | The prompt that teaches a model how to write a tool and a view. |
| `keys.ts` | Reads keys from `.env` or `~/.plugmcp/keys.json`. |
| `store.ts` | Saved agents (`.plugmcp/agents.json`) and the call log (in memory). |
| `views.ts` | Turns a view file into a small page. |

How the Studio writes code:

- **New tool, blank**: inserts a `server.tool(...)` block into the server file and writes a starter view.
- **New tool, described**: your model writes the block and the view. If the code does not load, the change is undone.
- **Playground chat**: the chat has four extra tools of its own: add a tool, read a file, write a file, run a tool. So "build me an MCP app that draws diagrams" writes the tool and the view, runs it, and shows the result in the chat.
- **Editor and description edit**: change the server file, a view, or a tool's description in place.

The Studio can only open the server file, files in `views/` and files in `agents/`. It cannot open `.env` or anything else.

### 4. The Studio (`packages/studio/src`)

| Page | What you do there |
|---|---|
| Overview | See every MCP server as a card, start a new one, and see the open server at a glance. |
| Tools | List of tools. Run one with a form, see its view, read its schema, edit its code and description. |
| Canvas | Each MCP server with its tools under it. Drag cards, click a tool to edit it beside the canvas, add tools and servers. |
| Playground | Chat with the open server using your own key. The chat can build tools and apps. |
| Agents | A prompt, a model and a choice of tools, with a test chat. Needs a model key. Exports a Claude Agent SDK script. |
| Logs | Every tool call, from the Studio or any connected client. |
| Connect | Install buttons and commands for Cursor, VS Code, Claude Code, Codex. |
| Directory | Search plugmcp.ai and add a hosted server to the chat. |
| Models and keys | Choose a provider and model, save a key. |

The switcher at the top of the sidebar chooses which MCP server the Studio works on. `state.tsx` holds two things: the workspace (all servers) and the open server (its tools, agents, settings).

### 5. The command line (`packages/plugmcp/src/cli`)

`dev`, `build`, `start`, `search`, `add`, `list`, `login`, `deploy --url`. `list` and `deploy` have `--dry-run`.

## Where data lives

| What | Where | Leaves the machine? |
|---|---|---|
| Your code | Your project folder | No |
| Model keys | `.env` in the project, or `~/.plugmcp/keys.json` | Only to the provider you chose |
| Agents, added directory servers | `.plugmcp/` in each server's folder (git-ignored) | No |
| Call log | Memory of the dev server | No |
| Canvas card positions, the open server | The browser's local storage | No |
| Chat messages, and your server file when the chat builds | Sent to your model provider with your key | Yes, to that provider only |
| Directory searches | plugmcp.ai public API | Yes |
| PlugMCP account key | `~/.plugmcp/credentials.json` | Only to plugmcp.ai, on `deploy` |

There is no telemetry.

## How it connects to plugmcp.ai

- **Directory**: the Studio and `plugmcp search` read the public directory. Results link to their pages on plugmcp.ai.
- **Listing**: `plugmcp list` submits a server to the directory.
- **Hosting**: `plugmcp deploy --url` puts a server the user already hosts behind a PlugMCP address, with keys and call logs. The SDK does not host code.
- **Backlinks**: the generated README badge, the server's landing page and the Studio all link to plugmcp.ai.

## What is finished and checked

- Servers, tools, views, HTTP and stdio, build and start.
- Several MCP servers in one folder, each with its own address, created from the Studio. Checked in the browser and by an automated test.
- Studio: overview, tools, canvas with dragging and in-place editing, playground that builds tools, agents, logs, connect, directory, keys.
- 25 automated tests, typecheck and lint.

## What is missing or not checked

Not built:

- **Delete or rename an MCP server, and delete a tool, from the Studio.** Today you delete the folder or the code by hand.
- **Edit an MCP server's name and description from the Studio.** Today it is done in the Code tab.
- **Connect a private hosted server with a key.** The Studio adds hosted servers that need no sign-in. A field for a key or sign-in (OAuth) is not built, so a keyed PlugMCP server cannot be added to the chat yet.
- **Real code hosting on plugmcp.ai.** `deploy` only wraps a server that is already online. This needs work in the private product.
- **Browser sign-in for `plugmcp login`.** Today the user pastes an account key.
- **OAuth helpers for tools**, a public tunnel, and a view screenshot command. Some competitors have these.
- **One command to build and start every server in a folder.** Each server is built on its own.
- **Speed benchmark** against other SDKs. Not measured.
- **Docs site.** The README is the documentation.

Built but not checked by hand:

- The agent key gate (the page that asks for a key before agents) was not seen in the browser, because a key is present on the test machine.
- Running an exported agent script with the Claude Agent SDK (no Anthropic key on the test machine).
- The Studio on a real phone. Narrow layouts were checked in a desktop browser only.
- Dragging cards on a touch screen.

Not released:

- The GitHub repository is private.
- Nothing is published to npm, so `npx create-plugmcp` does not work for the public yet.
