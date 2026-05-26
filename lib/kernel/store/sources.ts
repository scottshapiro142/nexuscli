/**
 * Source repository: per-store row plus the cross-store ~/.nexus/sources.json
 * index that lets the CLI list everything without opening every db.
 */

import * as fs from "node:fs";
import type { Database } from "better-sqlite3";
import { Source, SourceSchema } from "@/lib/kernel/types";
import { ensureNexusHome, sourcesIndexPath } from "@/lib/kernel/paths";

interface SourceIndexEntry {
  id: string;
  kind: Source["kind"];
  path: string;
  table?: string;
  subject?: string;
  connectedAt: string;
  lastReadAt: string;
}

export interface SourcesIndex {
  version: 1;
  sources: Record<string, SourceIndexEntry>;
}

interface SourceRow {
  id: string;
  kind: string;
  path: string;
  table_name: string | null;
  headers_json: string;
  row_count: number;
  content_hash: string;
  connected_at: string;
  last_read_at: string;
  subject: string | null;
  description: string | null;
}

function rowToSource(row: SourceRow): Source {
  return SourceSchema.parse({
    id: row.id,
    kind: row.kind,
    path: row.path,
    table: row.table_name ?? undefined,
    headers: JSON.parse(row.headers_json),
    rowCount: row.row_count,
    contentHash: row.content_hash,
    connectedAt: row.connected_at,
    lastReadAt: row.last_read_at,
    subject: row.subject ?? undefined,
    description: row.description ?? undefined,
  });
}

export function upsertSource(db: Database, source: Source): Source {
  const parsed = SourceSchema.parse(source);
  db.prepare(
    `INSERT INTO sources (id, kind, path, table_name, headers_json, row_count, content_hash, connected_at, last_read_at, subject, description)
     VALUES (@id, @kind, @path, @table_name, @headers_json, @row_count, @content_hash, @connected_at, @last_read_at, @subject, @description)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       path = excluded.path,
       table_name = excluded.table_name,
       headers_json = excluded.headers_json,
       row_count = excluded.row_count,
       content_hash = excluded.content_hash,
       connected_at = excluded.connected_at,
       last_read_at = excluded.last_read_at,
       subject = excluded.subject,
       description = excluded.description`
  ).run({
    id: parsed.id,
    kind: parsed.kind,
    path: parsed.path,
    table_name: parsed.table ?? null,
    headers_json: JSON.stringify(parsed.headers),
    row_count: parsed.rowCount,
    content_hash: parsed.contentHash,
    connected_at: parsed.connectedAt,
    last_read_at: parsed.lastReadAt,
    subject: parsed.subject ?? null,
    description: parsed.description ?? null,
  });

  registerSourceInIndex(parsed);
  return parsed;
}

export function getSource(db: Database, id: string): Source | null {
  const row = db.prepare("SELECT * FROM sources WHERE id = ?").get(id) as SourceRow | undefined;
  return row ? rowToSource(row) : null;
}

export function readSourcesIndex(): SourcesIndex {
  const empty: SourcesIndex = { version: 1, sources: {} };
  const p = sourcesIndexPath();
  if (!fs.existsSync(p)) return empty;
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<SourcesIndex>;
    if (!parsed || typeof parsed !== "object" || !parsed.sources) return empty;
    return { version: 1, sources: parsed.sources as Record<string, SourceIndexEntry> };
  } catch {
    return empty;
  }
}

export function writeSourcesIndex(index: SourcesIndex): void {
  ensureNexusHome();
  fs.writeFileSync(sourcesIndexPath(), JSON.stringify(index, null, 2), "utf8");
}

export function registerSourceInIndex(source: Source): void {
  const idx = readSourcesIndex();
  idx.sources[source.id] = {
    id: source.id,
    kind: source.kind,
    path: source.path,
    table: source.table,
    subject: source.subject,
    connectedAt: source.connectedAt,
    lastReadAt: source.lastReadAt,
  };
  writeSourcesIndex(idx);
}

export function listSources(): SourceIndexEntry[] {
  return Object.values(readSourcesIndex().sources);
}
