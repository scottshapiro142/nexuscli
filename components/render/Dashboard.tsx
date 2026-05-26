"use client";

/**
 * Nexus: Dashboard renderer.
 * Multiple metric tiles plus one optional chart (bar / line / pie).
 */

import type { AppSpec } from "@/lib/spec/types";
import { applyFilters } from "@/lib/render/filter";
import { computeAggregation, groupAndAggregate, formatNumber } from "@/lib/render/aggregate";
import { BuildItem } from "./BuildMode";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Row = Record<string, string>;
type Spec = Extract<AppSpec, { archetype: "dashboard" }>;

const PIE_COLORS = ["#0a66c2", "#1a8a47", "#c2530a", "#8b3aa3", "#a35e3a", "#3aa3a3", "#a33a6e"];

export default function Dashboard({ spec, rows }: { spec: Spec; rows: Row[] }) {
  const filtered = applyFilters(rows, spec.filters);
  const cols = Math.min(spec.metrics.length, 4);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 12,
        }}
      >
        {spec.metrics.map((m, i) => {
          const value = computeAggregation(m.agg, filtered);
          return (
            <BuildItem key={i}>
              <div
                style={{
                  padding: 16,
                  border: "1px solid #eee",
                  borderRadius: 10,
                  background: "white",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ fontSize: 12, color: "#888", fontWeight: 500, letterSpacing: 0.2 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: "#111" }}>
                  {formatNumber(value, m.format)}
                </div>
              </div>
            </BuildItem>
          );
        })}
      </div>

      {spec.chart && (
        <BuildItem>
          <div
            style={{
              marginTop: 16,
              padding: 16,
              border: "1px solid #eee",
              borderRadius: 10,
              background: "white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ fontSize: 13, color: "#666", marginBottom: 10 }}>
              By {spec.chart.group_by}
            </div>
            <ChartView
              type={spec.chart.type}
              data={groupAndAggregate(filtered, spec.chart.group_by, spec.chart.series)}
            />
          </div>
        </BuildItem>
      )}
    </div>
  );
}

function ChartView({
  type,
  data,
}: {
  type: "bar" | "line" | "pie";
  data: { key: string; value: number }[];
}) {
  if (data.length === 0) {
    return <div style={{ color: "#999", fontSize: 13 }}>No data to chart.</div>;
  }

  if (type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="key" outerRadius={90} label>
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === "line") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
          <XAxis dataKey="key" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#0a66c2" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
        <XAxis dataKey="key" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="value" fill="#0a66c2" />
      </BarChart>
    </ResponsiveContainer>
  );
}
