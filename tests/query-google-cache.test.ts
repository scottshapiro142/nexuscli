import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

async function importFresh(modulePath: string) {
  return import(`${pathToFileURL(join(process.cwd(), modulePath)).href}?t=${Date.now()}-${Math.random()}`);
}

test("query uses the cached master row snapshot for Google Sheets sources", async () => {
  const nexusHome = mkdtempSync(join(tmpdir(), "nexus-query-cache-"));
  const previousHome = process.env.NEXUS_HOME;
  process.env.NEXUS_HOME = nexusHome;

  try {
    const { openStore, closeStore, upsertSource, createView, createSnapshot } = await importFresh(
      "lib/kernel/store/index.ts"
    );
    const { ensureStoreDir, metaPath } = await importFresh("lib/kernel/paths.ts");
    const { runQuery } = await importFresh("cli/commands/query.ts");

    const source = {
      id: "google-source-1",
      kind: "google_sheets",
      path: "https://docs.google.com/spreadsheets/d/test-sheet/edit?gid=0#gid=0",
      headers: ["Issue", "Category", "Status"],
      rowCount: 2,
      contentHash: "hash-1",
      connectedAt: "2026-06-02T00:00:00.000Z",
      lastReadAt: "2026-06-02T00:00:00.000Z",
      subject: "Test Issues",
    };

    ensureStoreDir(source.id);
    const db = openStore(source.id);
    try {
      upsertSource(db, source);
      writeFileSync(metaPath(source.id), JSON.stringify(source, null, 2), "utf8");
      createSnapshot(db, {
        sourceId: source.id,
        name: "master.latest",
        title: "Latest master rows",
        flavor: "rows",
        headers: source.headers,
        rows: [
          { Issue: "Leaky gate", Category: "", Status: "Open" },
          { Issue: "Paint fence", Category: "Maintenance", Status: "Done" },
        ],
        author: "cli",
      });
      createView(db, {
        sourceId: source.id,
        name: "all-issues",
        title: "All Issues",
        filters: [],
        columns: ["Issue", "Status"],
        author: "cli",
      });
    } finally {
      closeStore(db);
    }

    let output = "";
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    try {
      runQuery("all-issues", { source: source.id });
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.match(output, /All Issues/);
    assert.match(output, /Leaky gate/);
    assert.match(output, /Paint fence/);
  } finally {
    if (previousHome === undefined) delete process.env.NEXUS_HOME;
    else process.env.NEXUS_HOME = previousHome;
    rmSync(nexusHome, { recursive: true, force: true });
  }
});
