import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Candidate {
  provider: string;
  name: string;
  baseUrl: string;
}

export function authPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(
    env.XDG_DATA_HOME || join(env.HOME || homedir(), ".local", "share"),
    "opencode",
    "auth.json",
  );
}

function configHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config");
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

// Drops // and /* */ comments and trailing commas without touching string contents.
export function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

async function readJson(path: string, jsonc = false): Promise<Record<string, unknown>> {
  try {
    const text = await readFile(path, "utf8");
    const value = jsonc ? parseJsonc(text) : JSON.parse(text);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Providers with an explicit base URL: opencode.jsonc first, then ~/.config/litellm-usage/config.json. */
export async function readCandidates(env: NodeJS.ProcessEnv = process.env): Promise<Candidate[]> {
  const found = new Map<string, Candidate>();
  const opencode = await readJson(join(configHome(env), "opencode", "opencode.jsonc"), true);
  for (const [provider, def] of Object.entries(asRecord(opencode.provider))) {
    const entry = asRecord(def);
    const baseUrl = asRecord(entry.options).baseURL;
    if (typeof baseUrl !== "string" || !baseUrl.trim()) continue;
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name : provider;
    found.set(provider, { provider, name, baseUrl: normalizeBaseUrl(baseUrl) });
  }
  const own = await readJson(join(configHome(env), "litellm-usage", "config.json"));
  for (const [provider, def] of Object.entries(asRecord(own.providers))) {
    const entry = typeof def === "string" ? { baseUrl: def } : asRecord(def);
    if (typeof entry.baseUrl !== "string" || !entry.baseUrl.trim()) continue;
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name : provider;
    found.set(provider, { provider, name, baseUrl: normalizeBaseUrl(entry.baseUrl) });
  }
  return [...found.values()];
}

export async function readKey(path: string, provider: string): Promise<string | null> {
  const entry = asRecord((await readJson(path))[provider]);
  return typeof entry.key === "string" && entry.key.trim() ? entry.key.trim() : null;
}
