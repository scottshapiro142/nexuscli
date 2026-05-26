/**
 * Nexus: turn an AppSpec into a plain-English description.
 *
 * The renderer (session 3) will turn specs into real UIs. Until then this
 * function gives viewers — and the Loom audience — a way to understand what
 * the spec means without reading JSON.
 */

import type { AppSpec, Aggregation, Filter, Sort } from "./types";

export function explainSpec(spec: AppSpec): string[] {
  switch (spec.archetype) {
    case "dashboard":
      return explainDashboard(spec);
    case "list":
      return explainList(spec);
    case "tracker":
      return explainTracker(spec);
    case "table":
      return explainTable(spec);
    case "triage":
      return explainTriage(spec);
  }
}

function explainAgg(agg: Aggregation): string {
  switch (agg.kind) {
    case "count":
      return "the number of rows";
    case "count_unique":
      return `the number of unique values in ${agg.field}`;
    case "count_where":
      return `the number of rows where ${agg.field} = ${agg.value}`;
    case "sum":
      return `the total of ${agg.field}`;
    case "avg":
      return `the average ${agg.field}`;
    case "min":
      return `the minimum ${agg.field}`;
    case "max":
      return `the maximum ${agg.field}`;
    case "ratio_where":
      return `the share of rows where ${agg.field} = ${agg.value}`;
  }
}

function explainFilter(f: Filter): string {
  switch (f.op) {
    case "equals":
      return `${f.field} = ${f.value}`;
    case "not_equals":
      return `${f.field} ≠ ${f.value}`;
    case "in":
      return `${f.field} in [${f.values.join(", ")}]`;
    case "gt":
      return `${f.field} > ${f.value}`;
    case "lt":
      return `${f.field} < ${f.value}`;
    case "gte":
      return `${f.field} ≥ ${f.value}`;
    case "lte":
      return `${f.field} ≤ ${f.value}`;
    case "contains":
      return `${f.field} contains "${f.value}"`;
    case "month_is":
      return `${f.field} is in ${f.value}`;
    case "year_is":
      return `${f.field} is in ${f.value}`;
    case "between":
      return `${f.field} between ${f.min} and ${f.max}`;
    case "is_empty":
      return `${f.field} is empty`;
    case "is_not_empty":
      return `${f.field} is not empty`;
  }
}

function explainSort(s: Sort): string {
  return `sorted by ${s.field} ${s.direction === "asc" ? "ascending" : "descending"}`;
}

function explainFilters(filters?: Filter[]): string | null {
  if (!filters || filters.length === 0) return null;
  if (filters.length === 1) return `filtered by ${explainFilter(filters[0])}`;
  return `filtered by ${filters.map(explainFilter).join(" AND ")}`;
}

function explainDashboard(spec: Extract<AppSpec, { archetype: "dashboard" }>): string[] {
  const lines: string[] = [];
  lines.push(`A dashboard with ${spec.metrics.length} metric tile${spec.metrics.length === 1 ? "" : "s"}:`);
  for (const m of spec.metrics) lines.push(`  • ${m.label}: ${explainAgg(m.agg)}`);
  if (spec.chart) {
    lines.push(`Plus a ${spec.chart.type} chart of ${explainAgg(spec.chart.series)}, grouped by ${spec.chart.group_by}.`);
  }
  const fs = explainFilters(spec.filters);
  if (fs) lines.push(`Scope: ${fs}.`);
  return lines;
}

function explainList(spec: Extract<AppSpec, { archetype: "list" }>): string[] {
  const lines: string[] = [];
  const sub = spec.secondary_field ? `, with ${spec.secondary_field} as the subtitle` : "";
  const badge = spec.badge_field ? `, ${spec.badge_field} as a badge` : "";
  lines.push(`A list of records, showing ${spec.primary_field} as the headline${sub}${badge}.`);
  if (spec.meta_fields?.length) lines.push(`Meta fields on each card: ${spec.meta_fields.join(", ")}.`);
  const fs = explainFilters(spec.filters);
  if (fs) lines.push(`Scope: ${fs}.`);
  if (spec.sort) lines.push(`Order: ${explainSort(spec.sort)}.`);
  if (spec.limit) lines.push(`Limited to ${spec.limit} records.`);
  return lines;
}

function explainTracker(spec: Extract<AppSpec, { archetype: "tracker" }>): string[] {
  const lines: string[] = [];
  lines.push(`A single-metric tracker: ${explainAgg(spec.metric)}.`);
  const fs = explainFilters(spec.filters);
  if (fs) lines.push(`Scope: ${fs}.`);
  if (spec.trend) lines.push(`Compared to ${spec.trend.compare_to.replace(/_/g, " ")}.`);
  return lines;
}

function explainTable(spec: Extract<AppSpec, { archetype: "table" }>): string[] {
  const lines: string[] = [];
  lines.push(`A table showing ${spec.columns.length} columns: ${spec.columns.join(", ")}.`);
  if (spec.filter_chips?.length) lines.push(`Filter chips for: ${spec.filter_chips.join(", ")}.`);
  const fs = explainFilters(spec.filters);
  if (fs) lines.push(`Default scope: ${fs}.`);
  if (spec.sort) lines.push(`Order: ${explainSort(spec.sort)}.`);
  return lines;
}

function explainTriage(spec: Extract<AppSpec, { archetype: "triage" }>): string[] {
  const lines: string[] = [];
  const pred = spec.queue_predicate.map(explainFilter).join(" AND ");
  lines.push(`A triage queue surfacing rows where ${pred}.`);
  lines.push(`Each card shows ${spec.card_primary_field} with details: ${spec.card_summary_fields.join(", ")}.`);
  if (spec.priority_sort) lines.push(`Prioritized by ${explainSort(spec.priority_sort)} — the most urgent surface first.`);
  if (spec.reason_summary) lines.push(`Reason: ${spec.reason_summary}`);
  return lines;
}
