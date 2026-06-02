/**
 * Snapshot repository.
 *
 * "rows" flavor: caller passes the materialized rows; we hash each row and
 * store it in snapshot_rows. "appspec" flavor: the AppSpec lives in the
 * snapshots row itself.
 */

import type { Database } from "better-sqlite3";
import { Snapshot, SnapshotSchema } from "@/lib/kernel/types";
import { newId, nowIso } from "@/lib/kernel/ids";
import { hashRow, sha256 } from "@/lib/kernel/hash";

interface SnapshotRow {
  id: string;
  source_id: string;
  name: string;
  title: string | null;
  description: string | null;
  flavor: string;
  content_hash: string;
  app_spec_json: string | null;
  row_count: number | null;
  author: string;
  created_at: string;
  updated_at: string;
}

function rowToSnapshot(row: SnapshotRow): Snapshot {
  return SnapshotSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    name: row.name,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    kind: "snapshot",
    flavor: row.flavor,
    contentHash: row.content_hash,
    appSpec: row.app_spec_json ? JSON.parse(row.app_spec_json) : undefined,
    rowCount: row.row_count ?? undefined,
    author: row.author,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export type CreateSnapshotInput = Omit<Partial<Snapshot>, "kind" | "contentHash"> & {
  sourceId: string;
  name: string;
  flavor: Snapshot["flavor"];
  /** Required when flavor === "rows". */
  headers?: string[];
  /** Required when flavor === "rows". One entry per row. */
  rows?: Record<string, string>[];
};

export function createSnapshot(db: Database, input: CreateSnapshotInput): Snapshot {
  const now = nowIso();
  const id = input.id ?? newId("snap");

  let contentHash: string;
  let rowCount: number | undefined;
  const rowsToWrite: { rowId: string; cells: Record<string, string> }[] = [];

  if (input.flavor === "rows") {
    if (!input.headers || !input.rows) {
      throw new Error("createSnapshot(rows): headers and rows are required");
    }
    for (const r of input.rows) {
      rowsToWrite.push({ rowId: hashRow(input.headers, r), cells: r });
    }
    rowCount = input.rows.length;
    contentHash = sha256(
      input.headers.join("") + "\n" + rowsToWrite.map((r) => r.rowId).join("\n")
    );
  } else {
    if (!input.appSpec) throw new Error("createSnapshot(appspec): appSpec is required");
    contentHash = sha256(JSON.stringify(input.appSpec));
  }

  const snap = SnapshotSchema.parse({
    kind: "snapshot",
    id,
    sourceId: input.sourceId,
    name: input.name,
    title: input.title,
    description: input.description,
    flavor: input.flavor,
    contentHash,
    appSpec: input.appSpec,
    rowCount,
    author: input.author ?? "user",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  });

  const insertSnap = db.prepare(
    `INSERT INTO snapshots (id, source_id, name, title, description, flavor, content_hash, app_spec_json, row_count, author, created_at, updated_at)
     VALUES (@id, @source_id, @name, @title, @description, @flavor, @content_hash, @app_spec_json, @row_count, @author, @created_at, @updated_at)`
  );
  const insertRow = db.prepare(
    `INSERT INTO snapshot_rows (snapshot_id, row_id, cells_json) VALUES (?, ?, ?)
     ON CONFLICT(snapshot_id, row_id) DO NOTHING`
  );

  const tx = db.transaction(() => {
    insertSnap.run({
      id: snap.id,
      source_id: snap.sourceId,
      name: snap.name,
      title: snap.title ?? null,
      description: snap.description ?? null,
      flavor: snap.flavor,
      content_hash: snap.contentHash,
      app_spec_json: snap.appSpec ? JSON.stringify(snap.appSpec) : null,
      row_count: snap.rowCount ?? null,
      author: snap.author,
      created_at: snap.createdAt,
      updated_at: snap.updatedAt,
    });
    for (const r of rowsToWrite) {
      insertRow.run(snap.id, r.rowId, JSON.stringify(r.cells));
    }
  });
  tx();

  return snap;
}

export function getSnapshot(db: Database, id: string): Snapshot | null {
  const row = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(id) as SnapshotRow | undefined;
  return row ? rowToSnapshot(row) : null;
}

export function getSnapshotByName(db: Database, sourceId: string, name: string): Snapshot | null {
  const row = db
    .prepare("SELECT * FROM snapshots WHERE source_id = ? AND name = ?")
    .get(sourceId, name) as SnapshotRow | undefined;
  return row ? rowToSnapshot(row) : null;
}

export function listSnapshots(db: Database, sourceId?: string): Snapshot[] {
  const rows = sourceId
    ? (db.prepare("SELECT * FROM snapshots WHERE source_id = ? ORDER BY updated_at DESC").all(sourceId) as SnapshotRow[])
    : (db.prepare("SELECT * FROM snapshots ORDER BY updated_at DESC").all() as SnapshotRow[]);
  return rows.map(rowToSnapshot);
}

export function updateSnapshot(
  db: Database,
  id: string,
  patch: Partial<Pick<Snapshot, "name" | "title" | "description" | "author">>
): Snapshot {
  const current = getSnapshot(db, id);
  if (!current) throw new Error(`Snapshot not found: ${id}`);

  const updated = SnapshotSchema.parse({
    ...current,
    ...patch,
    id: current.id,
    sourceId: current.sourceId,
    kind: "snapshot",
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  });

  db.prepare(
    `UPDATE snapshots SET
       name = @name,
       title = @title,
       description = @description,
       author = @author,
       updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id: updated.id,
    name: updated.name,
    title: updated.title ?? null,
    description: updated.description ?? null,
    author: updated.author,
    updated_at: updated.updatedAt,
  });

  return updated;
}

export function deleteSnapshot(db: Database, id: string): boolean {
  const r = db.prepare("DELETE FROM snapshots WHERE id = ?").run(id);
  return r.changes > 0;
}

export interface SnapshotRowOut {
  rowId: string;
  cells: Record<string, string>;
}

export function getSnapshotRows(db: Database, snapshotId: string): SnapshotRowOut[] {
  const rows = db
    .prepare("SELECT row_id, cells_json FROM snapshot_rows WHERE snapshot_id = ? ORDER BY rowid")
    .all(snapshotId) as { row_id: string; cells_json: string }[];
  return rows.map((r) => ({ rowId: r.row_id, cells: JSON.parse(r.cells_json) }));
}
