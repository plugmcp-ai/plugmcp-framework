import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readEnvFile } from "./project.js";

export const PROVIDERS = {
  openai: { label: "OpenAI", env: "OPENAI_API_KEY", needsKey: true },
  anthropic: { label: "Anthropic", env: "ANTHROPIC_API_KEY", needsKey: true },
  google: { label: "Google", env: "GOOGLE_GENERATIVE_AI_API_KEY", needsKey: true },
  openrouter: { label: "OpenRouter", env: "OPENROUTER_API_KEY", needsKey: true },
  ollama: { label: "Ollama (local)", env: "", needsKey: false },
  custom: { label: "OpenAI-compatible", env: "OPENAI_COMPATIBLE_API_KEY", needsKey: false },
} as const;

export type ProviderId = keyof typeof PROVIDERS;

export interface Settings {
  keys: Partial<Record<ProviderId, string>>;
  provider?: ProviderId;
  models: Partial<Record<ProviderId, string>>;
  /** Base address for the "custom" provider. */
  customBaseUrl?: string;
}

export const configDir = () => process.env.PLUGMCP_HOME ?? join(homedir(), ".plugmcp");
const settingsPath = () => join(configDir(), "keys.json");

export function readSettings(): Settings {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), "utf8")) as Partial<Settings>;
    return { keys: parsed.keys ?? {}, models: parsed.models ?? {}, provider: parsed.provider, customBaseUrl: parsed.customBaseUrl };
  } catch {
    return { keys: {}, models: {} };
  }
}

export function writeSettings(settings: Settings): void {
  if (!existsSync(configDir())) mkdirSync(configDir(), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
}

/** A key from the project's .env wins over one saved in the home folder, then the shell. */
export function resolveKey(provider: ProviderId, root: string): { key?: string; source?: "project .env" | "saved" | "environment" } {
  const env = PROVIDERS[provider].env;
  const fromFile = env ? readEnvFile(root)[env] : undefined;
  if (fromFile) return { key: fromFile, source: "project .env" };
  const saved = readSettings().keys[provider];
  if (saved) return { key: saved, source: "saved" };
  const fromShell = env ? process.env[env] : undefined;
  if (fromShell) return { key: fromShell, source: "environment" };
  return {};
}

/** What the browser is allowed to know: which providers are ready, never the keys. */
export function publicSettings(root: string) {
  const settings = readSettings();
  return {
    provider: settings.provider,
    models: settings.models,
    customBaseUrl: settings.customBaseUrl ?? "",
    providers: (Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
      const { source } = resolveKey(id, root);
      return { id, label: PROVIDERS[id].label, needsKey: PROVIDERS[id].needsKey, hasKey: Boolean(source), source: source ?? null };
    }),
  };
}
