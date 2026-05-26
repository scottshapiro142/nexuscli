/**
 * Build the per-source tool registry the MCP server exposes.
 *
 * Two flavors of tool:
 *   1. Read tools generated from what Iris already produced —
 *      describe_source, list_rows, find_rows, query_<view>, render_<appspec>.
 *      Names come from the view's user-facing name, which is itself derived
 *      from Iris's domain language (e.g. "stale-accounts" → query_stale_accounts).
 *      That's where the "semantic, not generic" property in the B2 spec comes from.
 *   2. Mutation tools that mirror the kernel store API —
 *      create_view, create_collection, create_branch, create_snapshot, annotate_row.
 *
 * The registry is a pure data structure: each entry pairs an MCP-style
 * tool definition with the handler key the server uses to dispatch. The
 * server (lib/mcp/server.ts) walks this list once and binds each tool
 * onto an McpServer instance.
 */

import { z } from "zod";
import type { Database } from "better-sqlite3";
import { listViews, listSnapshots, listCollections } from "@/lib/kernel/store";
import type { SourceContext } from "./source-context";
import { FilterSchema, SortSchema } from "@/lib/spec/types";

// ---- Tool definition (handler-bound) ---------------------------------------

/**
 * One registered tool. `inputShape` is a Zod raw shape (one key per
 * argument) that the MCP SDK turns into JSON Schema for the client. `handler`
 * receives the parsed input and the source context, returns the result.
 *
 * Two arms via discriminator on `kind`:
 *   - "read"   — pure read, may use `ctx` only
 *   - "mutate" — writes to the store, gets `db` as well
 */
export type ToolEntry =
  | {
      kind: "read";
      name: string;
      title: string;
      description: string;
      inputShape: z.ZodRawShape;
      handlerKey: string;
    }
  | {
      kind: "mutate";
      name: string;
      title: string;
      description: string;
      inputShape: z.ZodRawShape;
      handlerKey: string;
    };

export function buildRegistry(ctx: SourceContext, db: Database): ToolEntry[] {
  const out: ToolEntry[] = [];

  // ---- Always-on read tools ------------------------------------------------

  out.push({
    kind: "read",
    name: "describe_source",
    title: ctx.source.subject ?? "Describe source",
    description: describeSourceDoc(ctx),
    inputShape: {},
    handlerKey: "describe_source",
  });

  out.push({
    kind: "read",
    name: "list_rows",
    title: "List raw rows",
    description:
      `Page through the master rows in original order. Each row comes back ` +
      `with a stable id usable in annotate_row / create_collection. ` +
      `Total rows: ${ctx.rows.length}. Columns: ${ctx.source.headers.join(", ")}.`,
    inputShape: {
      limit: z
        .number()
        .int()
        .positive()
        .max(500)
        .optional()
        .describe("Max rows to return (default 50, max 500)."),
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Skip this many rows from the start (default 0)."),
    },
    handlerKey: "list_rows",
  });

  out.push({
    kind: "read",
    name: "find_rows",
    title: "Ad-hoc filtered query",
    description:
      `Run an ad-hoc filter + sort against the master. Use this when no saved ` +
      `view matches what you need. Filters AND together. Available columns: ` +
      `${ctx.source.headers.join(", ")}.`,
    inputShape: {
      filters: z
        .array(FilterSchema)
        .min(1)
        .describe("Filter predicates, ANDed together."),
      sort: SortSchema.optional().describe("Optional sort applied after filtering."),
      limit: z.number().int().positive().max(500).optional().describe("Max rows (default 50)."),
      columns: z
        .array(z.string())
        .optional()
        .describe("Subset of columns to project. Defaults to all."),
    },
    handlerKey: "find_rows",
  });

  out.push({
    kind: "read",
    name: "list_derivations",
    title: "List derivations on this source",
    description:
      `List the derivations (views, collections, branches, snapshots, ` +
      `annotations) the user or Iris has saved against this source. ` +
      `Optionally filter by kind.`,
    inputShape: {
      kind: z
        .enum(["view", "collection", "branch", "snapshot", "annotation"])
        .optional(),
    },
    handlerKey: "list_derivations",
  });

  // ---- Per-view: query_<viewname> -----------------------------------------

  for (const v of listViews(db, ctx.source.id)) {
    const slug = slugify(v.name);
    if (!slug) continue;
    out.push({
      kind: "read",
      name: `query_${slug}`,
      title: v.title ?? v.name,
      description:
        (v.description ?? `Run the saved view '${v.title ?? v.name}'.`) +
        ` Filters: ${v.filters.length}.` +
        (v.sort ? ` Sort: ${v.sort.field} ${v.sort.direction}.` : "") +
        (v.columns.length > 0 ? ` Columns: ${v.columns.join(", ")}.` : " All columns."),
      inputShape: {
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Override the view's stored limit."),
      },
      handlerKey: `view:${v.id}`,
    });
  }

  // ---- Per-collection: read_<colname> -------------------------------------

  for (const c of listCollections(db, ctx.source.id)) {
    const slug = slugify(c.name);
    if (!slug) continue;
    out.push({
      kind: "read",
      name: `read_${slug}`,
      title: c.title ?? c.name,
      description:
        (c.description ?? `Read the rows in the curated collection '${c.title ?? c.name}'.`) +
        ` ${c.rowIds.length} row ids saved.`,
      inputShape: {},
      handlerKey: `collection:${c.id}`,
    });
  }

  // ---- Per-appspec snapshot: render_<name> --------------------------------

  for (const s of listSnapshots(db, ctx.source.id)) {
    if (s.flavor !== "appspec") continue;
    const slug = slugify(s.name);
    if (!slug) continue;
    out.push({
      kind: "read",
      name: `render_${slug}`,
      title: s.title ?? s.name,
      description:
        `Return the saved AppSpec '${s.title ?? s.name}' (archetype: ` +
        `${s.appSpec?.archetype}). The client renders or summarizes the spec.`,
      inputShape: {},
      handlerKey: `snapshot:${s.id}`,
    });
  }

  // ---- Mutation tools (spec: create_view / collection / branch / snapshot / annotate_row)

  out.push({
    kind: "mutate",
    name: "create_view",
    title: "Save a View",
    description:
      `Save a filtered + sorted projection as a re-runnable View. ` +
      `Choose a short, kebab-case name; the View becomes callable as ` +
      `query_<name> on the next server start.`,
    inputShape: {
      name: z.string().min(1).max(80).describe("Short name (kebab-case). Becomes the tool slug."),
      title: z.string().optional().describe("Pretty display title."),
      description: z.string().optional(),
      filters: z.array(FilterSchema).default([]),
      sort: SortSchema.optional(),
      columns: z
        .array(z.string())
        .optional()
        .describe("Subset of columns to project. Default: all."),
      limit: z.number().int().positive().max(10_000).optional(),
    },
    handlerKey: "create_view",
  });

  out.push({
    kind: "mutate",
    name: "create_collection",
    title: "Save a Collection of row ids",
    description:
      `Use this to save a SUBSET of rows — a curated, ordered list of row ids. ` +
      `For "group these by X", "the rows I want to come back to", or any "make ` +
      `a list of …" request, this is the right tool. Not for what-if edits — ` +
      `use create_branch when you want to change cell values without touching ` +
      `the master. Get ids from list_rows / find_rows / query_*.`,
    inputShape: {
      name: z.string().min(1).max(80),
      title: z.string().optional(),
      description: z.string().optional(),
      row_ids: z
        .array(z.string())
        .min(1)
        .describe("Stable row ids (from list_rows etc.) in the order they should display."),
    },
    handlerKey: "create_collection",
  });

  out.push({
    kind: "mutate",
    name: "create_branch",
    title: "Save a Branch overlay",
    description:
      `Use this for WHAT-IF cell edits — overlay new values on specific rows ` +
      `without mutating the master. The overlay is applied on read. Example: ` +
      `"what if these 3 deals all closed at 80% of their amount?" Not for ` +
      `subsetting rows — use create_collection when you just want a curated ` +
      `list. Requires at least one {rowId, column, value} edit.`,
    inputShape: {
      name: z.string().min(1).max(80),
      title: z.string().optional(),
      description: z.string().optional(),
      base_snapshot_id: z
        .string()
        .optional()
        .describe("Optional snapshot id to fork from."),
      edits: z
        .array(
          z.object({
            rowId: z.string().describe("Stable row id from list_rows etc."),
            column: z.string().describe("Column name. Must exist on the master."),
            value: z.string().nullable().describe("New value. null clears the cell."),
          })
        )
        .min(1),
    },
    handlerKey: "create_branch",
  });

  out.push({
    kind: "mutate",
    name: "create_snapshot",
    title: "Save a row Snapshot of the master",
    description:
      `Take a point-in-time copy of the master rows. Use this before making ` +
      `changes upstream or before forking a Branch. Snapshots are content-` +
      `hashed and immutable.`,
    inputShape: {
      name: z.string().min(1).max(80),
      title: z.string().optional(),
      description: z.string().optional(),
    },
    handlerKey: "create_snapshot",
  });

  out.push({
    kind: "mutate",
    name: "annotate_row",
    title: "Tag, note, or status a row",
    description:
      `Attach an Annotation to one row (tag, note, or status). Iris uses this ` +
      `for row-level Tells; users use it for triage marks. One annotation per ` +
      `(row, key) — re-calling with the same key updates the value.`,
    inputShape: {
      row_id: z.string().describe("Stable row id from list_rows etc."),
      kind: z.enum(["tag", "note", "status", "tell"]).default("note"),
      key: z.string().min(1).describe("Stable key — e.g. 'status', 'priority'."),
      value: z.string().describe("The annotation's value."),
      name: z
        .string()
        .optional()
        .describe("Optional display name. Auto-generated if omitted."),
    },
    handlerKey: "annotate_row",
  });

  return out;
}

// ---- helpers ---------------------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function describeSourceDoc(ctx: SourceContext): string {
  const { source } = ctx;
  const subj = source.subject ? ` ${source.subject}` : "";
  const desc = source.description ? ` ${source.description}` : "";
  return (
    `Return metadata for the connected master: subject, description, headers, ` +
    `row count, and a small sample of rows.` +
    subj +
    desc +
    ` ${source.rowCount} rows. Columns: ${source.headers.join(", ")}.`
  );
}
