import { createServer } from "plugmcp";
import { z } from "zod";

// Before you build: someone may already run the server you need.
// Search 70,000+ at https://plugmcp.ai/mcp or run `plugmcp search <words>`.

const server = createServer({
  name: "{{name}}",
  description: "{{about}}",
});

server.tool(
  {
    name: "hello",
    description: "Greet someone by name.",
    input: z.object({ name: z.string().describe("Who to greet") }),
  },
  async ({ name }) => `Hello, ${name}.`,
);

// To give a tool a view, add views/hello.tsx. See AGENTS.md.

export default server;
