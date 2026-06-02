"use client";

/**
 * Nexus: Table renderer.
 * Data table with optional filter chips and pagination.
 */

import { useMemo, useState } from "react";
import type { AppSpec } from "@/lib/spec/types";
import { applyFilters, rowMatchesFilter } from "@/lib/render/filter";
import { applySort } from "@/lib/render/sort";
import Pagination from "./Pagination";

type Row = Record<string, string>;
type Spec = Extract<AppSpec, { archetype: "table" }>;

const PAGE_SIZE = 25;

export default function TableView({ spec, rows }: { spec: Spec; rows: Row[] }) {
  const [chipState, setChipState] = useState<Record<string, string | null>>({});
  const [page, setPage] = useState(0);

  const chipFields = useMemo(() => spec.filter_chips ?? [], [spec.filter_chips]);

  const chipOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const field of chipFields) {
      const seen = new Set<string>();
      for (const r of rows) {
        const v = (r[field] ?? "").trim();
        if (v) seen.add(v);
      }
      out[field] = Array.from(seen).sort();
    }
    return out;
  }, [rows, chipFields]);

  const baseFiltered = useMemo(() => applyFilters(rows, spec.filters), [rows, spec.filters]);

  const chipFiltered = useMemo(() => {
    return baseFiltered.filter((r) => {
      for (const field of chipFields) {
        const selection = chipState[field];
        if (selection != null) {
          if (!rowMatchesFilter(r, { op: "equals", field, value: selection })) return false;
        }
      }
      return true;
    });
  }, [baseFiltered, chipFields, chipState]);

  const sorted = useMemo(() => applySort(chipFiltered, spec.sort), [chipFiltered, spec.sort]);

  const total = sorted.length;
  const start = page * PAGE_SIZE;
  const shown = sorted.slice(start, start + PAGE_SIZE);

  // Reset to page 0 when chip filter changes — total might be smaller now.
  const resetPage = () => setPage(0);

  return (
    <div>
      {chipFields.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {chipFields.map((field) => (
            <div key={field} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#666", marginRight: 6 }}>{field}:</span>
              <Chip
                label="All"
                active={chipState[field] == null}
                onClick={() => {
                  setChipState((s) => ({ ...s, [field]: null }));
                  resetPage();
                }}
              />
              {chipOptions[field].map((val) => (
                <Chip
                  key={val}
                  label={val}
                  active={chipState[field] === val}
                  onClick={() => {
                    setChipState((s) => ({ ...s, [field]: val }));
                    resetPage();
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 10,
          overflowX: "auto",
          background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#fafafa", borderBottom: "1px solid #eee" }}>
              {spec.columns.map((c) => (
                <th key={c} style={{ padding: 10, textAlign: "left", fontWeight: 600, color: "#444" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={start + i} style={{ borderBottom: "1px solid #f4f4f4" }}>
                {spec.columns.map((c) => (
                  <td key={c} style={{ padding: 10, color: "#333", verticalAlign: "top" }}>
                    {row[c] || ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        border: active ? "1px solid #111" : "1px solid #ddd",
        background: active ? "#111" : "white",
        color: active ? "white" : "#444",
        fontSize: 12,
        cursor: "pointer",
        fontWeight: active ? 600 : 400,
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}
