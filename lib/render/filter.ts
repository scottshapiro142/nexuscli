/**
 * Nexus: Apply Filter[] (ANDed) to rows.
 *
 * All filters are conjunctive. Each filter compares one field against a value
 * using the operator. Missing values fail every comparison except is_empty.
 */

import type { Filter } from "@/lib/spec/types";
import { getNumber, getYearMonth, getYear } from "./coerce";

type Row = Record<string, string>;

export function applyFilters(rows: Row[], filters?: Filter[]): Row[] {
  if (!filters || filters.length === 0) return rows;
  return rows.filter((r) => filters.every((f) => rowMatchesFilter(r, f)));
}

export function rowMatchesFilter(row: Row, f: Filter): boolean {
  const raw = row[f.field];
  const cell = raw == null ? "" : String(raw).trim();

  switch (f.op) {
    case "equals":
      return cell === f.value;
    case "not_equals":
      return cell !== f.value;
    case "in":
      return f.values.includes(cell);
    case "contains":
      return cell.toLowerCase().includes(f.value.toLowerCase());
    case "gt": {
      const n = getNumber(cell);
      return n !== null && n > f.value;
    }
    case "gte": {
      const n = getNumber(cell);
      return n !== null && n >= f.value;
    }
    case "lt": {
      const n = getNumber(cell);
      return n !== null && n < f.value;
    }
    case "lte": {
      const n = getNumber(cell);
      return n !== null && n <= f.value;
    }
    case "between": {
      const n = getNumber(cell);
      return n !== null && n >= f.min && n <= f.max;
    }
    case "month_is": {
      const ym = getYearMonth(cell);
      return ym !== null && ym === f.value;
    }
    case "year_is": {
      const y = getYear(cell);
      return y !== null && y === f.value;
    }
    case "is_empty":
      return cell === "";
    case "is_not_empty":
      return cell !== "";
  }
}
