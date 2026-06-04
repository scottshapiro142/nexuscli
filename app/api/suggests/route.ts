/**
 * Nexus: POST /api/suggests
 *
 * Body shape mirrors the read response:
 *   {
 *     sheet:    { headers, rowCount, rows },
 *     summary:  StructuralSummary,
 *     columns:  ColumnSummary[],
 *     tells:    Tell[]
 *   }
 *
 * Response: { apps: AppSpec[] } | { error }
 */

import { NextRequest, NextResponse } from "next/server";
import type { ColumnSummary } from "@/lib/sheets/infer-columns";
import type { StructuralSummary } from "@/lib/sheets/summarize";
import type { Tell } from "@/lib/tells/types";
import { generateSuggests } from "@/lib/suggests/generate";
import { resolveSampler } from "@/lib/iris/sampler";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  sheet?: { headers: string[]; rowCount: number; rows: Record<string, string>[] };
  summary?: StructuralSummary;
  columns?: ColumnSummary[];
  tells?: Tell[];
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!body.sheet || !body.summary || !body.columns) {
    return NextResponse.json(
      { error: "Missing required fields: sheet, summary, columns." },
      { status: 400 }
    );
  }

  try {
    const apps = await generateSuggests(
      {
        sheet: {
          headers: body.sheet.headers,
          rows: body.sheet.rows,
          rawRowCount: body.sheet.rowCount,
        },
        summary: body.summary,
        columns: body.columns,
        tells: body.tells ?? [],
      },
      await resolveSampler({ force: "openrouter" })
    );
    return NextResponse.json({ apps });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
