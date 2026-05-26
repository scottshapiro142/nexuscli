/**
 * Nexus: Read a local SQLite database file and expose one of its tables as a
 * ParsedSheet, matching the shape produced by fetch-csv.ts so the rest of the
 * pipeline (analyzeSheet, generateTells) can consume it unchanged.
 */

import Database from "better-sqlite3";
import * as fs from "node:fs";
import type { ParsedSheet } from "./fetch-csv";

const SQLITE_MAGIC = "SQLite format 3\0";
const SQLITE_EXTENSIONS = new Set([".sqlite", ".sqlite3", ".db"]);

export function isSqlitePath(filePath: string): boolean {
  try {
    const lower = filePath.toLowerCase();
    const dot = lower.lastIndexOf(".");
    if (dot >= 0 && SQLITE_EXTENSIONS.has(lower.slice(dot))) return true;

    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(16);
      const bytesRead = fs.readSync(fd, buf, 0, 16, 0);
      if (bytesRead < 16) return false;
      return buf.toString("binary") === SQLITE_MAGIC;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

export function listSqliteTables(
  filePath: string
): { name: string; rowCount: number; columnCount: number }[] {
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`
      )
      .all() as { name: string }[];

    return rows.map((r) => {
      const quoted = quoteIdent(r.name);
      const countRow = db.prepare(`SELECT COUNT(*) AS c FROM ${quoted}`).get() as
        | { c: number | bigint }
        | undefined;
      const colInfo = db.pragma(`table_info(${quoted})`) as unknown[];
      const rowCount = countRow ? Number(countRow.c) : 0;
      return { name: r.name, rowCount, columnCount: colInfo.length };
    });
  } finally {
    db.close();
  }
}

export function readSqliteAsSheet(args: {
  filePath: string;
  table?: string;
  limit?: number;
}): ParsedSheet & { tableName: string } {
  const { filePath, table, limit } = args;
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const userTables = (
      db
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
           ORDER BY name`
        )
        .all() as { name: string }[]
    ).map((r) => r.name);

    let target: string;
    if (table) {
      if (!userTables.includes(table)) {
        throw new Error(
          `Table "${table}" not found. Available tables: ${
            userTables.length ? userTables.join(", ") : "(none)"
          }.`
        );
      }
      target = table;
    } else if (userTables.length === 1) {
      target = userTables[0];
    } else if (userTables.length === 0) {
      throw new Error("This SQLite file has no user tables.");
    } else {
      throw new Error(
        `This SQLite file has multiple tables; specify one. Available: ${userTables.join(
          ", "
        )}.`
      );
    }

    assertSafeIdent(target);
    const quoted = quoteIdent(target);

    const cols = db.pragma(`table_info(${quoted})`) as { name: string }[];
    const headers = cols.map((c) => c.name);

    const cap = limit ?? 100_000;
    const stmt = db.prepare(`SELECT * FROM ${quoted} LIMIT ?`);
    const raw = stmt.all(cap) as Record<string, unknown>[];

    const rows = raw.map((row) => {
      const out: Record<string, string> = {};
      for (const h of headers) out[h] = cellToString(row[h]);
      return out;
    });

    return {
      headers,
      rows,
      rawRowCount: rows.length,
      tableName: target,
    };
  } finally {
    db.close();
  }
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint" || typeof v === "boolean") {
    return String(v);
  }
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return v.toString("hex");
  if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
  return String(v);
}

function assertSafeIdent(name: string): void {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("Invalid SQLite identifier.");
  }
  if (name.includes("\0")) {
    throw new Error("SQLite identifier contains NUL byte.");
  }
}

function quoteIdent(name: string): string {
  assertSafeIdent(name);
  return `"${name.replace(/"/g, '""')}"`;
}
