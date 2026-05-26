/**
 * Versioned schema for the per-source SQLite derivation store.
 *
 * Migrations are append-only. The `_migrations` table records which versions
 * have been applied; each migration runs once per database, in a transaction.
 */

import type { Database } from "better-sqlite3";
import { nowIso } from "@/lib/kernel/ids";

export interface Migration {
  version: number;
  up: (db: Database) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE sources (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          path TEXT NOT NULL,
          table_name TEXT,
          headers_json TEXT NOT NULL,
          row_count INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          connected_at TEXT NOT NULL,
          last_read_at TEXT NOT NULL,
          subject TEXT,
          description TEXT
        );

        CREATE TABLE views (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          title TEXT,
          description TEXT,
          filters_json TEXT NOT NULL,
          sort_json TEXT,
          columns_json TEXT NOT NULL,
          lim INTEGER,
          author TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(source_id, name)
        );
        CREATE INDEX idx_views_source ON views(source_id);

        CREATE TABLE collections (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          title TEXT,
          description TEXT,
          row_ids_json TEXT NOT NULL,
          author TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(source_id, name)
        );
        CREATE INDEX idx_collections_source ON collections(source_id);

        CREATE TABLE branches (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          title TEXT,
          description TEXT,
          base_snapshot_id TEXT,
          edits_json TEXT NOT NULL,
          author TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(source_id, name)
        );
        CREATE INDEX idx_branches_source ON branches(source_id);

        CREATE TABLE snapshots (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          title TEXT,
          description TEXT,
          flavor TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          app_spec_json TEXT,
          row_count INTEGER,
          author TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(source_id, name)
        );
        CREATE INDEX idx_snapshots_source ON snapshots(source_id);

        CREATE TABLE snapshot_rows (
          snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
          row_id TEXT NOT NULL,
          cells_json TEXT NOT NULL,
          PRIMARY KEY(snapshot_id, row_id)
        );

        CREATE TABLE annotations (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          title TEXT,
          description TEXT,
          annotation_kind TEXT NOT NULL,
          row_id TEXT,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          author TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(source_id, row_id, key)
        );
        CREATE INDEX idx_annotations_source_row ON annotations(source_id, row_id);
      `);
    },
  },
];

export function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare("SELECT version FROM _migrations").all().map((r) => (r as { version: number }).version)
  );

  const record = db.prepare("INSERT INTO _migrations (version, applied_at) VALUES (?, ?)");

  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    const tx = db.transaction(() => {
      m.up(db);
      record.run(m.version, nowIso());
    });
    tx();
  }
}
