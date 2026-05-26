/**
 * Nexus: Structural summary.
 *
 * Given a parsed sheet and its inferred columns, ask the model to describe what
 * the sheet appears to be and what work it suggests.
 *
 * This is the seed of the semantic layer. In week 2 the structured part of the
 * output will be cached in Neon and reused; in session 1 we only need the prose.
 *
 * Routed through OpenRouter (OpenAI-compatible API). Model is overridable via
 * NEXUS_MODEL so we can swap providers without touching code.
 */

import OpenAI from "openai";
import type { ParsedSheet } from "./fetch-csv";
import type { ColumnSummary } from "./infer-columns";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export type StructuralSummary = {
  description: string;
  subject: string;
  suggestedIntents: string[];
};

export async function generateStructuralSummary(
  sheet: ParsedSheet,
  columns: ColumnSummary[]
): Promise<StructuralSummary> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set. Add it to nexusApp/.env.local.");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://nexus.local",
      "X-Title": "Nexus",
    },
  });

  const model = process.env.NEXUS_MODEL ?? DEFAULT_MODEL;

  const compactColumns = columns.map((c) => ({
    name: c.name,
    type: c.type,
    unique: c.uniqueCount,
    nonEmpty: c.nonEmptyCount,
    samples: c.sampleValues,
    enumValues: c.enumValues,
  }));

  const prompt = `You are looking at a Google Sheet a user has connected to Nexus. Nexus turns sheets into apps. Your job is to describe what this sheet is and suggest what kind of app a user might want to build from it.

Sheet structure:
- ${sheet.headers.length} columns
- ${sheet.rawRowCount} data rows

Columns (with inferred types and samples):
${JSON.stringify(compactColumns, null, 2)}

First 3 rows of data:
${JSON.stringify(sheet.rows.slice(0, 3), null, 2)}

Respond with ONLY a JSON object, no prose, no code fences, matching this shape:

{
  "subject": "<3-6 words describing what this sheet tracks>",
  "description": "<one paragraph, 2-4 sentences, describing what the sheet is and what someone working with it would care about. Plain language, no bullet points, no em dashes.>",
  "suggestedIntents": [
    "<a short verb-led phrase a user might type to build an app from this sheet>",
    "<another>",
    "<another>"
  ]
}

Rules:
- Three suggestedIntents, each 2-6 words, each a different angle (overview, filter/segment, tracker/alert).
- Be specific to this sheet's actual columns and data, not generic.
- Never use em dashes.`;

  const response = await client.chat.completions.create({
    model,
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.choices[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error("Model returned an empty response.");
  }

  const cleaned = stripCodeFences(text);
  let parsed: StructuralSummary;
  try {
    parsed = JSON.parse(cleaned) as StructuralSummary;
  } catch {
    throw new Error(`Model returned non-JSON summary: ${text.slice(0, 200)}`);
  }

  parsed.subject = (parsed.subject ?? "").trim();
  parsed.description = (parsed.description ?? "").trim();
  parsed.suggestedIntents = (parsed.suggestedIntents ?? []).map((s) => s.trim()).filter(Boolean);

  return parsed;
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}
