// Run the same tools inside the Claude Agent SDK, in this process, with no server to start.
//
//   ANTHROPIC_API_KEY=... npm run agent "What should I wear in Lisbon today?"

import { query } from "@anthropic-ai/claude-agent-sdk";
import { toAgentSdk } from "plugmcp/agent";
import server from "./server.js";

const prompt = process.argv.slice(2).join(" ") || "What is the weather in Lisbon?";
const { mcpServers, allowedTools } = toAgentSdk(server);

for await (const message of query({
  prompt,
  options: {
    mcpServers,
    allowedTools,
    tools: [], // only this server's tools, none of the built-in file or shell tools
    systemPrompt: server.info.instructions,
  },
})) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "text") console.log(block.text);
      if (block.type === "tool_use") console.log(`[tool] ${block.name} ${JSON.stringify(block.input)}`);
    }
  }
}
