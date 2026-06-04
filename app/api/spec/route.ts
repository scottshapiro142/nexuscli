/**
 * Nexus: POST /api/spec
 *
 * Body shape mirrors the read response plus an intent:
 *   {
 *     sheet:    { headers, rowCount, preview },   // from /api/sheet/read
 *     summary:  StructuralSummary,                // from /api/sheet/read
 *     columns:  ColumnSummary[],                  // from /api/sheet/read
 *     intent:   string
 *   }
 *
 * Response: { spec: AppSpec } | { error }
 */

import { NextRequest, NextResponse } from "next/server";
import type { ColumnSummary } from "@/lib/sheets/infer-columns";
import type { StructuralSummary } from "@/lib/sheets/summarize";
import { generateAppSpec } from "@/lib/spec/generate";
import { resolveSampler } from "@/lib/iris/sampler";

export const runtime = "nodejs";
export const maxDuration = 60;

type SpecBody = {
  sheet?: {
    headers: string[];
    rowCount: number;
    rows: Record<string, string>[];
  };
  summary?: StructuralSummary;
  columns?: ColumnSummary[];
  intent?: string;
};

export async function POST(req: NextRequest) {
  let body: SpecBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!body.sheet || !body.summary || !body.columns || !body.intent) {
    return NextResponse.json(
      { error: "Missing required fields: sheet, summary, columns, intent." },
      { status: 400 }
    );
  }

  try {
    const spec = await generateAppSpec(
      {
        sheet: {
          headers: body.sheet.headers,
          rows: body.sheet.rows,
          rawRowCount: body.sheet.rowCount,
        },
        summary: body.summary,
        columns: body.columns,
        intent: body.intent.trim(),
      },
      await resolveSampler({ force: "openrouter" })
    );
    return NextResponse.json({ spec });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
