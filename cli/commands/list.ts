/**
 * `nexus list` — list derivations across all sources, or one source.
 *
 *   nexus list                       — every derivation in the most recently connected source
 *   nexus list --source <id>         — every derivation in one source
 *   nexus list --type=view           — filter by kind
 *   nexus list --all                 — every derivation across every connected source
 *   nexus list --sources             — list connected masters instead
 */

import { listSources, openStore, closeStore, listAll } from "@/lib/kernel/store";
import type { DerivationKind } from "@/lib/kernel/types";
import { DERIVATION_KINDS } from "@/lib/kernel/types";
import { resolveSourceId, printTable, bold, dim, fail } from "../util";

export interface ListOpts {
  type?: string;
  source?: string;
  all?: boolean;
  sources?: boolean;
}

export function runList(opts: ListOpts): void {
  if (opts.sources) {
    listSourcesCmd();
    return;
  }

  const kind = parseKind(opts.type);

  if (opts.all) {
    const all = listSources();
    if (all.length === 0) {
      process.stdout.write(`${dim("(no sources connected — run `nexus connect <path>`)")}\n`);
      return;
    }
    for (const s of all) {
      process.stdout.write(`\n${bold(s.id)}  ${dim(s.path)}\n`);
      listOneSource(s.id, kind);
    }
    return;
  }

  const sourceId = resolveSourceId(opts.source);
  process.stdout.write(`${bold(sourceId)}\n`);
  listOneSource(sourceId, kind);
}

function listOneSource(sourceId: string, kind?: DerivationKind): void {
  const db = openStore(sourceId);
  try {
    const items = listAll(db, { kind, sourceId });
    if (items.length === 0) {
      process.stdout.write(`  ${dim("(no derivations)")}\n`);
      return;
    }
    const rows = items.map((d) => [
      d.kind,
      d.name,
      d.title ?? "",
      d.author,
      d.updatedAt.slice(0, 19).replace("T", " "),
    ]);
    printTable(["kind", "name", "title", "author", "updated"], rows, { maxWidth: 48 });
  } finally {
    closeStore(db);
  }
}

function listSourcesCmd(): void {
  const all = listSources();
  if (all.length === 0) {
    process.stdout.write(`${dim("(no sources connected)")}\n`);
    return;
  }
  const rows = all
    .slice()
    .sort((a, b) => (a.lastReadAt < b.lastReadAt ? 1 : -1))
    .map((s) => [s.id, s.kind, s.subject ?? "", s.path, s.lastReadAt.slice(0, 19).replace("T", " ")]);
  printTable(["id", "kind", "subject", "path", "last_read"], rows, { maxWidth: 60 });
}

function parseKind(s?: string): DerivationKind | undefined {
  if (!s) return undefined;
  if (!(DERIVATION_KINDS as readonly string[]).includes(s)) {
    fail(`--type must be one of: ${DERIVATION_KINDS.join(", ")}`);
  }
  return s as DerivationKind;
}
