/**
 * Per-source context object the MCP layer carries around.
 *
 * One SourceContext per connected master that the server exposes. Holds the
 * Source meta, the materialized master rows (re-loaded on demand), and a
 * cached headers array. Built once per `nexus serve` invocation today; in
 * v0.3 we'll add change-detection so the rows can be re-loaded on a file
 * mtime bump without restarting the server.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { parseCsv } from "@/lib/sheets/fetch-csv";
import { readSqliteAsSheet } from "@/lib/sheets/fetch-sqlite";
import { metaPath } from "@/lib/kernel/paths";
import type { Source } from "@/lib/kernel/types";
import { hashRow } from "@/lib/kernel/hash";

export interface SourceContext {
  source: Source;
  /** All rows of the master, in original order. */
  rows: Record<string, string>[];
  /** Parallel to `rows` — stable hash id for each row. */
  rowIds: string[];
  /** id → row, for O(1) lookup when the agent passes ids. */
  rowsById: Map<string, Record<string, string>>;
}

export function readSourceMeta(sourceId: string): Source | null {
  const p = metaPath(sourceId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Source;
  } catch {
    return null;
  }
}

export function loadSourceContext(sourceId: string): SourceContext {
  const source = readSourceMeta(sourceId);
  if (!source) {
    throw new Error(
      `Source meta missing for ${sourceId}. Run \`nexus connect <path>\` first.`
    );
  }
  const rows = loadRows(source);
  const rowIds: string[] = [];
  const rowsById = new Map<string, Record<string, string>>();
  for (const r of rows) {
    const id = hashRow(source.headers, r);
    rowIds.push(id);
    rowsById.set(id, r);
  }
  return { source, rows, rowIds, rowsById };
}

function loadRows(source: Source): Record<string, string>[] {
  const ext = path.extname(source.path).toLowerCase();
  if (source.kind === "csv" || ext === ".csv" || ext === ".tsv") {
    return parseCsv(fs.readFileSync(source.path, "utf8")).rows;
  }
  if (source.kind === "xlsx" || ext === ".xlsx" || ext === ".xls") {
    const wb = XLSX.read(fs.readFileSync(source.path), { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return parseCsv(XLSX.utils.sheet_to_csv(ws)).rows;
  }
  if (source.kind === "sqlite") {
    return readSqliteAsSheet({ filePath: source.path, table: source.table }).rows;
  }
  // google_sheets: requires re-fetch — out of scope for the initial MCP boot.
  // Encourage the user to `nexus connect` first so we have a local meta.
  throw new Error(
    `Source kind '${source.kind}' needs a live re-fetch. Run \`nexus connect ${source.path}\` first.`
  );
}
