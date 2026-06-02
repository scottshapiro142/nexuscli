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
import { fetchGoogleSheet, parseCsv } from "@/lib/sheets/fetch-csv";
import { readSqliteAsSheet } from "@/lib/sheets/fetch-sqlite";
import { parseSheetUrl } from "@/lib/sheets/parse-url";
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

export interface LoadSourceContextOpts {
  /** Optional progress sink — receives short status strings ahead of network calls. */
  onProgress?: (message: string) => void;
}

export async function loadSourceContext(
  sourceId: string,
  opts: LoadSourceContextOpts = {}
): Promise<SourceContext> {
  const source = readSourceMeta(sourceId);
  if (!source) {
    throw new Error(
      `Source meta missing for ${sourceId}. Run \`nexus connect <path>\` first.`
    );
  }
  const rows = await loadRows(source, opts);
  const rowIds: string[] = [];
  const rowsById = new Map<string, Record<string, string>>();
  for (const r of rows) {
    const id = hashRow(source.headers, r);
    rowIds.push(id);
    rowsById.set(id, r);
  }
  return { source, rows, rowIds, rowsById };
}

async function loadRows(
  source: Source,
  opts: LoadSourceContextOpts
): Promise<Record<string, string>[]> {
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
  if (source.kind === "google_sheets") {
    opts.onProgress?.("fetching latest from Google Sheets…");
    const ref = parseSheetUrl(source.path);
    try {
      const csv = await fetchGoogleSheet(ref);
      return parseCsv(csv).rows;
    } catch (err) {
      throw new Error(
        `Couldn't refetch Google Sheet: ${(err as Error).message}\n` +
          `  source: ${source.path}\n` +
          `  Try \`nexus connect <url>\` to re-register.`
      );
    }
  }
  throw new Error(`Unsupported source kind: ${source.kind}`);
}
