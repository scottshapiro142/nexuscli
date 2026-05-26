/**
 * Glue between Iris's outputs and the derivation store.
 *
 * When the CLI's `nexus connect` finishes reading a master, it has:
 *   - a StructuralSummary (Iris's read)
 *   - a Tell[] (Iris's noticed patterns)
 *   - an AppSpec[] (Iris's suggested apps)
 *
 * We persist those into the local store so:
 *   - Tells live as Annotations (kind "tell")
 *   - Each suggested AppSpec becomes a View (filters + sort + columns extracted
 *     from the spec) — so `nexus query <view-name>` runs the same predicate.
 *   - The full chosen AppSpec is also kept verbatim as a `snapshot` of flavor
 *     `appspec` for round-tripping back into the renderer.
 *
 * This file is what makes "your derivations accumulate" real — every connect
 * is a deposit into the local store.
 */

import type { Database } from "better-sqlite3";
import type { ParsedSheet } from "@/lib/sheets/fetch-csv";
import type { ColumnSummary } from "@/lib/sheets/infer-columns";
import type { StructuralSummary } from "@/lib/sheets/summarize";
import type { Tell } from "@/lib/tells/types";
import type { AppSpec, Filter, Sort } from "@/lib/spec/types";
import {
  upsertSource,
  createView,
  createAnnotation,
  createSnapshot,
  getViewByName,
  getSnapshotByName,
} from "@/lib/kernel/store";
import type { Source, View } from "@/lib/kernel/types";
import { slugify, nowIso } from "@/lib/kernel/ids";

export interface ConnectResult {
  source: Source;
  views: View[];
  annotationsCreated: number;
  snapshotCreated: boolean;
}

export interface PersistArgs {
  db: Database;
  source: Source;
  sheet: ParsedSheet;
  columns: ColumnSummary[];
  summary: StructuralSummary;
  tells: Tell[];
  suggests: AppSpec[];
}

/**
 * Persist Iris's full output for a freshly connected master. Idempotent: skips
 * views/snapshots that already exist by name (re-connect is safe).
 */
export function persistIrisOutput(args: PersistArgs): ConnectResult {
  const { db, source, summary, tells, suggests } = args;

  upsertSource(db, source);

  const views: View[] = [];
  for (let i = 0; i < suggests.length; i++) {
    const spec = suggests[i];
    const name = slugify(spec.title) || `suggest-${i + 1}`;
    if (getViewByName(db, source.id, name)) continue;

    const view = createView(db, {
      sourceId: source.id,
      name,
      title: spec.title,
      description: `Iris suggest: ${spec.archetype}`,
      filters: extractFilters(spec),
      sort: extractSort(spec),
      columns: extractColumns(spec),
      author: "iris",
    });
    views.push(view);

    const snapName = `${name}.spec`;
    if (!getSnapshotByName(db, source.id, snapName)) {
      createSnapshot(db, {
        sourceId: source.id,
        name: snapName,
        title: `${spec.title} (AppSpec)`,
        description: "Iris-authored AppSpec snapshot",
        flavor: "appspec",
        appSpec: spec,
        author: "iris",
      });
    }
  }

  let annotationsCreated = 0;
  for (let i = 0; i < tells.length; i++) {
    const tell = tells[i];
    const key = `iris.tell.${i + 1}`;
    const name = `tell-${i + 1}-${slugify(tell.kind)}`;
    try {
      createAnnotation(db, {
        sourceId: source.id,
        name,
        title: tell.phrase.slice(0, 80),
        annotationKind: "tell",
        key,
        value: JSON.stringify({ kind: tell.kind, phrase: tell.phrase, predicate: tell.predicate ?? [] }),
        author: "iris",
      });
      annotationsCreated++;
    } catch {
      // Name uniqueness collision on re-connect; skip silently.
    }
  }

  let snapshotCreated = false;
  const summaryName = "iris.read";
  if (!getSnapshotByName(db, source.id, summaryName)) {
    try {
      createAnnotation(db, {
        sourceId: source.id,
        name: "iris.summary",
        title: summary.subject,
        annotationKind: "note",
        key: "iris.summary",
        value: JSON.stringify(summary),
        author: "iris",
      });
      snapshotCreated = true;
    } catch {
      // already exists
    }
  }

  return {
    source: { ...source, lastReadAt: nowIso() },
    views,
    annotationsCreated,
    snapshotCreated,
  };
}

// ---- AppSpec → View extraction --------------------------------------------

function extractFilters(spec: AppSpec): Filter[] {
  switch (spec.archetype) {
    case "dashboard":
    case "list":
    case "tracker":
    case "table":
      return spec.filters ?? [];
    case "triage":
      return spec.queue_predicate;
  }
}

function extractSort(spec: AppSpec): Sort | undefined {
  switch (spec.archetype) {
    case "list":
    case "table":
      return spec.sort;
    case "triage":
      return spec.priority_sort;
    case "dashboard":
    case "tracker":
      return undefined;
  }
}

function extractColumns(spec: AppSpec): string[] {
  switch (spec.archetype) {
    case "table":
      return spec.columns;
    case "list": {
      const cols: string[] = [spec.primary_field];
      if (spec.secondary_field) cols.push(spec.secondary_field);
      if (spec.badge_field) cols.push(spec.badge_field);
      if (spec.meta_fields) cols.push(...spec.meta_fields);
      return Array.from(new Set(cols));
    }
    case "triage":
      return Array.from(new Set([spec.card_primary_field, ...spec.card_summary_fields]));
    case "dashboard":
    case "tracker":
      return [];
  }
}
