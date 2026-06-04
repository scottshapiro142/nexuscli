/**
 * Claude Code sampler — shells out to `claude -p`.
 *
 * Uses the user's existing Claude Code auth (OAuth or API key already
 * configured in `claude`). No second key for Nexus. The user pays through
 * their existing Claude subscription / billing.
 *
 * Prompt is piped via stdin (argv has a hard size limit on macOS/Linux that
 * the suggests prompt with row samples can blow past). Tools are disabled —
 * we want pure completion, not an agent loop. Session persistence is off so
 * Iris work doesn't pollute the user's `claude /resume` history.
 *
 * Model precedence: NEXUS_MODEL env var → fall back to whatever `claude` has
 * configured as its default. We deliberately do not hardcode a model here so
 * the user controls cost via their Claude Code settings.
 */

import { spawn } from "node:child_process";
import * as os from "node:os";
import type { SampleRequest, Sampler } from "../sampler";

const DEFAULT_TIMEOUT_MS = 90_000;

export const claudeCodeSampler: Sampler = {
  kind: "claude-code",
  canSample: true,
  async complete(args: SampleRequest) {
    const cliArgs = [
      "-p",
      "--output-format",
      "text",
      "--no-session-persistence",
      // Empty string disables all built-in tools — we want raw completion.
      "--tools",
      "",
    ];

    const model = process.env.NEXUS_MODEL;
    if (model) {
      cliArgs.push("--model", model);
    }

    const timeoutMs = parseTimeout(process.env.NEXUS_SAMPLER_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS;

    return await runClaude(cliArgs, args.prompt, timeoutMs);
  },
};

function runClaude(cliArgs: string[], stdinText: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Run from tmpdir so Claude Code doesn't pick up the user's project
    // CLAUDE.md / AGENTS.md / .claude/ config in this completion call. The
    // user's auth is independent of cwd.
    const child = spawn("claude", cliArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
      cwd: os.tmpdir(),
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`claude -p timed out after ${timeoutMs}ms`));
        return;
      }
      if (code !== 0) {
        const tail = stderr.trim().slice(-400) || "(no stderr)";
        reject(new Error(`claude -p exited ${code}: ${tail}`));
        return;
      }
      resolve(stdout.trim());
    });

    child.stdin.end(stdinText);
  });
}

function parseTimeout(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
