/**
 * Small id generator. Time-ordered prefix + random suffix — sortable, opaque,
 * no external dependency. Good enough for local derivation IDs; not a UUID.
 */

import { randomBytes } from "node:crypto";

export function newId(prefix = ""): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(6).toString("hex");
  return prefix ? `${prefix}_${time}${rand}` : `${time}${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Convert any user string to a slug-safe name for derivation.name lookups. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
