/**
 * Nexus: value coercion helpers.
 *
 * CSV rows are all strings. Aggregations and filters need numbers, dates,
 * and booleans. Be lenient — match what a human looking at the cell would do.
 */

export function getNumber(value: string | undefined): number | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (s.length === 0) return null;
  // Strip common decoration: leading $/€/£/¥, trailing %, thousands separators.
  const cleaned = s.replace(/^[$€£¥]\s?/, "").replace(/%$/, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function getYearMonth(value: string | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  // ISO date "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss" or US "M/D/YYYY"
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, "0")}`;
  }
  return null;
}

export function getYear(value: string | undefined): number | null {
  const ym = getYearMonth(value);
  if (!ym) return null;
  return Number(ym.slice(0, 4));
}

export function getBoolean(value: string | undefined): boolean | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().toLowerCase();
  if (s === "") return null;
  if (["true", "t", "yes", "y", "1"].includes(s)) return true;
  if (["false", "f", "no", "n", "0"].includes(s)) return false;
  return null;
}
