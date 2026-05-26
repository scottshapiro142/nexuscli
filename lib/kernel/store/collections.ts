/**
 * Collection repository.
 */

import type { Database } from "better-sqlite3";
import { Collection, CollectionSchema } from "@/lib/kernel/types";
import { newId, nowIso } from "@/lib/kernel/ids";

interface CollectionRow {
  id: string;
  source_id: string;
  name: string;
  title: string | null;
  description: string | null;
  row_ids_json: string;
  author: string;
  created_at: string;
  updated_at: string;
}

function rowToCollection(row: CollectionRow): Collection {
  return CollectionSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    name: row.name,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    kind: "collection",
    rowIds: JSON.parse(row.row_ids_json),
    author: row.author,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export type CreateCollectionInput = Omit<Partial<Collection>, "kind"> & {
  sourceId: string;
  name: string;
};

export function createCollection(db: Database, input: CreateCollectionInput): Collection {
  const now = nowIso();
  const c = CollectionSchema.parse({
    kind: "collection",
    id: input.id ?? newId("col"),
    sourceId: input.sourceId,
    name: input.name,
    title: input.title,
    description: input.description,
    rowIds: input.rowIds ?? [],
    author: input.author ?? "user",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  });

  db.prepare(
    `INSERT INTO collections (id, source_id, name, title, description, row_ids_json, author, created_at, updated_at)
     VALUES (@id, @source_id, @name, @title, @description, @row_ids_json, @author, @created_at, @updated_at)`
  ).run({
    id: c.id,
    source_id: c.sourceId,
    name: c.name,
    title: c.title ?? null,
    description: c.description ?? null,
    row_ids_json: JSON.stringify(c.rowIds),
    author: c.author,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  });

  return c;
}

export function getCollection(db: Database, id: string): Collection | null {
  const row = db.prepare("SELECT * FROM collections WHERE id = ?").get(id) as CollectionRow | undefined;
  return row ? rowToCollection(row) : null;
}

export function getCollectionByName(db: Database, sourceId: string, name: string): Collection | null {
  const row = db
    .prepare("SELECT * FROM collections WHERE source_id = ? AND name = ?")
    .get(sourceId, name) as CollectionRow | undefined;
  return row ? rowToCollection(row) : null;
}

export function listCollections(db: Database, sourceId?: string): Collection[] {
  const rows = sourceId
    ? (db.prepare("SELECT * FROM collections WHERE source_id = ? ORDER BY updated_at DESC").all(sourceId) as CollectionRow[])
    : (db.prepare("SELECT * FROM collections ORDER BY updated_at DESC").all() as CollectionRow[]);
  return rows.map(rowToCollection);
}

export function updateCollection(
  db: Database,
  id: string,
  patch: Partial<Omit<Collection, "id" | "kind" | "sourceId" | "createdAt">>
): Collection {
  const current = getCollection(db, id);
  if (!current) throw new Error(`Collection not found: ${id}`);

  const updated = CollectionSchema.parse({
    ...current,
    ...patch,
    id: current.id,
    sourceId: current.sourceId,
    kind: "collection",
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  });

  db.prepare(
    `UPDATE collections SET
       name = @name,
       title = @title,
       description = @description,
       row_ids_json = @row_ids_json,
       author = @author,
       updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id: updated.id,
    name: updated.name,
    title: updated.title ?? null,
    description: updated.description ?? null,
    row_ids_json: JSON.stringify(updated.rowIds),
    author: updated.author,
    updated_at: updated.updatedAt,
  });

  return updated;
}

export function deleteCollection(db: Database, id: string): boolean {
  const r = db.prepare("DELETE FROM collections WHERE id = ?").run(id);
  return r.changes > 0;
}
