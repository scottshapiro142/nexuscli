/**
 * `nexus connect <path-or-url>` — register a master, run Iris's read,
 * persist Tells/Suggests/AppSpecs into the local derivation store.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseCsv, type ParsedSheet } from "@/lib/sheets/fetch-csv";
import { fetchSheetCsv } from "@/lib/sheets/fetch-csv";
import { parseSheetUrl } from "@/lib/sheets/parse-url";
import { isSqlitePath, readSqliteAsSheet } from "@/lib/sheets/fetch-sqlite";
import * as XLSX from "xlsx";
import { analyzeSheet } from "@/lib/sheets/analyze";
import { generateTells } from "@/lib/tells/generate";
import { generateSuggests } from "@/lib/suggests/generate";
import { hashSheet } from "@/lib/kernel/hash";
import { openStore, closeStore } from "@/lib/kernel/store";
import { persistIrisOutput } from "@/lib/kernel/iris-bridge";
import type { Source } from "@/lib/kernel/types";
import { nowIso } from "@/lib/kernel/ids";
import { ensureStoreDir, metaPath } from "@/lib/kernel/paths";
import { fail, printKV, bold, dim } from "../util";

export interface ConnectOpts {
  table?: string;
  source?: string;
  skipIris?: boolean;
}

interface SheetLoad {
  sheet: ParsedSheet;
  kind: Source["kind"];
  resolvedPath: string;
  table?: string;
}

export async function runConnect(target: string, opts: ConnectOpts): Promise<void> {
  process.stdout.write(`${bold("nexus connect")} ${target}\n`);
  const load = await loadSheet(target, opts.table);
  process.stdout.write(
    `  read ${load.sheet.headers.length} columns, ${load.sheet.rawRowCount} rows (${load.kind})\n`
  );

  const sourceId = hashSheet(load.sheet);
  ensureStoreDir(sourceId);
  const db = openStore(sourceId);
  try {
    if (opts.skipIris) {
      const source: Source = {
        id: sourceId,
        kind: load.kind,
        path: load.resolvedPath,
        table: load.table,
        headers: load.sheet.headers,
        rowCount: load.sheet.rawRowCount,
        contentHash: sourceId,
        connectedAt: nowIso(),
        lastReadAt: nowIso(),
      };
      persistIrisOutput({
        db,
        source,
        sheet: load.sheet,
        columns: [],
        summary: { subject: "", description: "", suggestedIntents: [] },
        tells: [],
        suggests: [],
      });
      writeMetaFile(sourceId, source);
      process.stdout.write(`  source registered (no Iris run)\n`);
      printKV({ id: sourceId, store: `~/.nexus/${sourceId}/` });
      return;
    }

    process.stdout.write(`  iris reading ...\n`);
    const analyzed = await analyzeSheet(load.sheet);
    process.stdout.write(`  iris noticing ...\n`);
    const tells = await generateTells({
      sheet: load.sheet,
      columns: analyzed.columns,
      summary: analyzed.summary,
    });
    process.stdout.write(`  iris suggesting apps ...\n`);
    let suggests: Awaited<ReturnType<typeof generateSuggests>> = [];
    try {
      suggests = await generateSuggests({
        sheet: load.sheet,
        columns: analyzed.columns,
        summary: analyzed.summary,
        tells,
      });
    } catch (err) {
      process.stdout.write(`  ${dim(`iris suggests failed: ${(err as Error).message}`)}\n`);
    }

    const source: Source = {
      id: sourceId,
      kind: load.kind,
      path: load.resolvedPath,
      table: load.table,
      headers: load.sheet.headers,
      rowCount: load.sheet.rawRowCount,
      contentHash: sourceId,
      connectedAt: nowIso(),
      lastReadAt: nowIso(),
      subject: analyzed.summary.subject,
      description: analyzed.summary.description,
    };

    const result = persistIrisOutput({
      db,
      source,
      sheet: load.sheet,
      columns: analyzed.columns,
      summary: analyzed.summary,
      tells,
      suggests,
    });
    writeMetaFile(sourceId, source);

    process.stdout.write(`\n${bold("done.")}\n`);
    printKV({
      id: sourceId,
      subject: source.subject ?? "",
      views: result.views.length,
      annotations: result.annotationsCreated,
      store: `~/.nexus/${sourceId}/`,
    });
  } finally {
    closeStore(db);
  }
}

async function loadSheet(target: string, table?: string): Promise<SheetLoad> {
  if (/^https?:\/\//i.test(target)) {
    const parsed = parseSheetUrl(target);
    const csv = await fetchSheetCsv(parsed.csvUrl);
    return { sheet: parseCsv(csv), kind: "google_sheets", resolvedPath: target };
  }

  const abs = path.resolve(process.cwd(), target);
  if (!fs.existsSync(abs)) fail(`File not found: ${abs}`);
  const ext = path.extname(abs).toLowerCase();

  if (ext === ".csv" || ext === ".tsv") {
    const text = fs.readFileSync(abs, "utf8");
    return { sheet: parseCsv(text), kind: "csv", resolvedPath: abs };
  }
  if (ext === ".xlsx" || ext === ".xls") {
    const sheet = readXlsx(abs);
    return { sheet, kind: "xlsx", resolvedPath: abs };
  }
  if (isSqlitePath(abs)) {
    const result = readSqliteAsSheet({ filePath: abs, table });
    return { sheet: result, kind: "sqlite", resolvedPath: abs, table: result.tableName };
  }
  fail(`Unrecognized file type: ${ext || "(no extension)"}. Supported: csv, tsv, xlsx, sqlite, http(s) URL.`);
}

function readXlsx(filePath: string): ParsedSheet {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) throw new Error("XLSX file has no sheets.");
  const ws = wb.Sheets[firstSheetName];
  const csv = XLSX.utils.sheet_to_csv(ws);
  return parseCsv(csv);
}

function writeMetaFile(sourceId: string, source: Source): void {
  fs.writeFileSync(metaPath(sourceId), JSON.stringify(source, null, 2), "utf8");
}
