/**
 * Tool execution for the MCP server.
 *
 * One function per handlerKey emitted by `lib/mcp/registry.ts`. Each returns
 * either a JSON-serializable value (the server wraps it as MCP `content`) or
 * throws — the server turns thrown errors into structured tool errors.
 *
 * Naming convention for the dynamic handler keys:
 *   view:<id>       → run the saved view, return matching rows
 *   collection:<id> → return rows in the saved collection, in order
 *   snapshot:<id>   → return the AppSpec JSON of an appspec snapshot
 *
 * Mutation handlers create derivations in the SQLite store via the existing
 * kernel/store/* repositories; we don't reach past those.
 */

import type { Database } from "better-sqlite3";
import {
  createView,
  createCollection,
  createBranch,
  createSnapshot,
  createAnnotation,
  getView,
  getCollection,
  getSnapshot,
  listAll,
} from "@/lib/kernel/store";
import { applyFilters } from "@/lib/render/filter";
import { applySort } from "@/lib/render/sort";
import { hashRow } from "@/lib/kernel/hash";
import type { SourceContext } from "./source-context";
import type { Filter, Sort } from "@/lib/spec/types";
import type { Annotation } from "@/lib/kernel/types";

const DEFAULT_LIMIT = 50;

// ---- Read tools ------------------------------------------------------------

export function handleDescribeSource(ctx: SourceContext, db: Database) {
  const sample = ctx.rows.slice(0, 5).map((r, i) => ({
    rowId: ctx.rowIds[i],
    ...r,
  }));

  const tellAnns = listAll(db, { kind: "annotation", sourceId: ctx.source.id })
    .filter((a): a is Annotation => a.kind === "annotation" && a.annotationKind === "tell")
    .map((a) => ({ key: a.key, value: a.value }));

  return {
    source: {
      id: ctx.source.id,
      kind: ctx.source.kind,
      path: ctx.source.path,
      table: ctx.source.table,
      subject: ctx.source.subject,
      description: ctx.source.description,
      rowCount: ctx.source.rowCount,
      headers: ctx.source.headers,
      connectedAt: ctx.source.connectedAt,
      lastReadAt: ctx.source.lastReadAt,
    },
    sampleRows: sample,
    tells: tellAnns,
  };
}

export function handleListRows(
  ctx: SourceContext,
  _db: Database,
  args: { limit?: number; offset?: number }
) {
  const limit = clampLimit(args.limit);
  const offset = args.offset ?? 0;
  const slice = ctx.rows.slice(offset, offset + limit);
  const out = slice.map((r, i) => ({ rowId: ctx.rowIds[offset + i], ...r }));
  return {
    total: ctx.rows.length,
    offset,
    limit,
    rows: out,
  };
}

export function handleFindRows(
  ctx: SourceContext,
  _db: Database,
  args: { filters: Filter[]; sort?: Sort; limit?: number; columns?: string[] }
) {
  const filtered = applyFilters(ctx.rows, args.filters);
  const sorted = applySort(filtered, args.sort);
  const limit = clampLimit(args.limit);
  const limited = sorted.slice(0, limit);
  const cols = args.columns?.length ? args.columns : ctx.source.headers;
  const out = limited.map((r) => {
    const rowId = hashRow(ctx.source.headers, r);
    const projected: Record<string, string> = { rowId };
    for (const c of cols) projected[c] = r[c] ?? "";
    return projected;
  });
  return {
    matched: filtered.length,
    returned: out.length,
    rows: out,
  };
}

export function handleListDerivations(
  ctx: SourceContext,
  db: Database,
  args: { kind?: "view" | "collection" | "branch" | "snapshot" | "annotation" }
) {
  const items = listAll(db, { kind: args.kind, sourceId: ctx.source.id });
  return {
    sourceId: ctx.source.id,
    count: items.length,
    items: items.map((d) => ({
      id: d.id,
      kind: d.kind,
      name: d.name,
      title: d.title,
      description: d.description,
      updatedAt: d.updatedAt,
    })),
  };
}

export function handleRunView(
  ctx: SourceContext,
  db: Database,
  viewId: string,
  args: { limit?: number }
) {
  const v = getView(db, viewId);
  if (!v) throw new Error(`View ${viewId} no longer exists.`);
  const filtered = applyFilters(ctx.rows, v.filters);
  const sorted = applySort(filtered, v.sort);
  const limit = args.limit ?? v.limit;
  const limited = limit ? sorted.slice(0, limit) : sorted;
  const cols = v.columns.length > 0 ? v.columns : ctx.source.headers;
  const out = limited.map((r) => {
    const rowId = hashRow(ctx.source.headers, r);
    const projected: Record<string, string> = { rowId };
    for (const c of cols) projected[c] = r[c] ?? "";
    return projected;
  });
  return {
    view: { id: v.id, name: v.name, title: v.title },
    matched: filtered.length,
    returned: out.length,
    rows: out,
  };
}

export function handleRunCollection(ctx: SourceContext, db: Database, collectionId: string) {
  const c = getCollection(db, collectionId);
  if (!c) throw new Error(`Collection ${collectionId} no longer exists.`);
  const out: Record<string, string>[] = [];
  const missing: string[] = [];
  for (const id of c.rowIds) {
    const row = ctx.rowsById.get(id);
    if (!row) {
      missing.push(id);
      continue;
    }
    out.push({ rowId: id, ...row });
  }
  return {
    collection: { id: c.id, name: c.name, title: c.title },
    rows: out,
    missingIds: missing,
  };
}

export function handleRunSnapshot(_ctx: SourceContext, db: Database, snapshotId: string) {
  const s = getSnapshot(db, snapshotId);
  if (!s) throw new Error(`Snapshot ${snapshotId} no longer exists.`);
  if (s.flavor !== "appspec") {
    throw new Error(
      `Snapshot ${snapshotId} is a 'rows' snapshot, not an appspec; use list_derivations for row snapshots.`
    );
  }
  return {
    snapshot: { id: s.id, name: s.name, title: s.title, flavor: s.flavor },
    appSpec: s.appSpec,
  };
}

// ---- Mutation tools --------------------------------------------------------

export function handleCreateView(
  ctx: SourceContext,
  db: Database,
  args: {
    name: string;
    title?: string;
    description?: string;
    filters?: Filter[];
    sort?: Sort;
    columns?: string[];
    limit?: number;
  }
) {
  validateColumns(ctx, args.columns);
  if (args.filters) for (const f of args.filters) requireColumn(ctx, f.field);
  if (args.sort) requireColumn(ctx, args.sort.field);

  const v = createView(db, {
    sourceId: ctx.source.id,
    name: args.name,
    title: args.title,
    description: args.description,
    filters: args.filters ?? [],
    sort: args.sort,
    columns: args.columns ?? [],
    limit: args.limit,
    author: "iris",
  });
  return {
    created: "view",
    id: v.id,
    name: v.name,
    nextStepHint: `Run query_${slugify(v.name)} to fetch the matching rows (after the next server restart).`,
  };
}

export function handleCreateCollection(
  ctx: SourceContext,
  db: Database,
  args: { name: string; title?: string; description?: string; row_ids: string[] }
) {
  const unknown = args.row_ids.filter((id) => !ctx.rowsById.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `${unknown.length} row ids don't exist on the current master. Use list_rows / find_rows to refresh ids. First missing: ${unknown.slice(0, 3).join(", ")}`
    );
  }
  const c = createCollection(db, {
    sourceId: ctx.source.id,
    name: args.name,
    title: args.title,
    description: args.description,
    rowIds: args.row_ids,
    author: "iris",
  });
  return { created: "collection", id: c.id, name: c.name, count: c.rowIds.length };
}

export function handleCreateBranch(
  ctx: SourceContext,
  db: Database,
  args: {
    name: string;
    title?: string;
    description?: string;
    base_snapshot_id?: string;
    edits: { rowId: string; column: string; value: string | null }[];
  }
) {
  for (const e of args.edits) {
    if (!ctx.rowsById.has(e.rowId)) {
      throw new Error(`Edit references unknown rowId ${e.rowId}.`);
    }
    requireColumn(ctx, e.column);
  }
  const b = createBranch(db, {
    sourceId: ctx.source.id,
    name: args.name,
    title: args.title,
    description: args.description,
    baseSnapshotId: args.base_snapshot_id,
    edits: args.edits,
    author: "iris",
  });
  return { created: "branch", id: b.id, name: b.name, edits: b.edits.length };
}

export function handleCreateSnapshot(
  ctx: SourceContext,
  db: Database,
  args: { name: string; title?: string; description?: string }
) {
  const s = createSnapshot(db, {
    sourceId: ctx.source.id,
    name: args.name,
    title: args.title,
    description: args.description,
    flavor: "rows",
    headers: ctx.source.headers,
    rows: ctx.rows,
    author: "iris",
  });
  return {
    created: "snapshot",
    id: s.id,
    name: s.name,
    rowCount: s.rowCount,
    contentHash: s.contentHash,
  };
}

export function handleAnnotateRow(
  ctx: SourceContext,
  db: Database,
  args: {
    row_id: string;
    kind: "tag" | "note" | "status" | "tell";
    key: string;
    value: string;
    name?: string;
  }
) {
  if (!ctx.rowsById.has(args.row_id)) {
    throw new Error(`Row ${args.row_id} doesn't exist on the current master.`);
  }
  const a = createAnnotation(db, {
    sourceId: ctx.source.id,
    name: args.name ?? `${args.kind}-${args.key}-${args.row_id.slice(0, 8)}`,
    annotationKind: args.kind,
    rowId: args.row_id,
    key: args.key,
    value: args.value,
    author: "iris",
  });
  return { created: "annotation", id: a.id, key: a.key, value: a.value };
}

// ---- helpers ---------------------------------------------------------------

function clampLimit(limit: number | undefined): number {
  if (!limit || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(limit, 500);
}

function requireColumn(ctx: SourceContext, col: string): void {
  if (!ctx.source.headers.includes(col)) {
    throw new Error(
      `Unknown column '${col}'. Available: ${ctx.source.headers.join(", ")}`
    );
  }
}

function validateColumns(ctx: SourceContext, cols?: string[]): void {
  if (!cols) return;
  for (const c of cols) requireColumn(ctx, c);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
