/**
 * Nexus: aggregation primitives.
 *
 * Take an Aggregation spec and a list of rows; return a number.
 */

import type { Aggregation } from "@/lib/spec/types";
import { getNumber } from "./coerce";

type Row = Record<string, string>;

export function computeAggregation(agg: Aggregation, rows: Row[]): number {
  const n = rows.length;
  switch (agg.kind) {
    case "count":
      return n;
    case "count_unique": {
      const seen = new Set<string>();
      for (const r of rows) {
        const v = (r[agg.field] ?? "").trim();
        if (v) seen.add(v);
      }
      return seen.size;
    }
    case "count_where":
      return rows.filter((r) => (r[agg.field] ?? "").trim() === agg.value).length;
    case "sum": {
      let s = 0;
      for (const r of rows) {
        const v = getNumber(r[agg.field]);
        if (v !== null) s += v;
      }
      return s;
    }
    case "avg": {
      let s = 0;
      let k = 0;
      for (const r of rows) {
        const v = getNumber(r[agg.field]);
        if (v !== null) {
          s += v;
          k++;
        }
      }
      return k === 0 ? 0 : s / k;
    }
    case "min": {
      let best: number | null = null;
      for (const r of rows) {
        const v = getNumber(r[agg.field]);
        if (v !== null && (best === null || v < best)) best = v;
      }
      return best ?? 0;
    }
    case "max": {
      let best: number | null = null;
      for (const r of rows) {
        const v = getNumber(r[agg.field]);
        if (v !== null && (best === null || v > best)) best = v;
      }
      return best ?? 0;
    }
    case "ratio_where":
      if (n === 0) return 0;
      return rows.filter((r) => (r[agg.field] ?? "").trim() === agg.value).length / n;
  }
}

/**
 * Group rows by a field, then compute an aggregation per group.
 * Returns an array sorted by group label (asc) for stable charting.
 */
export function groupAndAggregate(
  rows: Row[],
  groupField: string,
  agg: Aggregation
): { key: string; value: number }[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = (r[groupField] ?? "").trim() || "(empty)";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const out: { key: string; value: number }[] = [];
  for (const [key, gRows] of groups) {
    out.push({ key, value: computeAggregation(agg, gRows) });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/**
 * Format a number for display based on an explicit format hint.
 */
export function formatNumber(n: number, format?: "number" | "integer" | "percent" | "currency"): string {
  if (!Number.isFinite(n)) return "—";
  switch (format) {
    case "percent":
      return `${(n * 100).toFixed(n >= 1 ? 0 : 1)}%`;
    case "currency":
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
    case "integer":
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
    case "number":
    default:
      // Integer-ish counts vs decimals: pick automatically if no format.
      if (Number.isInteger(n)) return new Intl.NumberFormat("en-US").format(n);
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
  }
}
