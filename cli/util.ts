/**
 * Shared CLI helpers — source resolution, terminal printing.
 */

import { listSources } from "@/lib/kernel/store";
import type { Source } from "@/lib/kernel/types";

/**
 * Resolve the "active" source for a command. Precedence:
 *   1. explicit --source <id-or-path>
 *   2. most-recently-connected (max lastReadAt)
 * Throws a user-friendly error if nothing matches.
 */
export function resolveSourceId(explicit?: string): string {
  const all = listSources();
  if (explicit) {
    const byId = all.find((s) => s.id === explicit);
    if (byId) return byId.id;
    const byPath = all.find((s) => s.path === explicit);
    if (byPath) return byPath.id;
    throw new Error(
      `No connected source matches '${explicit}'. Try \`nexus list\` to see what's registered, or \`nexus connect ${explicit}\`.`
    );
  }
  if (all.length === 0) {
    throw new Error("No sources connected yet. Try `nexus connect <path-or-url>`.");
  }
  const newest = all.slice().sort((a, b) => (a.lastReadAt < b.lastReadAt ? 1 : -1))[0];
  return newest.id;
}

export function fail(msg: string, code = 1): never {
  process.stderr.write(`nexus: ${msg}\n`);
  process.exit(code);
}

/** Pretty single-column key/value lines for short reports. */
export function printKV(pairs: Record<string, string | number | undefined>): void {
  const keys = Object.keys(pairs);
  const w = Math.max(...keys.map((k) => k.length));
  for (const k of keys) {
    const v = pairs[k];
    if (v === undefined) continue;
    process.stdout.write(`  ${k.padEnd(w)}  ${v}\n`);
  }
}

/** Minimal ASCII table. Truncates cell content over `maxWidth` chars. */
export function printTable(headers: string[], rows: string[][], opts: { maxWidth?: number } = {}): void {
  const maxWidth = opts.maxWidth ?? 40;
  const widths = headers.map((h, i) =>
    Math.min(
      maxWidth,
      Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length))
    )
  );
  const cell = (s: string, w: number) => {
    const t = s.length > w ? s.slice(0, w - 1) + "" : s;
    return t.padEnd(w);
  };
  const line = (chars: string[]) => "  " + chars.join("  ") + "\n";
  process.stdout.write(line(headers.map((h, i) => cell(h, widths[i]))));
  process.stdout.write(line(widths.map((w) => "-".repeat(w))));
  for (const r of rows) {
    process.stdout.write(line(r.map((c, i) => cell(String(c ?? ""), widths[i]))));
  }
}

/** Truthy if stdout looks like an interactive TTY — used to gate color. */
export function isTty(): boolean {
  return Boolean(process.stdout.isTTY);
}

export function dim(s: string): string {
  return isTty() ? `\x1b[2m${s}\x1b[22m` : s;
}

export function bold(s: string): string {
  return isTty() ? `\x1b[1m${s}\x1b[22m` : s;
}

export function describeSource(s: Source): string {
  const subj = s.subject ? ` -- ${s.subject}` : "";
  return `${s.id}  ${s.kind}  ${s.path}${subj}`;
}
