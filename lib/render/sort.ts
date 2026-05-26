import type { Sort } from "@/lib/spec/types";
import { getNumber } from "./coerce";

type Row = Record<string, string>;

export function applySort(rows: Row[], sort?: Sort): Row[] {
  if (!sort) return rows;
  const dir = sort.direction === "desc" ? -1 : 1;
  const field = sort.field;

  return [...rows].sort((a, b) => {
    const av = a[field] ?? "";
    const bv = b[field] ?? "";
    const an = getNumber(av);
    const bn = getNumber(bv);
    if (an !== null && bn !== null) return (an - bn) * dir;
    // Fallback to string compare (handles dates in ISO form correctly).
    return av.localeCompare(bv) * dir;
  });
}
