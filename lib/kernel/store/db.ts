/**
 * SQLite connection lifecycle for a single source's derivation store.
 *
 * One database file per connected source, at dbPath(sourceId). We open in WAL
 * mode for concurrent reads + safer writes, enforce FKs, and apply any pending
 * migrations on open.
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { dbPath, ensureStoreDir } from "@/lib/kernel/paths";
import { runMigrations } from "./migrations";

export type Store = DatabaseType;

export function openStore(sourceId: string): Store {
  ensureStoreDir(sourceId);
  const db = new Database(dbPath(sourceId));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

export function closeStore(db: Store): void {
  db.close();
}

export function withStore<T>(sourceId: string, fn: (db: Store) => T): T {
  const db = openStore(sourceId);
  try {
    return fn(db);
  } finally {
    closeStore(db);
  }
}
