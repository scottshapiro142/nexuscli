/**
 * Nexus kernel: content hashing.
 *
 * A "sheet hash" identifies a connected master. It's derived from the
 * normalized sheet content (headers + rows, in canonical form) so the same
 * sheet produced from two different paths still maps to the same store.
 *
 * Note: this is intentionally content-addressed. If the user edits the master
 * upstream the hash changes — the kernel can detect drift by comparing the
 * current content hash to the Source's stored contentHash.
 */

import { createHash } from "node:crypto";
import type { ParsedSheet } from "@/lib/sheets/fetch-csv";

/**
 * sha256(headers \n row1 \n row2 …) — rows joined with  (record separator),
 * cells joined with  (unit separator) to avoid commas/quotes ambiguity.
 *
 * Returns a 16-char prefix; full 64-char digest is overkill for a directory name
 * and the collision risk on user-local data is negligible.
 */
export function hashSheet(sheet: ParsedSheet): string {
  const h = createHash("sha256");
  const RS = "";
  const US = "";

  h.update(sheet.headers.join(US));
  h.update(RS);

  for (const row of sheet.rows) {
    const cells = sheet.headers.map((col) => (row[col] ?? "").trim());
    h.update(cells.join(US));
    h.update(RS);
  }

  return h.digest("hex").slice(0, 16);
}

/**
 * A short, stable id for a row. We don't use array index because filtering and
 * sorting reshuffle indices; instead we hash the row's cell values. This means
 * two rows with identical cells get the same id, which is the right behavior
 * for our purposes (deduping is a feature, not a bug).
 */
export function hashRow(headers: string[], row: Record<string, string>): string {
  const h = createHash("sha256");
  const US = "";
  const cells = headers.map((col) => (row[col] ?? "").trim());
  h.update(cells.join(US));
  return "r_" + h.digest("hex").slice(0, 12);
}

/**
 * sha256 of an arbitrary string. Used for snapshot.contentHash on AppSpec JSON.
 */
export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
