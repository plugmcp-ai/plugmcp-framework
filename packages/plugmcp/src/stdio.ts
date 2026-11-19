import { serveStdio as sdkServeStdio } from "@modelcontextprotocol/server/stdio";
import type { BuildOptions, PlugServer } from "./index.js";

/** Serve over stdin and stdout, for clients that launch the server as a command. */
export function serveStdio(server: PlugServer, options: BuildOptions = {}) {
  return sdkServeStdio(() => server.build(options));
}
