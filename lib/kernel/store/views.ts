/**
 * View repository.
 */

import type { Database } from "better-sqlite3";
import { View, ViewSchema } from "@/lib/kernel/types";
import { newId, nowIso } from "@/lib/kernel/ids";

interface ViewRow {
  id: string;
  source_id: string;
  name: string;
  title: string | null;
  description: string | null;
  filters_json: string;
  sort_json: string | null;
  columns_json: string;
  lim: number | null;
  author: string;
  created_at: string;
  updated_at: string;
}

function rowToView(row: ViewRow): View {
  return ViewSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    name: row.name,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    kind: "view",
    filters: JSON.parse(row.filters_json),
    sort: row.sort_json ? JSON.parse(row.sort_json) : undefined,
    columns: JSON.parse(row.columns_json),
    limit: row.lim ?? undefined,
    author: row.author,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export type CreateViewInput = Omit<Partial<View>, "kind"> & {
  sourceId: string;
  name: string;
};

export function createView(db: Database, input: CreateViewInput): View {
  const now = nowIso();
  const view = ViewSchema.parse({
    kind: "view",
    id: input.id ?? newId("view"),
    sourceId: input.sourceId,
    name: input.name,
    title: input.title,
    description: input.description,
    filters: input.filters ?? [],
    sort: input.sort,
    columns: input.columns ?? [],
    limit: input.limit,
    author: input.author ?? "user",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  });

  db.prepare(
    `INSERT INTO views (id, source_id, name, title, description, filters_json, sort_json, columns_json, lim, author, created_at, updated_at)
     VALUES (@id, @source_id, @name, @title, @description, @filters_json, @sort_json, @columns_json, @lim, @author, @created_at, @updated_at)`
  ).run({
    id: view.id,
    source_id: view.sourceId,
    name: view.name,
    title: view.title ?? null,
    description: view.description ?? null,
    filters_json: JSON.stringify(view.filters),
    sort_json: view.sort ? JSON.stringify(view.sort) : null,
    columns_json: JSON.stringify(view.columns),
    lim: view.limit ?? null,
    author: view.author,
    created_at: view.createdAt,
    updated_at: view.updatedAt,
  });

  return view;
}

export function getView(db: Database, id: string): View | null {
  const row = db.prepare("SELECT * FROM views WHERE id = ?").get(id) as ViewRow | undefined;
  return row ? rowToView(row) : null;
}

export function getViewByName(db: Database, sourceId: string, name: string): View | null {
  const row = db
    .prepare("SELECT * FROM views WHERE source_id = ? AND name = ?")
    .get(sourceId, name) as ViewRow | undefined;
  return row ? rowToView(row) : null;
}

export function listViews(db: Database, sourceId?: string): View[] {
  const rows = sourceId
    ? (db.prepare("SELECT * FROM views WHERE source_id = ? ORDER BY updated_at DESC").all(sourceId) as ViewRow[])
    : (db.prepare("SELECT * FROM views ORDER BY updated_at DESC").all() as ViewRow[]);
  return rows.map(rowToView);
}

export function updateView(db: Database, id: string, patch: Partial<Omit<View, "id" | "kind" | "sourceId" | "createdAt">>): View {
  const current = getView(db, id);
  if (!current) throw new Error(`View not found: ${id}`);

  const updated = ViewSchema.parse({
    ...current,
    ...patch,
    id: current.id,
    sourceId: current.sourceId,
    kind: "view",
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  });

  db.prepare(
    `UPDATE views SET
       name = @name,
       title = @title,
       description = @description,
       filters_json = @filters_json,
       sort_json = @sort_json,
       columns_json = @columns_json,
       lim = @lim,
       author = @author,
       updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id: updated.id,
    name: updated.name,
    title: updated.title ?? null,
    description: updated.description ?? null,
    filters_json: JSON.stringify(updated.filters),
    sort_json: updated.sort ? JSON.stringify(updated.sort) : null,
    columns_json: JSON.stringify(updated.columns),
    lim: updated.limit ?? null,
    author: updated.author,
    updated_at: updated.updatedAt,
  });

  return updated;
}

export function deleteView(db: Database, id: string): boolean {
  const r = db.prepare("DELETE FROM views WHERE id = ?").run(id);
  return r.changes > 0;
}
