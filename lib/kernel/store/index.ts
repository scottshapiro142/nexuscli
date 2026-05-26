/**
 * Public surface of the kernel store. Consumers import from here only.
 */

import type { Database } from "better-sqlite3";
import type { Derivation, DerivationKind } from "@/lib/kernel/types";
import { listViews } from "./views";
import { listCollections } from "./collections";
import { listBranches } from "./branches";
import { listSnapshots } from "./snapshots";
import { listAnnotations } from "./annotations";

export * from "./db";
export * from "./migrations";
export * from "./sources";
export * from "./views";
export * from "./collections";
export * from "./branches";
export * from "./snapshots";
export * from "./annotations";

export interface ListAllOpts {
  kind?: DerivationKind;
  sourceId?: string;
}

export function listAll(db: Database, opts: ListAllOpts = {}): Derivation[] {
  const { kind, sourceId } = opts;
  const out: Derivation[] = [];
  if (!kind || kind === "view") out.push(...listViews(db, sourceId));
  if (!kind || kind === "collection") out.push(...listCollections(db, sourceId));
  if (!kind || kind === "branch") out.push(...listBranches(db, sourceId));
  if (!kind || kind === "snapshot") out.push(...listSnapshots(db, sourceId));
  if (!kind || kind === "annotation") out.push(...listAnnotations(db, sourceId));
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}
