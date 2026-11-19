import type { Plugin } from "vite";

export const VIEW_ENTRY_PREFIX = "/@plugmcp-view/";

/** The page every view is mounted in. Kept tiny so hosts can load it fast. */
export function viewShell(tool: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{color-scheme:dark;font-family:Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.5}
:root[data-theme="light"]{color-scheme:light}
html,body{margin:0;background:transparent}
body{padding:0}
</style>
</head>
<body>
<div id="root"></div>
<script type="module" src="${VIEW_ENTRY_PREFIX}${tool}.js"></script>
</body>
</html>`;
}

/**
 * Serves one small entry module per view. It mounts views/<tool>.tsx inside
 * ViewRoot, so a view file is only a default-exported component.
 */
export function viewEntryPlugin(views: () => Record<string, string>): Plugin {
  return {
    name: "plugmcp:view-entry",
    resolveId(id) {
      if (id.startsWith(VIEW_ENTRY_PREFIX)) return id;
      return null;
    },
    load(id) {
      if (!id.startsWith(VIEW_ENTRY_PREFIX)) return null;
      const tool = id.slice(VIEW_ENTRY_PREFIX.length).replace(/\.js$/, "");
      const file = views()[tool];
      if (!file) return `document.getElementById("root").textContent = "No view file for ${tool}.";`;
      return [
        `import { createElement } from "react";`,
        `import { createRoot } from "react-dom/client";`,
        `import { ViewRoot } from "plugmcp/view";`,
        `import View from "/${file}";`,
        `createRoot(document.getElementById("root")).render(`,
        `  createElement(ViewRoot, { name: ${JSON.stringify(tool)} }, createElement(View)),`,
        `);`,
      ].join("\n");
    },
  };
}
