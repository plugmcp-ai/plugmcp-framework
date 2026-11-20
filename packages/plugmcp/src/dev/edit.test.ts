import { describe, expect, it } from "vitest";
import { expressionEnd, matching, setInputDescription, setServerInfo, toolCall } from "./edit.js";

const SOURCE = `import { createServer } from "plugmcp";
import { z } from "zod";

const server = createServer({
  name: "weather",
  description: "Weather for a city.",
});

server.tool(
  {
    name: "get_weather",
    description: "Current weather. Use it for a city, e.g. (Lisbon).",
    input: z.object({
      city: z.string().describe("City name, for example Lisbon"),
      units: z.enum(["c", "f"]).optional(),
      days: z
        .number()
        .min(1)
        .describe("How many days, e.g. 3"),
    }),
  },
  async ({ city }) => ({ city, note: "a ) bracket, in a string" }),
);

server.tool(
  {
    name: "convert",
    description: "Convert an amount.",
    input: z.object({ city: z.string().describe("Not the weather city"), amount: z.number() }),
  },
  async ({ amount }) => ({ amount }),
);

export default server;
`;

describe("finding code", () => {
  it("matches brackets past strings and comments", () => {
    const text = `f({ a: ")", b: [1, 2] /* ) */ }) + g()`;
    expect(text[matching(text, 1)]).toBe(")");
    expect(matching(text, 1)).toBe(text.indexOf(") + g"));
  });

  it("ends an expression at the comma or bracket after it", () => {
    const text = `z.string().describe("a, b"), next: 1 }`;
    expect(text.slice(0, expressionEnd(text, 0))).toBe(`z.string().describe("a, b")`);
    expect(expressionEnd("z.number() }", 0)).toBe(11);
  });

  it("finds the whole call of one tool", () => {
    const call = toolCall(SOURCE, "convert");
    const body = SOURCE.slice(call.start, call.end);
    expect(body).toContain('name: "convert"');
    expect(body).not.toContain("get_weather");
    expect(() => toolCall(SOURCE, "missing")).toThrow(/Could not find the tool missing/);
  });
});

describe("input descriptions", () => {
  it("replaces a description and leaves everything else alone", () => {
    const out = setInputDescription(SOURCE, "get_weather", "city", 'The city, like "Cairo"');
    expect(out).toContain('city: z.string().describe("The city, like \\"Cairo\\""),');
    expect(out).toContain('describe("Not the weather city")');
    expect(out.length - SOURCE.length).toBe('"The city, like \\"Cairo\\""'.length - '"City name, for example Lisbon"'.length);
  });

  it("changes the right tool when two tools share an input name", () => {
    const out = setInputDescription(SOURCE, "convert", "city", "Changed");
    expect(out).toContain('input: z.object({ city: z.string().describe("Changed"), amount: z.number() })');
    expect(out).toContain('describe("City name, for example Lisbon")');
  });

  it("adds a description to an input that has none", () => {
    expect(setInputDescription(SOURCE, "get_weather", "units", "c or f")).toContain('units: z.enum(["c", "f"]).optional().describe("c or f"),');
    expect(setInputDescription(SOURCE, "convert", "amount", "How much")).toContain('amount: z.number().describe("How much") })');
  });

  it("handles an input written over several lines", () => {
    const out = setInputDescription(SOURCE, "get_weather", "days", "Days ahead");
    expect(out).toContain('.min(1)\n        .describe("Days ahead"),');
  });

  it("says so instead of guessing", () => {
    expect(() => setInputDescription(SOURCE, "get_weather", "nope", "x")).toThrow(/Could not find the input nope/);
    const computed = SOURCE.replace('.describe("City name, for example Lisbon")', ".describe(CITY_HELP)");
    expect(() => setInputDescription(computed, "get_weather", "city", "x")).toThrow(/not a plain string/);
  });
});

describe("server title and description", () => {
  it("replaces the description and adds a title", () => {
    const out = setServerInfo(SOURCE, { title: "Weather desk", description: "Forecasts, fast." });
    expect(out).toContain('description: "Forecasts, fast.",');
    expect(out).toContain('createServer({\n  title: "Weather desk",\n  name: "weather",');
    // Tool descriptions are untouched.
    expect(out).toContain('description: "Current weather. Use it for a city, e.g. (Lisbon).",');
  });

  it("adds a description to a one-line createServer", () => {
    const out = setServerInfo(`const s = createServer({ name: "a" });`, { description: "Does a thing." });
    expect(out).toBe(`const s = createServer({\n  description: "Does a thing.", name: "a" });`);
  });

  it("leaves the file alone when there is nothing to set", () => {
    expect(setServerInfo(SOURCE, { title: "  ", description: "" })).toBe(SOURCE);
  });

  it("refuses a description that is not a plain string", () => {
    expect(() => setServerInfo(`createServer({ name: "a", description: ABOUT })`, { description: "x" })).toThrow(/not a plain string/);
    expect(() => setServerInfo(`export default {}`, { description: "x" })).toThrow(/createServer/);
  });
});
