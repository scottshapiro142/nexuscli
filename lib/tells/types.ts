/**
 * Nexus Tells: insight-level observations Iris produces about a sheet.
 *
 * These are NOT computed stats. They are cross-column patterns and
 * non-obvious relationships — the kind of thing a human reading the sheet
 * for the first time would react to with "huh, I didn't notice that."
 *
 * The LLM produces the observation. When there's a clean filter that
 * isolates the rows the insight is about, it includes one — so a user can
 * click into the relevant slice. Insights without clean filters render as
 * standalone observations.
 */

import type { Filter } from "@/lib/spec/types";

export type TellKind =
  | "bias"          // a category systematically tilts one way
  | "anchor"        // an order effect — first / earliest / latest changes outcomes
  | "drift"         // change over time
  | "anomaly"       // a small subset behaves very differently
  | "agreement"     // pattern in agreement/disagreement across categories
  | "concentration" // a value/category is concentrated in unexpected ways
  | "correlation"   // two columns covary
  | "other";

export type Tell = {
  kind: TellKind;
  /** One- or two-sentence observation, written for display. */
  phrase: string;
  /** Filter isolating the rows the insight is about — only when there's a clean predicate. */
  predicate?: Filter[];
};
