/**
 * Nexus: AppSpec eval harness.
 *
 * Run with:
 *   npm run eval:spec
 *
 * Loads the two test CSVs from the repo root, computes the structural read
 * once per sheet (so we only pay one LLM summary call per file), then runs
 * each (sheet, intent) pair through generateAppSpec. Prints results so you
 * can eyeball whether the chosen archetype + fields are plausible.
 *
 * End-of-session check (NEX-2): 10 pairs, all reasonable to a human.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCsv } from "../sheets/fetch-csv";
import { inferColumns } from "../sheets/infer-columns";
import { generateStructuralSummary } from "../sheets/summarize";
import { generateAppSpec } from "./generate";
import type { AppSpec, Archetype } from "./types";

const REPO_ROOT = process.cwd();

type Case = { intent: string; expected: Archetype };
type Sheet = { label: string; csvPath: string; cases: Case[] };

const SHEETS: Sheet[] = [
  {
    label: "ShipOrSkip reviews",
    csvPath: resolve(REPO_ROOT, "shipOrSkip-reviews.csv"),
    cases: [
      { intent: "show me verdicts by agent", expected: "dashboard" },
      { intent: "skip rate this month", expected: "tracker" },
      { intent: "all submissions", expected: "list" },
      { intent: "what needs attention", expected: "triage" },
      { intent: "filter reviews by category and verdict", expected: "table" },
    ],
  },
  {
    label: "Archaeological finds (stress test)",
    csvPath: resolve(REPO_ROOT, "stress-test-sheet.csv"),
    cases: [
      { intent: "browse finds with photos", expected: "list" },
      { intent: "filter artifacts by material and stratum", expected: "table" },
      { intent: "finds needing illustration or analysis", expected: "triage" },
      { intent: "average weight by material", expected: "dashboard" },
      { intent: "how many finds total", expected: "tracker" },
    ],
  },
];

function color(s: string, code: number): string {
  return process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
}
const green = (s: string) => color(s, 32);
const red = (s: string) => color(s, 31);
const dim = (s: string) => color(s, 90);
const bold = (s: string) => color(s, 1);

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error(
      "OPENROUTER_API_KEY is not set. Export it in your shell, or run: nexus config set-key <key>"
    );
    process.exit(1);
  }

  let pass = 0;
  let fail = 0;
  const failures: { sheet: string; intent: string; expected: string; got: string; reason?: string }[] = [];

  for (const sheet of SHEETS) {
    console.log(bold(`\n=== ${sheet.label} ===`));
    let csv: string;
    try {
      csv = readFileSync(sheet.csvPath, "utf8");
    } catch (e) {
      console.log(red(`Could not read ${sheet.csvPath} — skipping. (${(e as Error).message})`));
      continue;
    }
    const parsed = parseCsv(csv);
    const columns = inferColumns(parsed);
    process.stdout.write(dim("  summarizing... "));
    const summary = await generateStructuralSummary(parsed, columns);
    console.log(dim(`subject: ${summary.subject}`));

    for (const c of sheet.cases) {
      const label = `  intent: "${c.intent}"  (expected: ${c.expected})`;
      process.stdout.write(label + dim(" ... "));
      try {
        const spec = await generateAppSpec({ sheet: parsed, summary, columns, intent: c.intent });
        if (spec.archetype === c.expected) {
          console.log(green(`OK [${spec.archetype}]`));
          pass++;
        } else {
          console.log(red(`MISS [got ${spec.archetype}, expected ${c.expected}]`));
          fail++;
          failures.push({
            sheet: sheet.label,
            intent: c.intent,
            expected: c.expected,
            got: spec.archetype,
          });
        }
        const compact = compactSummary(spec);
        if (compact) console.log(dim(`    ${compact}`));
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        console.log(red(`ERR [${reason}]`));
        fail++;
        failures.push({ sheet: sheet.label, intent: c.intent, expected: c.expected, got: "ERROR", reason });
      }
    }
  }

  console.log(bold(`\nResults: ${green(`${pass} pass`)}, ${fail === 0 ? "0 fail" : red(`${fail} fail`)} (${pass + fail} total)`));
  if (failures.length) {
    console.log(red("\nFailures:"));
    for (const f of failures) {
      console.log(red(`  - ${f.sheet} :: "${f.intent}" :: expected ${f.expected}, got ${f.got}${f.reason ? "  (" + f.reason + ")" : ""}`));
    }
    process.exit(1);
  }
}

function compactSummary(spec: AppSpec): string {
  switch (spec.archetype) {
    case "dashboard": {
      const m = spec.metrics.map((x) => x.label).join(", ");
      return `metrics: [${m}]${spec.chart ? `  •  chart group_by: ${spec.chart.group_by}` : ""}`;
    }
    case "list":
      return `primary: ${spec.primary_field}, meta: [${(spec.meta_fields ?? []).join(", ")}]`;
    case "tracker": {
      const m = spec.metric;
      const field = "field" in m ? m.field : "";
      const value = "value" in m ? `=${m.value}` : "";
      const desc = m.kind + (field ? `(${field}${value})` : "");
      return `metric: ${desc}${spec.filters?.length ? `  •  ${spec.filters.length} filter(s)` : ""}`;
    }
    case "table":
      return `cols: [${spec.columns.join(", ")}]${spec.filter_chips?.length ? `  •  chips: [${spec.filter_chips.join(", ")}]` : ""}`;
    case "triage": {
      const pred = spec.queue_predicate.map((p) => `${p.field} ${p.op}`).join(" AND ");
      return `predicate: ${pred}${spec.reason_summary ? `  •  "${spec.reason_summary}"` : ""}`;
    }
  }
}

main().catch((e) => {
  console.error(red(`\nFatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}`));
  process.exit(1);
});
