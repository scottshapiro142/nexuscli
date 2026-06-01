/**
 * Nexus user config.
 *
 *   ~/.nexus/config.json
 *     { "openrouterApiKey": "sk-or-..." }
 *
 * Resolution precedence for the OpenRouter key (highest wins):
 *   1. process.env.OPENROUTER_API_KEY
 *   2. ~/.nexus/config.json → openrouterApiKey
 *
 * The file is written with mode 0600 so other users on a shared machine
 * can't read the key.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ensureNexusHome, nexusHome } from "./paths";

export interface NexusConfig {
  openrouterApiKey?: string;
}

const KEY_HINT =
  "Get a key at https://openrouter.ai/keys, then run: nexus config set-key <key>";

export function configFilePath(): string {
  return path.join(nexusHome(), "config.json");
}

export function readConfig(): NexusConfig {
  const file = configFilePath();
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (parsed && typeof parsed === "object") return parsed as NexusConfig;
    return {};
  } catch {
    return {};
  }
}

export function writeConfig(next: NexusConfig): void {
  ensureNexusHome();
  const file = configFilePath();
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  // Re-chmod in case the file pre-existed with looser permissions.
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Best-effort; some filesystems (e.g. Windows) won't honor it.
  }
}

export function setOpenRouterKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("Key is empty.");
  const cfg = readConfig();
  cfg.openrouterApiKey = trimmed;
  writeConfig(cfg);
}

export function clearOpenRouterKey(): void {
  const cfg = readConfig();
  delete cfg.openrouterApiKey;
  writeConfig(cfg);
}

/** Resolved key, or undefined if not set anywhere. */
export function getOpenRouterKey(): string | undefined {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromFile = readConfig().openrouterApiKey?.trim();
  return fromFile || undefined;
}

/**
 * Resolve the key or throw with a message that points the user at how to fix it.
 * Use this from any lib code that needs to call OpenRouter.
 */
export function requireOpenRouterKey(): string {
  const key = getOpenRouterKey();
  if (key) return key;
  throw new Error(
    `OpenRouter API key not set. ${KEY_HINT}\n` +
      `(or export OPENROUTER_API_KEY=... in your shell.)`
  );
}

/** Short label describing where the key came from, for `nexus config get`. */
export function describeKeySource(): "env" | "config" | "none" {
  if (process.env.OPENROUTER_API_KEY?.trim()) return "env";
  if (readConfig().openrouterApiKey?.trim()) return "config";
  return "none";
}

/** Mask all but the last 4 chars of a secret for display. */
export function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
