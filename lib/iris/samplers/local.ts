/**
 * Local sampler — the zero-config default.
 *
 * Does no LLM work. `nexus connect` checks `sampler.canSample` and skips Iris
 * entirely; the agent forms its own description on the MCP side using the raw
 * column stats and sample rows that ingestion already produces.
 *
 * complete() throws so any caller that bypasses the canSample guard surfaces
 * a clear error instead of silently misbehaving.
 */

import type { Sampler } from "../sampler";

export const localSampler: Sampler = {
  kind: "local",
  canSample: false,
  async complete() {
    throw new Error(
      "Local sampler cannot complete prompts. Check sampler.canSample before calling complete()."
    );
  },
};
