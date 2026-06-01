/**
 * `nexus suggest` — list the Iris-authored suggestion views for the active source.
 *
 * Iris generates these during `nexus connect` and persists them as views with
 * author='iris'. This command surfaces them with a copy-pasteable
 * `nexus query <name>` for each.
 */

import { closeStore, getSource, listViews, openStore } from "@/lib/kernel/store";
import { bold, dim, fail, resolveSourceId } from "../util";

export interface SuggestOpts {
  source?: string;
}

export function runSuggest(opts: SuggestOpts): void {
  const sourceId = resolveSourceId(opts.source);
  const db = openStore(sourceId);
  try {
    const source = getSource(db, sourceId);
    const views = listViews(db, sourceId).filter((v) => v.author === "iris");

    const label = source?.subject || source?.path || sourceId;
    process.stdout.write(`${bold("Suggested for")} ${label}\n\n`);

    if (views.length === 0) {
      process.stdout.write(
        `  ${dim("(no suggestions yet — re-run `nexus connect` without --skip-iris)")}\n`
      );
      return;
    }

    const numWidth = String(views.length).length;
    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      const num = String(i + 1).padStart(numWidth, " ");
      const title = v.title ?? v.name;
      process.stdout.write(`  ${num}. ${bold(title)}\n`);
      if (v.description) {
        process.stdout.write(`     ${dim(v.description)}\n`);
      }
      process.stdout.write(`     ${dim("→")} nexus query ${v.name}\n`);
      if (i < views.length - 1) process.stdout.write("\n");
    }
  } finally {
    closeStore(db);
  }
}
