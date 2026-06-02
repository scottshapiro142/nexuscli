/**
 * Google Sheets API v4 client. Used for private sheets reached via OAuth.
 *
 * Two-call flow:
 *   1. spreadsheets.get with field mask → resolve gid → sheet title
 *   2. spreadsheets.values.get → fetch rows for that title
 *
 * Returns CSV text so the result drops into the existing parseCsv pipeline.
 */

import { withFreshAccessToken } from "@/lib/auth/google";
import type { SheetRef } from "./parse-url";

interface SheetProperties {
  sheetId: number;
  title: string;
}

interface SpreadsheetMeta {
  sheets: { properties: SheetProperties }[];
}

interface ValuesResponse {
  values?: string[][];
}

export async function fetchSheetViaApi(ref: SheetRef): Promise<string> {
  return withFreshAccessToken(async (accessToken) => {
    const title = await resolveSheetTitle(ref, accessToken);
    const rows = await fetchValues(ref.sheetId, title, accessToken);
    return serializeCsv(rows);
  });
}

async function resolveSheetTitle(ref: SheetRef, accessToken: string): Promise<string> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ref.sheetId)}` +
    `?fields=sheets.properties(sheetId,title)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await apiError(res, "spreadsheets.get");
  const meta = (await res.json()) as SpreadsheetMeta;
  const gid = Number.parseInt(ref.gid, 10);
  const match = meta.sheets.find((s) => s.properties.sheetId === gid);
  if (!match) {
    throw new Error(
      `Sheet gid=${ref.gid} not found in spreadsheet ${ref.sheetId}.`
    );
  }
  return match.properties.title;
}

async function fetchValues(
  spreadsheetId: string,
  title: string,
  accessToken: string
): Promise<string[][]> {
  const quoted = resolveValuesRange(title);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `/values/${encodeURIComponent(quoted)}?majorDimension=ROWS`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await apiError(res, "spreadsheets.values.get");
  const data = (await res.json()) as ValuesResponse;
  return data.values ?? [];
}

async function apiError(res: Response, op: string): Promise<Error> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? "";
  } catch {
    // ignore
  }
  const err = new Error(
    `Sheets API ${op} failed (${res.status})${detail ? `: ${detail}` : ""}`
  );
  (err as { status?: number }).status = res.status;
  return err;
}

export function resolveValuesRange(title: string): string {
  // Single-quote the title and escape internal single quotes (A1 syntax: 'O''Brien').
  return `'${title.replace(/'/g, "''")}'`;
}

export function serializeCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string | undefined): string {
  const s = value ?? "";
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
