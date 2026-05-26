/**
 * Nexus: AppSpec — the contract between Session 2 (classify+extract) and
 * Session 3 (deterministic render).
 *
 * Strict, opinionated, version-1. Every archetype is a discriminated branch.
 * The LLM produces JSON matching one of these branches; the renderer reads it.
 *
 * Architectural rule: never let the LLM produce freeform UI. It only chooses
 * an archetype and fills its parameters.
 */

import { z } from "zod";

// ---- Aggregation primitives -------------------------------------------------

export const AggregationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("count") }),
  z.object({ kind: z.literal("count_unique"), field: z.string() }),
  z.object({ kind: z.literal("count_where"), field: z.string(), value: z.string() }),
  z.object({ kind: z.literal("sum"), field: z.string() }),
  z.object({ kind: z.literal("avg"), field: z.string() }),
  z.object({ kind: z.literal("min"), field: z.string() }),
  z.object({ kind: z.literal("max"), field: z.string() }),
  // 0..1 — share of rows where field == value
  z.object({ kind: z.literal("ratio_where"), field: z.string(), value: z.string() }),
]);
export type Aggregation = z.infer<typeof AggregationSchema>;

// ---- Filter ops -------------------------------------------------------------

export const FilterSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("equals"), field: z.string(), value: z.string() }),
  z.object({ op: z.literal("not_equals"), field: z.string(), value: z.string() }),
  z.object({ op: z.literal("in"), field: z.string(), values: z.array(z.string()).min(1) }),
  z.object({ op: z.literal("gt"), field: z.string(), value: z.number() }),
  z.object({ op: z.literal("lt"), field: z.string(), value: z.number() }),
  z.object({ op: z.literal("gte"), field: z.string(), value: z.number() }),
  z.object({ op: z.literal("lte"), field: z.string(), value: z.number() }),
  z.object({ op: z.literal("contains"), field: z.string(), value: z.string() }),
  // "YYYY-MM" — for a date or datetime column
  z.object({ op: z.literal("month_is"), field: z.string(), value: z.string() }),
  z.object({ op: z.literal("year_is"), field: z.string(), value: z.number() }),
  z.object({ op: z.literal("between"), field: z.string(), min: z.number(), max: z.number() }),
  z.object({ op: z.literal("is_empty"), field: z.string() }),
  z.object({ op: z.literal("is_not_empty"), field: z.string() }),
]);
export type Filter = z.infer<typeof FilterSchema>;

// ---- Shared ----------------------------------------------------------------

export const SortSchema = z.object({
  field: z.string(),
  direction: z.enum(["asc", "desc"]),
});
export type Sort = z.infer<typeof SortSchema>;

const NumberFormat = z.enum(["number", "integer", "percent", "currency"]);

// ---- Archetypes ------------------------------------------------------------

const DashboardSpecSchema = z.object({
  archetype: z.literal("dashboard"),
  title: z.string(),
  metrics: z
    .array(
      z.object({
        label: z.string(),
        agg: AggregationSchema,
        format: NumberFormat.optional(),
      })
    )
    .min(1)
    .max(6),
  chart: z
    .object({
      type: z.enum(["bar", "line", "pie"]),
      group_by: z.string(),
      series: AggregationSchema,
    })
    .optional(),
  filters: z.array(FilterSchema).optional(),
});

const ListSpecSchema = z.object({
  archetype: z.literal("list"),
  title: z.string(),
  primary_field: z.string(),
  secondary_field: z.string().optional(),
  badge_field: z.string().optional(),
  meta_fields: z.array(z.string()).optional(),
  filters: z.array(FilterSchema).optional(),
  sort: SortSchema.optional(),
  limit: z.number().int().positive().max(500).optional(),
});

const TrackerSpecSchema = z.object({
  archetype: z.literal("tracker"),
  title: z.string(),
  metric: AggregationSchema,
  format: NumberFormat.optional(),
  filters: z.array(FilterSchema).optional(),
  trend: z
    .object({
      compare_to: z.enum(["previous_period", "previous_month", "previous_week", "previous_year"]),
    })
    .optional(),
});

const TableSpecSchema = z.object({
  archetype: z.literal("table"),
  title: z.string(),
  columns: z.array(z.string()).min(1),
  filter_chips: z.array(z.string()).optional(),
  filters: z.array(FilterSchema).optional(),
  sort: SortSchema.optional(),
});

const TriageSpecSchema = z.object({
  archetype: z.literal("triage"),
  title: z.string(),
  // All predicates ANDed together. Defines what "needs attention" means here.
  queue_predicate: z.array(FilterSchema).min(1),
  priority_sort: SortSchema.optional(),
  card_primary_field: z.string(),
  card_summary_fields: z.array(z.string()).min(1).max(8),
  // One-line human-readable explanation of why each row appears.
  reason_summary: z.string().optional(),
});

export const AppSpecSchema = z.discriminatedUnion("archetype", [
  DashboardSpecSchema,
  ListSpecSchema,
  TrackerSpecSchema,
  TableSpecSchema,
  TriageSpecSchema,
]);
export type AppSpec = z.infer<typeof AppSpecSchema>;
export type Archetype = AppSpec["archetype"];
