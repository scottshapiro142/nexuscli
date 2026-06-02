/**
 * `nexus query <view-name>` — re-run a saved View against the current master
 * rows, print the result as a table.
 *
 * We use the meta.json copy of the master as the source of truth for "current
 * rows" so the CLI works without re-fetching CSV/XLSX/SQLite. (B2 will switch
 * to live re-reads when MCP needs them.)
 *
 * If a View has no sort, we still print in original row order. If --limit is
 * passed it overrides the View's stored limit.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { openStore, closeStore, getViewByName, getSnapshotByName, getSnapshotRows } from "@/lib/kernel/store";
import { applyFilters } from "@/lib/render/filter";
import { applySort } from "@/lib/render/sort";
import { parseCsv } from "@/lib/sheets/fetch-csv";
import { readSqliteAsSheet } from "@/lib/sheets/fetch-sqlite";
import * as XLSX from "xlsx";
import { metaPath } from "@/lib/kernel/paths";
import { resolveSourceId, printTable, bold, dim, fail } from "../util";
import type { Source } from "@/lib/kernel/types";

export interface QueryOpts {
  source?: string;
  limit?: number;
  json?: boolean;
}

export function runQuery(viewName: string, opts: QueryOpts): void {
  const sourceId = resolveSourceId(opts.source);
  const db = openStore(sourceId);
  try {
    const view = getViewByName(db, sourceId, viewName);
    if (!view) {
      fail(`No view named '${viewName}' on source ${sourceId}. Try \`nexus list --type=view\`.`);
    }
    const source = readMetaFile(sourceId);
    if (!source) {
      fail(`Source meta missing for ${sourceId}. Try re-running \`nexus connect\`.`);
    }
    const rows = loadMasterRows(db, source);

    const filtered = applyFilters(rows, view.filters);
    const sorted = applySort(filtered, view.sort);
    const limit = opts.limit ?? view.limit;
    const limited = limit ? sorted.slice(0, limit) : sorted;
    const cols = view.columns.length > 0 ? view.columns : source.headers;

    if (opts.json) {
      const projected = limited.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? ""])));
      process.stdout.write(JSON.stringify(projected, null, 2) + "\n");
      return;
    }

    process.stdout.write(`${bold(view.title ?? view.name)}\n`);
    process.stdout.write(
      `${dim(`${limited.length} of ${filtered.length} matching rows (${rows.length} total)`)}\n\n`
    );
    if (limited.length === 0) return;
    printTable(
      cols,
      limited.map((r) => cols.map((c) => r[c] ?? "")),
      { maxWidth: 36 }
    );
  } finally {
    closeStore(db);
  }
}

function readMetaFile(sourceId: string): Source | null {
  const p = metaPath(sourceId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Source;
  } catch {
    return null;
  }
}

function loadMasterRows(db: ReturnType<typeof openStore>, source: Source): Record<string, string>[] {
  const ext = path.extname(source.path).toLowerCase();
  if (source.kind === "csv" || ext === ".csv" || ext === ".tsv") {
    const text = fs.readFileSync(source.path, "utf8");
    return parseCsv(text).rows;
  }
  if (source.kind === "xlsx" || ext === ".xlsx" || ext === ".xls") {
    const wb = XLSX.read(fs.readFileSync(source.path), { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return parseCsv(XLSX.utils.sheet_to_csv(ws)).rows;
  }
  if (source.kind === "sqlite") {
    return readSqliteAsSheet({ filePath: source.path, table: source.table }).rows;
  }
  if (source.kind === "google_sheets") {
    const latest = getSnapshotByName(db, source.id, "master.latest");
    if (latest) return getSnapshotRows(db, latest.id).map((row) => row.cells);
    fail(
      `Source kind '${source.kind}' has no cached rows yet. Run \`nexus connect ${source.path}\` first, then retry.`
    );
  }
  fail(`Unsupported source kind '${source.kind}'.`);
}
