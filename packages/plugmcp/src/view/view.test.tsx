// @vitest-environment happy-dom
import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import { InMemoryTransport } from "@modelcontextprotocol/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ViewRoot, useTool, type ToolView } from "./index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let latest: ToolView<Record<string, unknown>, Record<string, unknown>> | undefined;
function Probe() {
  latest = useTool();
  return null;
}

const wait = (ms = 20) => act(() => new Promise<void>((done) => setTimeout(done, ms)));

async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i += 1) await wait();
  if (!check()) throw new Error("Timed out waiting for the view.");
}

let root: Root | undefined;
let bridge: AppBridge | undefined;

async function mount(options: { context?: boolean; modes?: string[] } = {}) {
  latest = undefined;
  document.head.innerHTML = "";
  if (options.modes) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "plugmcp-view");
    meta.setAttribute("content", JSON.stringify({ displayModes: options.modes }));
    document.head.append(meta);
  }
  const [viewSide, hostSide] = InMemoryTransport.createLinkedPair();
  bridge = new AppBridge(
    null,
    { name: "Test host", version: "1.0.0" },
    { serverTools: {}, ...(options.context === false ? {} : { updateModelContext: { text: {} } }) },
    { hostContext: { theme: "light", displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] } },
  );
  let initialized = false;
  bridge.addEventListener("initialized", () => {
    initialized = true;
  });
  await bridge.connect(hostSide as never);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(ViewRoot, { name: "probe", transport: viewSide as never, children: createElement(Probe) }));
  });
  await until(() => initialized && latest?.app != null);
  return bridge;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  await bridge?.close();
});

describe("useTool", () => {
  it("shows the input while it streams, then the full input", async () => {
    const host = await mount();
    await host.sendToolInputPartial({ arguments: { title: "Pla" } });
    await until(() => latest?.partialInput !== undefined);
    expect(latest?.partialInput).toEqual({ title: "Pla" });
    expect(latest?.input).toBeUndefined();
    await host.sendToolInput({ arguments: { title: "Plan" } });
    await until(() => latest?.input !== undefined);
    expect(latest?.input).toEqual({ title: "Plan" });
    expect(latest?.partialInput).toBeUndefined();
  });

  it("declares its display modes and follows the host when it changes mode", async () => {
    const host = await mount({ modes: ["inline", "fullscreen"] });
    expect(host.getAppCapabilities()?.availableDisplayModes).toEqual(["inline", "fullscreen"]);
    expect(latest?.displayMode).toBe("inline");
    expect(latest?.availableDisplayModes).toEqual(["inline", "fullscreen"]);
    host.onrequestdisplaymode = async ({ mode }) => ({ mode });
    let set: string | undefined;
    await act(async () => {
      set = await latest?.requestDisplayMode("fullscreen");
    });
    expect(set).toBe("fullscreen");
    await until(() => latest?.displayMode === "fullscreen");
    await host.sendHostContextChange({ displayMode: "inline" });
    await until(() => latest?.displayMode === "inline");
  });

  it("sends model context when the host takes it", async () => {
    const host = await mount();
    let seen = "";
    host.onupdatemodelcontext = async (params) => {
      seen = (params.content ?? []).map((block) => (block.type === "text" ? block.text : "")).join("");
      return {};
    };
    expect(await latest?.updateModelContext("The user renamed a node.", { revision: 2 })).toBe(true);
    expect(seen).toBe("The user renamed a node.");
  });

  it("reports false when the host has no model context", async () => {
    await mount({ context: false });
    expect(await latest?.updateModelContext("ignored")).toBe(false);
  });
});
