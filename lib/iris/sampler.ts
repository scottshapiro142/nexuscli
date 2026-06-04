/**
 * Sampler — the abstraction for "give me a model completion."
 *
 * Iris's four generators (structural summary, tells, suggests, spec) all reduce
 * to "send a prompt, get text back, parse JSON." This interface lets them stay
 * dumb about WHERE the model lives.
 *
 * Three backends ship today:
 *   - local        — no LLM. complete() throws. The agent forms its own
 *                    description on the MCP side using raw column stats.
 *   - claude-code  — shells out to `claude -p`. Uses the user's existing
 *                    Claude Code auth. No second API key.
 *   - openrouter   — the original path. Requires OPENROUTER_API_KEY.
 *
 * Resolution order (highest wins):
 *   1. opts.force (explicit --sampler flag)
 *   2. NEXUS_SAMPLER env
 *   3. `claude` on PATH                → claude-code
 *   4. OPENROUTER_API_KEY set anywhere → openrouter
 *   5. local
 */

import { execFileSync } from "node:child_process";
import { getOpenRouterKey } from "@/lib/kernel/config";
import { localSampler } from "./samplers/local";
import { claudeCodeSampler } from "./samplers/claude-code";
import { openrouterSampler } from "./samplers/openrouter";

export type SamplerKind = "local" | "claude-code" | "openrouter";

export interface SampleRequest {
  prompt: string;
  maxTokens?: number;
  /** Backend hint: ask for JSON object output where the backend supports it. */
  jsonObject?: boolean;
}

export interface Sampler {
  readonly kind: SamplerKind;
  /**
   * False only for the local backend. Callers should branch on this and skip
   * Iris work entirely rather than call complete() and catch.
   */
  readonly canSample: boolean;
  complete(args: SampleRequest): Promise<string>;
}

export interface ResolveOpts {
  force?: SamplerKind;
}

export async function resolveSampler(opts: ResolveOpts = {}): Promise<Sampler> {
  const explicit = opts.force ?? (process.env.NEXUS_SAMPLER as SamplerKind | undefined);
  if (explicit) return buildSampler(explicit, { forced: true });
  if (hasClaudeCodeOnPath()) return buildSampler("claude-code");
  if (getOpenRouterKey()) return buildSampler("openrouter");
  return buildSampler("local");
}

function buildSampler(kind: SamplerKind, opts: { forced?: boolean } = {}): Sampler {
  switch (kind) {
    case "local":
      return localSampler;
    case "claude-code":
      if (opts.forced && !hasClaudeCodeOnPath()) {
        throw new Error(
          "Sampler 'claude-code' requested but `claude` was not found on PATH. " +
            "Install Claude Code (https://claude.com/code) or pick a different --sampler."
        );
      }
      return claudeCodeSampler;
    case "openrouter":
      if (opts.forced && !getOpenRouterKey()) {
        throw new Error(
          "Sampler 'openrouter' requested but no OPENROUTER_API_KEY is set. " +
            "Run `nexus config set-key <key>` or export OPENROUTER_API_KEY."
        );
      }
      return openrouterSampler;
  }
}

/**
 * Cheap PATH probe. We only need to know `claude` is executable — version
 * checks happen lazily in the backend.
 */
export function hasClaudeCodeOnPath(): boolean {
  try {
    execFileSync("claude", ["--version"], { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}
