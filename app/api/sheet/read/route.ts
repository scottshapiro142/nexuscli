/**
 * Nexus: POST /api/sheet/read
 *
 * Body (one of):
 *   { url: string }                              — public Google Sheets URL
 *   { csv: string, source?: string }             — raw CSV text (e.g. from a local file)
 *   { sqlitePath: string, table?: string }       — absolute path to a local SQLite db
 *
 * Response: { ref?, sheet, columns, summary }
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseSheetUrl } from "@/lib/sheets/parse-url";
import { fetchSheetCsv, parseCsv, type ParsedSheet } from "@/lib/sheets/fetch-csv";
import { readSqliteAsSheet } from "@/lib/sheets/fetch-sqlite";
import { analyzeSheet } from "@/lib/sheets/analyze";
import { generateTells } from "@/lib/tells/generate";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReadBody = {
  url?: string;
  csv?: string;
  source?: string;
  sqlitePath?: string;
  table?: string;
};

export async function POST(req: NextRequest) {
  let body: ReadBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const hasUrl = typeof body.url === "string" && body.url.length > 0;
  const hasCsv = typeof body.csv === "string" && body.csv.length > 0;
  const hasSqlite = typeof body.sqlitePath === "string" && body.sqlitePath.length > 0;

  if (!hasUrl && !hasCsv && !hasSqlite) {
    return NextResponse.json(
      {
        error:
          "Provide one of 'url' (Google Sheets), 'csv' (raw CSV text), or 'sqlitePath' (local SQLite file).",
      },
      { status: 400 }
    );
  }

  try {
    let sheet: ParsedSheet;
    let ref: Record<string, unknown> | null = null;
    let defaultSource: string;

    if (hasSqlite) {
      const sqlitePath = body.sqlitePath!;
      if (!path.isAbsolute(sqlitePath)) {
        return NextResponse.json(
          { error: "'sqlitePath' must be an absolute path." },
          { status: 400 }
        );
      }
      if (!fs.existsSync(sqlitePath)) {
        return NextResponse.json(
          { error: `SQLite file not found at ${sqlitePath}.` },
          { status: 400 }
        );
      }
      const result = readSqliteAsSheet({ filePath: sqlitePath, table: body.table });
      sheet = {
        headers: result.headers,
        rows: result.rows,
        rawRowCount: result.rawRowCount,
      };
      ref = { sqlitePath, table: result.tableName };
      defaultSource = "sqlite";
    } else if (hasUrl) {
      const parsed = parseSheetUrl(body.url!);
      const csvText = await fetchSheetCsv(parsed.csvUrl);
      sheet = parseCsv(csvText);
      ref = { sheetId: parsed.sheetId, gid: parsed.gid };
      defaultSource = "google_sheets";
    } else {
      sheet = parseCsv(body.csv!);
      defaultSource = "upload";
    }

    if (sheet.headers.length === 0) {
      return NextResponse.json({ error: "The sheet looks empty." }, { status: 422 });
    }

    const { columns, summary } = await analyzeSheet(sheet);
    const tells = await generateTells({ sheet, columns, summary });

    return NextResponse.json({
      ref,
      source: body.source ?? defaultSource,
      sheet: {
        headers: sheet.headers,
        rowCount: sheet.rawRowCount,
        rows: sheet.rows,
      },
      columns,
      summary,
      tells,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
