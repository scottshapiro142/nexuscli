/**
 * Nexus: Column inference.
 *
 * Looks at the values in each column to guess a type and a coarse semantic role.
 * This is the deterministic seed of what will become the semantic layer in week 2.
 * For session 1 the inferred types just help Claude write a better summary.
 */

import type { ParsedSheet } from "./fetch-csv";

export type ColumnType =
  | "number"
  | "integer"
  | "currency"
  | "percent"
  | "date"
  | "datetime"
  | "boolean"
  | "url"
  | "email"
  | "enum"
  | "long_text"
  | "text"
  | "empty";

export type ColumnSummary = {
  name: string;
  type: ColumnType;
  nonEmptyCount: number;
  uniqueCount: number;
  sampleValues: string[];
  minLength: number;
  maxLength: number;
  /** For enums, the distinct values (up to a cap). */
  enumValues?: string[];
};

const URL_RE = /^https?:\/\/\S+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCY_RE = /^[-]?[$€£¥]\s?-?\d[\d,]*(\.\d+)?$|^-?\d[\d,]*(\.\d+)?\s?(USD|EUR|GBP)$/i;
const PERCENT_RE = /^-?\d+(\.\d+)?\s?%$/;
const INT_RE = /^-?\d{1,3}(,\d{3})*$|^-?\d+$/;
const NUM_RE = /^-?\d+(\.\d+)?$|^-?\d{1,3}(,\d{3})*(\.\d+)?$/;
const BOOL_VALUES = new Set(["true", "false", "yes", "no", "y", "n", "0", "1"]);
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(:\d{2})?/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

export function inferColumns(sheet: ParsedSheet): ColumnSummary[] {
  return sheet.headers.map((header) => {
    const values = sheet.rows.map((r) => (r[header] ?? "").trim());
    const nonEmpty = values.filter((v) => v.length > 0);
    const unique = new Set(nonEmpty);

    if (nonEmpty.length === 0) {
      return {
        name: header,
        type: "empty" as const,
        nonEmptyCount: 0,
        uniqueCount: 0,
        sampleValues: [],
        minLength: 0,
        maxLength: 0,
      };
    }

    const lengths = nonEmpty.map((v) => v.length);
    const minLength = Math.min(...lengths);
    const maxLength = Math.max(...lengths);

    const type = detectType(nonEmpty, unique.size);

    const summary: ColumnSummary = {
      name: header,
      type,
      nonEmptyCount: nonEmpty.length,
      uniqueCount: unique.size,
      sampleValues: pickSamples(nonEmpty, 4),
      minLength,
      maxLength,
    };

    if (type === "enum") {
      summary.enumValues = Array.from(unique).slice(0, 20);
    }
    return summary;
  });
}

function detectType(values: string[], uniqueCount: number): ColumnType {
  const total = values.length;
  const ratio = (n: number) => n / total;

  const passes = (re: RegExp) => values.filter((v) => re.test(v)).length;

  if (ratio(passes(URL_RE)) > 0.9) return "url";
  if (ratio(passes(EMAIL_RE)) > 0.9) return "email";
  if (ratio(passes(DATETIME_RE)) > 0.85) return "datetime";
  if (ratio(passes(DATE_RE)) > 0.85) return "date";
  if (ratio(passes(CURRENCY_RE)) > 0.8) return "currency";
  if (ratio(passes(PERCENT_RE)) > 0.8) return "percent";

  const lowered = values.map((v) => v.toLowerCase());
  if (lowered.every((v) => BOOL_VALUES.has(v))) return "boolean";

  if (ratio(passes(INT_RE)) > 0.9) return "integer";
  if (ratio(passes(NUM_RE)) > 0.9) return "number";

  // Enum heuristic: small set of repeated values, not unique IDs.
  if (uniqueCount <= Math.max(8, Math.floor(total * 0.2)) && uniqueCount > 1 && uniqueCount < total) {
    return "enum";
  }

  const avgLen = values.reduce((s, v) => s + v.length, 0) / total;
  if (avgLen > 80) return "long_text";

  return "text";
}

function pickSamples(values: string[], n: number): string[] {
  if (values.length <= n) return values.slice();
  const step = Math.floor(values.length / n);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(values[i * step]);
  }
  return out;
}
