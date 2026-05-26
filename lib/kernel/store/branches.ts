/**
 * Branch repository.
 */

import type { Database } from "better-sqlite3";
import { Branch, BranchSchema } from "@/lib/kernel/types";
import { newId, nowIso } from "@/lib/kernel/ids";

interface BranchRow {
  id: string;
  source_id: string;
  name: string;
  title: string | null;
  description: string | null;
  base_snapshot_id: string | null;
  edits_json: string;
  author: string;
  created_at: string;
  updated_at: string;
}

function rowToBranch(row: BranchRow): Branch {
  return BranchSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    name: row.name,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    kind: "branch",
    baseSnapshotId: row.base_snapshot_id ?? undefined,
    edits: JSON.parse(row.edits_json),
    author: row.author,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export type CreateBranchInput = Omit<Partial<Branch>, "kind"> & {
  sourceId: string;
  name: string;
};

export function createBranch(db: Database, input: CreateBranchInput): Branch {
  const now = nowIso();
  const b = BranchSchema.parse({
    kind: "branch",
    id: input.id ?? newId("br"),
    sourceId: input.sourceId,
    name: input.name,
    title: input.title,
    description: input.description,
    baseSnapshotId: input.baseSnapshotId,
    edits: input.edits ?? [],
    author: input.author ?? "user",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  });

  db.prepare(
    `INSERT INTO branches (id, source_id, name, title, description, base_snapshot_id, edits_json, author, created_at, updated_at)
     VALUES (@id, @source_id, @name, @title, @description, @base_snapshot_id, @edits_json, @author, @created_at, @updated_at)`
  ).run({
    id: b.id,
    source_id: b.sourceId,
    name: b.name,
    title: b.title ?? null,
    description: b.description ?? null,
    base_snapshot_id: b.baseSnapshotId ?? null,
    edits_json: JSON.stringify(b.edits),
    author: b.author,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
  });

  return b;
}

export function getBranch(db: Database, id: string): Branch | null {
  const row = db.prepare("SELECT * FROM branches WHERE id = ?").get(id) as BranchRow | undefined;
  return row ? rowToBranch(row) : null;
}

export function getBranchByName(db: Database, sourceId: string, name: string): Branch | null {
  const row = db
    .prepare("SELECT * FROM branches WHERE source_id = ? AND name = ?")
    .get(sourceId, name) as BranchRow | undefined;
  return row ? rowToBranch(row) : null;
}

export function listBranches(db: Database, sourceId?: string): Branch[] {
  const rows = sourceId
    ? (db.prepare("SELECT * FROM branches WHERE source_id = ? ORDER BY updated_at DESC").all(sourceId) as BranchRow[])
    : (db.prepare("SELECT * FROM branches ORDER BY updated_at DESC").all() as BranchRow[]);
  return rows.map(rowToBranch);
}

export function updateBranch(
  db: Database,
  id: string,
  patch: Partial<Omit<Branch, "id" | "kind" | "sourceId" | "createdAt">>
): Branch {
  const current = getBranch(db, id);
  if (!current) throw new Error(`Branch not found: ${id}`);

  const updated = BranchSchema.parse({
    ...current,
    ...patch,
    id: current.id,
    sourceId: current.sourceId,
    kind: "branch",
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  });

  db.prepare(
    `UPDATE branches SET
       name = @name,
       title = @title,
       description = @description,
       base_snapshot_id = @base_snapshot_id,
       edits_json = @edits_json,
       author = @author,
       updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id: updated.id,
    name: updated.name,
    title: updated.title ?? null,
    description: updated.description ?? null,
    base_snapshot_id: updated.baseSnapshotId ?? null,
    edits_json: JSON.stringify(updated.edits),
    author: updated.author,
    updated_at: updated.updatedAt,
  });

  return updated;
}

export function deleteBranch(db: Database, id: string): boolean {
  const r = db.prepare("DELETE FROM branches WHERE id = ?").run(id);
  return r.changes > 0;
}
