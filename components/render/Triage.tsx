"use client";

/**
 * Nexus: Triage renderer — the killer archetype.
 * Cards in priority order, surfacing rows the user should act on, paginated.
 */

import { useState } from "react";
import type { AppSpec } from "@/lib/spec/types";
import { applyFilters } from "@/lib/render/filter";
import { applySort } from "@/lib/render/sort";
import Pagination from "./Pagination";

type Row = Record<string, string>;
type Spec = Extract<AppSpec, { archetype: "triage" }>;

const PAGE_SIZE = 12;

export default function Triage({ spec, rows }: { spec: Spec; rows: Row[] }) {
  const inQueue = applyFilters(rows, spec.queue_predicate);
  const sorted = applySort(inQueue, spec.priority_sort);

  const [page, setPage] = useState(0);
  const total = sorted.length;
  const start = page * PAGE_SIZE;
  const shown = sorted.slice(start, start + PAGE_SIZE);

  return (
    <div>
      {spec.reason_summary && (
        <div
          style={{
            padding: 12,
            background: "#fffbea",
            border: "1px solid #f0e0a3",
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 13,
            color: "#5a4900",
          }}
        >
          <strong style={{ color: "#3d2f00" }}>Why these surface: </strong>
          {spec.reason_summary}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13, color: "#666" }}>
        <span
          style={{
            display: "inline-block",
            padding: "2px 10px",
            background: "#111",
            color: "white",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {total}
        </span>
        <span>{total === 1 ? "item" : "items"} need attention</span>
      </div>

      {total === 0 ? (
        <div style={{ padding: 24, color: "#888", fontSize: 14, textAlign: "center", border: "1px dashed #ddd", borderRadius: 8 }}>
          Nothing needs attention right now.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {shown.map((row, i) => (
              <div
                key={start + i}
                style={{
                  padding: "10px 12px",
                  border: "1px solid #eee",
                  borderRadius: 8,
                  background: "white",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111", lineHeight: 1.35 }}>
                    {row[spec.card_primary_field] || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "#999" }}>#{start + i + 1}</div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    columnGap: 14,
                    rowGap: 2,
                    fontSize: 12,
                    color: "#555",
                    lineHeight: 1.5,
                  }}
                >
                  {spec.card_summary_fields.map((field) => (
                    <span key={field}>
                      <span style={{ color: "#999" }}>{field}:</span>{" "}
                      <span style={{ color: "#333" }}>{row[field] || "—"}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
