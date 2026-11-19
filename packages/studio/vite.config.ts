import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Studio is built once and shipped inside the plugmcp package.
// For work on the Studio itself: run `plugmcp dev` in an example on port 3333, then `pnpm dev` here.
export default defineConfig({
  base: "/__studio/",
  plugins: [react()],
  build: { outDir: "../plugmcp/studio-dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    port: 5180,
    proxy: {
      "/__studio/api": "http://127.0.0.1:3333",
      "/mcp": "http://127.0.0.1:3333",
    },
  },
});
