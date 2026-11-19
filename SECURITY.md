# Security

## Reporting a problem

Please do not open a public issue for a security problem. Use GitHub's private reporting on this repository (Security, then Report a vulnerability). You will get a reply within a few working days.

## What the SDK does to protect you

- **Local by default.** `plugmcp dev` and `plugmcp start` listen on `127.0.0.1` and refuse requests whose `Host` or `Origin` is not this machine, which blocks DNS rebinding from a website you happen to visit.
- **Keys stay local.** Provider keys are read from your project's `.env` or from `~/.plugmcp/keys.json`. The chat runs in the local Node process, so a key is sent only to the provider you chose. The Studio page is told which providers have a key, never the key.
- **Views are sandboxed.** A view runs in a frame with a null origin. It cannot read the Studio page, your keys, or the Studio's local API.
- **The Studio edits only your code.** Its editor and the New tool dialog can read and write the server file, files in `views/` and files in `agents/`. Nothing else in the project, including `.env`, can be opened through the Studio.
- **Describing a tool uses your model.** When you ask the Studio to write a tool, your description and your server file are sent to the model provider you chose, with your key. Code that does not load is removed again. Read what was written before you ship it.
- **No telemetry.** Nothing is sent to PlugMCP unless you run `search`, `add`, `list`, `login` or `deploy`, open the Studio's Directory page or Overview, or answer the one-time question in `create-plugmcp`.

## When you put a server online

`plugmcp start` binds to all interfaces and accepts any hostname when a `PORT` variable is set, which is what a host needs. The SDK does not add authentication to your server. Put it behind your own auth, or behind the PlugMCP gateway for API keys and call logs, before exposing tools that change data.
