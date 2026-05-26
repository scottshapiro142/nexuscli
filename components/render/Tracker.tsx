"use client";

/**
 * Nexus: Tracker renderer.
 * One big number, optionally with a trend comparison.
 */

import type { AppSpec } from "@/lib/spec/types";
import { applyFilters } from "@/lib/render/filter";
import { computeAggregation, formatNumber } from "@/lib/render/aggregate";
import { BuildItem } from "./BuildMode";

type Row = Record<string, string>;
type Spec = Extract<AppSpec, { archetype: "tracker" }>;

export default function Tracker({ spec, rows }: { spec: Spec; rows: Row[] }) {
  const filtered = applyFilters(rows, spec.filters);
  const value = computeAggregation(spec.metric, filtered);

  return (
    <BuildItem>
      <div
        style={{
          padding: 36,
          border: "1px solid #eee",
          borderRadius: 12,
          background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 700, color: "#111", letterSpacing: -1 }}>
          {formatNumber(value, spec.format)}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "#888", maxWidth: 360 }}>
          {filtered.length} {filtered.length === 1 ? "record" : "records"} in scope
          {spec.trend && (
            <span style={{ marginLeft: 8, color: "#555" }}>
              (vs. {spec.trend.compare_to.replace(/_/g, " ")})
            </span>
          )}
        </div>
      </div>
    </BuildItem>
  );
}
