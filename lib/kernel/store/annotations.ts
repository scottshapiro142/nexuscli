/**
 * Annotation repository.
 *
 * Uniqueness: one annotation per (sourceId, rowId, key). SQLite treats NULL as
 * distinct in UNIQUE constraints, so sheet-level annotations (rowId = null)
 * with the same key are allowed multiple times — adjust if that bites us.
 */

import type { Database } from "better-sqlite3";
import { Annotation, AnnotationSchema } from "@/lib/kernel/types";
import { newId, nowIso } from "@/lib/kernel/ids";

interface AnnotationRow {
  id: string;
  source_id: string;
  name: string;
  title: string | null;
  description: string | null;
  annotation_kind: string;
  row_id: string | null;
  key: string;
  value: string;
  author: string;
  created_at: string;
  updated_at: string;
}

function rowToAnnotation(row: AnnotationRow): Annotation {
  return AnnotationSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    name: row.name,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    kind: "annotation",
    annotationKind: row.annotation_kind,
    rowId: row.row_id ?? undefined,
    key: row.key,
    value: row.value,
    author: row.author,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export type CreateAnnotationInput = Omit<Partial<Annotation>, "kind"> & {
  sourceId: string;
  name: string;
  annotationKind: Annotation["annotationKind"];
  key: string;
  value: string;
};

export function createAnnotation(db: Database, input: CreateAnnotationInput): Annotation {
  const now = nowIso();
  const a = AnnotationSchema.parse({
    kind: "annotation",
    id: input.id ?? newId("ann"),
    sourceId: input.sourceId,
    name: input.name,
    title: input.title,
    description: input.description,
    annotationKind: input.annotationKind,
    rowId: input.rowId,
    key: input.key,
    value: input.value,
    author: input.author ?? "user",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  });

  db.prepare(
    `INSERT INTO annotations (id, source_id, name, title, description, annotation_kind, row_id, key, value, author, created_at, updated_at)
     VALUES (@id, @source_id, @name, @title, @description, @annotation_kind, @row_id, @key, @value, @author, @created_at, @updated_at)`
  ).run({
    id: a.id,
    source_id: a.sourceId,
    name: a.name,
    title: a.title ?? null,
    description: a.description ?? null,
    annotation_kind: a.annotationKind,
    row_id: a.rowId ?? null,
    key: a.key,
    value: a.value,
    author: a.author,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  });

  return a;
}

export function getAnnotation(db: Database, id: string): Annotation | null {
  const row = db.prepare("SELECT * FROM annotations WHERE id = ?").get(id) as AnnotationRow | undefined;
  return row ? rowToAnnotation(row) : null;
}

export function getAnnotationByName(db: Database, sourceId: string, name: string): Annotation | null {
  const row = db
    .prepare("SELECT * FROM annotations WHERE source_id = ? AND name = ?")
    .get(sourceId, name) as AnnotationRow | undefined;
  return row ? rowToAnnotation(row) : null;
}

export function listAnnotations(db: Database, sourceId?: string): Annotation[] {
  const rows = sourceId
    ? (db.prepare("SELECT * FROM annotations WHERE source_id = ? ORDER BY updated_at DESC").all(sourceId) as AnnotationRow[])
    : (db.prepare("SELECT * FROM annotations ORDER BY updated_at DESC").all() as AnnotationRow[]);
  return rows.map(rowToAnnotation);
}

export function listAnnotationsForRow(db: Database, sourceId: string, rowId: string): Annotation[] {
  const rows = db
    .prepare("SELECT * FROM annotations WHERE source_id = ? AND row_id = ? ORDER BY updated_at DESC")
    .all(sourceId, rowId) as AnnotationRow[];
  return rows.map(rowToAnnotation);
}

export function updateAnnotation(
  db: Database,
  id: string,
  patch: Partial<Omit<Annotation, "id" | "kind" | "sourceId" | "createdAt">>
): Annotation {
  const current = getAnnotation(db, id);
  if (!current) throw new Error(`Annotation not found: ${id}`);

  const updated = AnnotationSchema.parse({
    ...current,
    ...patch,
    id: current.id,
    sourceId: current.sourceId,
    kind: "annotation",
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  });

  db.prepare(
    `UPDATE annotations SET
       name = @name,
       title = @title,
       description = @description,
       annotation_kind = @annotation_kind,
       row_id = @row_id,
       key = @key,
       value = @value,
       author = @author,
       updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id: updated.id,
    name: updated.name,
    title: updated.title ?? null,
    description: updated.description ?? null,
    annotation_kind: updated.annotationKind,
    row_id: updated.rowId ?? null,
    key: updated.key,
    value: updated.value,
    author: updated.author,
    updated_at: updated.updatedAt,
  });

  return updated;
}

export function deleteAnnotation(db: Database, id: string): boolean {
  const r = db.prepare("DELETE FROM annotations WHERE id = ?").run(id);
  return r.changes > 0;
}
