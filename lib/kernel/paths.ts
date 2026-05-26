/**
 * Nexus kernel: filesystem layout.
 *
 *   ~/.nexus/
 *     sources.json            — index of every connected master (id → source meta)
 *     <sheet-hash>/
 *       nexus.db              — the SQLite derivation store
 *       meta.json             — last-known Source record
 *       cache/                — Iris's structural read / tells / suggests cache
 *
 * The base directory is overridable via NEXUS_HOME for tests.
 */

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

export function nexusHome(): string {
  return process.env.NEXUS_HOME ?? path.join(os.homedir(), ".nexus");
}

export function sourcesIndexPath(): string {
  return path.join(nexusHome(), "sources.json");
}

export function storeDir(sourceId: string): string {
  return path.join(nexusHome(), sourceId);
}

export function dbPath(sourceId: string): string {
  return path.join(storeDir(sourceId), "nexus.db");
}

export function metaPath(sourceId: string): string {
  return path.join(storeDir(sourceId), "meta.json");
}

export function cacheDir(sourceId: string): string {
  return path.join(storeDir(sourceId), "cache");
}

/**
 * Make sure the store directory for a source exists. Idempotent.
 */
export function ensureStoreDir(sourceId: string): string {
  const dir = storeDir(sourceId);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(cacheDir(sourceId), { recursive: true });
  return dir;
}

export function ensureNexusHome(): string {
  const home = nexusHome();
  fs.mkdirSync(home, { recursive: true });
  return home;
}
