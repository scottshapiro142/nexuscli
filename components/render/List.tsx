"use client";

/**
 * Nexus: List renderer. Card grid showing individual records, paginated.
 */

import { useState } from "react";
import type { AppSpec } from "@/lib/spec/types";
import { applyFilters } from "@/lib/render/filter";
import { applySort } from "@/lib/render/sort";
import Pagination from "./Pagination";

type Row = Record<string, string>;
type Spec = Extract<AppSpec, { archetype: "list" }>;

const DEFAULT_PAGE_SIZE = 24;

export default function ListView({ spec, rows }: { spec: Spec; rows: Row[] }) {
  const filtered = applyFilters(rows, spec.filters);
  const sorted = applySort(filtered, spec.sort);
  const pageSize = spec.limit ?? DEFAULT_PAGE_SIZE;

  const [page, setPage] = useState(0);
  const total = sorted.length;
  const start = page * pageSize;
  const shown = sorted.slice(start, start + pageSize);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {shown.map((row, i) => (
          <div
            key={start + i}
            style={{
              padding: 14,
              border: "1px solid #eee",
              borderRadius: 10,
              background: "white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#111", flex: 1 }}>
                {row[spec.primary_field] || "—"}
              </div>
              {spec.badge_field && row[spec.badge_field] && (
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    background: "#eef2f8",
                    color: "#1a3a5f",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {row[spec.badge_field]}
                </span>
              )}
            </div>
            {spec.secondary_field && row[spec.secondary_field] && (
              <div style={{ fontSize: 13, color: "#555" }}>{row[spec.secondary_field]}</div>
            )}
            {spec.meta_fields?.length ? (
              <div style={{ marginTop: 4, fontSize: 12, color: "#777", display: "flex", flexWrap: "wrap", gap: 8 }}>
                {spec.meta_fields.map((field) => (
                  <span key={field}>
                    <span style={{ color: "#999" }}>{field}:</span> {row[field] || "—"}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </div>
  );
}
