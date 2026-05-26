/**
 * Nexus kernel: derivation primitives.
 *
 * Five Zod-typed entities persisted in the local SQLite store. The master sheet
 * (the source) is treated as read-only; everything a user creates on top of it
 * lives here as a derivation.
 *
 *   View        — a saved filter + sort definition
 *   Collection  — a curated set of row IDs
 *   Branch      — an overlay of hypothetical cell changes on top of the master
 *   Snapshot    — a timestamped read-only copy of the master (or an AppSpec snapshot)
 *   Annotation  — a row-level tag / note / status
 *
 * These types are the contract the SQLite store, the CLI, and the MCP server
 * (B2) all share. Keep them strict.
 */

import { z } from "zod";
import { FilterSchema, SortSchema, AppSpecSchema } from "@/lib/spec/types";

// ---- Source / master --------------------------------------------------------

/**
 * The connected master. One per ~/.nexus/<sheet-hash>/ store. Sources are
 * read-only from the kernel's perspective; we record where they came from and
 * a content hash so we can detect that the master has changed under us.
 */
export const SourceKindSchema = z.enum(["csv", "xlsx", "sqlite", "google_sheets"]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceSchema = z.object({
  id: z.string(),                       // sheet-hash, also the dir name
  kind: SourceKindSchema,
  path: z.string(),                     // file path or URL
  table: z.string().optional(),         // for sqlite sources, which table
  headers: z.array(z.string()),
  rowCount: z.number().int().nonnegative(),
  contentHash: z.string(),              // sha256 of normalized content
  connectedAt: z.string(),              // ISO-8601
  lastReadAt: z.string(),               // ISO-8601
  subject: z.string().optional(),       // from Iris's structural read
  description: z.string().optional(),   // from Iris's structural read
});
export type Source = z.infer<typeof SourceSchema>;

// ---- Base envelope ---------------------------------------------------------

const BaseDerivation = {
  id: z.string(),                       // ulid / nanoid
  sourceId: z.string(),                 // the master this derivation belongs to
  name: z.string().min(1),              // slug-friendly user-facing name
  title: z.string().optional(),         // pretty display title
  description: z.string().optional(),
  createdAt: z.string(),                // ISO-8601
  updatedAt: z.string(),                // ISO-8601
  /** Who/what produced this derivation. "iris" for agent-authored, "user" for hand-made, "cli" for CLI-built. */
  author: z.enum(["iris", "user", "cli"]).default("user"),
} as const;

// ---- View ------------------------------------------------------------------

/**
 * A saved Filter[] + Sort + projection. Re-runnable against the current rows
 * to produce a deterministic result set. Views are how Iris's Suggests are
 * persisted, and how `nexus query <view-name>` finds something to evaluate.
 */
export const ViewSchema = z.object({
  ...BaseDerivation,
  kind: z.literal("view"),
  filters: z.array(FilterSchema).default([]),
  sort: SortSchema.optional(),
  /** Subset of columns to project. Empty = all columns. */
  columns: z.array(z.string()).default([]),
  limit: z.number().int().positive().max(10_000).optional(),
});
export type View = z.infer<typeof ViewSchema>;

// ---- Collection ------------------------------------------------------------

/**
 * A curated set of row IDs. Order is preserved (think: a hand-picked playlist).
 * Row IDs are stable references issued by the kernel when the master is read
 * (see store/rows.ts).
 */
export const CollectionSchema = z.object({
  ...BaseDerivation,
  kind: z.literal("collection"),
  rowIds: z.array(z.string()).default([]),
});
export type Collection = z.infer<typeof CollectionSchema>;

// ---- Branch ----------------------------------------------------------------

/**
 * An overlay of hypothetical cell changes on top of the master. Branches do
 * not mutate the master; rendering a branch applies the overlay on read.
 *
 * Each edit is keyed by (rowId, column). A null `value` means "clear this cell".
 */
export const BranchEditSchema = z.object({
  rowId: z.string(),
  column: z.string(),
  value: z.string().nullable(),
});
export type BranchEdit = z.infer<typeof BranchEditSchema>;

export const BranchSchema = z.object({
  ...BaseDerivation,
  kind: z.literal("branch"),
  /** Snapshot id this branch was forked from, if any. */
  baseSnapshotId: z.string().optional(),
  edits: z.array(BranchEditSchema).default([]),
});
export type Branch = z.infer<typeof BranchSchema>;

// ---- Snapshot --------------------------------------------------------------

/**
 * A timestamped, read-only copy. Two flavors:
 *   - "rows": a full materialized copy of the master's rows at a point in time
 *     (kept for diffing between snapshots in v0.3+)
 *   - "appspec": a saved AppSpec — the "an app Iris built" artifact
 */
export const SnapshotSchema = z.object({
  ...BaseDerivation,
  kind: z.literal("snapshot"),
  flavor: z.enum(["rows", "appspec"]),
  /** For flavor="rows" — sha256 of the captured rows. For "appspec" — sha256 of spec JSON. */
  contentHash: z.string(),
  /** For flavor="appspec" — the AppSpec itself. */
  appSpec: AppSpecSchema.optional(),
  /** For flavor="rows" — count of rows captured. Cell data lives in snapshot_rows table. */
  rowCount: z.number().int().nonnegative().optional(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

// ---- Annotation ------------------------------------------------------------

/**
 * A row-level tag, note, or status. Used by Iris to persist Tells that reference
 * particular rows, and by users to mark things up without touching the master.
 *
 * One annotation per (sourceId, rowId, key). If you want multiple distinct
 * values for the same key on the same row, use distinct keys.
 */
export const AnnotationKindSchema = z.enum(["tag", "note", "status", "tell"]);
export type AnnotationKind = z.infer<typeof AnnotationKindSchema>;

export const AnnotationSchema = z.object({
  ...BaseDerivation,
  kind: z.literal("annotation"),
  annotationKind: AnnotationKindSchema,
  rowId: z.string().optional(),         // null = sheet-level annotation
  key: z.string(),                      // e.g. "iris.tell", "status", "tag"
  value: z.string(),
});
export type Annotation = z.infer<typeof AnnotationSchema>;

// ---- Union -----------------------------------------------------------------

export const DerivationSchema = z.discriminatedUnion("kind", [
  ViewSchema,
  CollectionSchema,
  BranchSchema,
  SnapshotSchema,
  AnnotationSchema,
]);
export type Derivation = z.infer<typeof DerivationSchema>;
export type DerivationKind = Derivation["kind"];

export const DERIVATION_KINDS = ["view", "collection", "branch", "snapshot", "annotation"] as const;
