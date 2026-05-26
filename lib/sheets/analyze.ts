/**
 * Nexus: shared analysis pipeline.
 *
 * Given a ParsedSheet, infer columns and generate the structural summary.
 * Both the URL path and the upload path call this so the response shape is
 * identical regardless of input source.
 */

import type { ParsedSheet } from "./fetch-csv";
import { inferColumns, type ColumnSummary } from "./infer-columns";
import { generateStructuralSummary, type StructuralSummary } from "./summarize";

export type SheetAnalysis = {
  columns: ColumnSummary[];
  summary: StructuralSummary;
};

export async function analyzeSheet(sheet: ParsedSheet): Promise<SheetAnalysis> {
  const columns = inferColumns(sheet);
  const summary = await generateStructuralSummary(sheet, columns);
  return { columns, summary };
}
