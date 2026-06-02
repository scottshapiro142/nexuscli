/**
 * Nexus: Fetch and parse Google Sheets as CSV.
 *
 * Public sheets go through the CSV export endpoint (no auth, one round-trip).
 * Private sheets fall back to Sheets API v4 if the user is signed in.
 */

import { loadTokens } from "@/lib/auth/google";
import type { SheetRef } from "./parse-url";
import { fetchSheetViaApi } from "./google-api";

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
  rawRowCount: number;
};

/**
 * Auth-aware Google Sheet fetcher. Returns CSV text.
 *
 * Strategy:
 *   1. Try public CSV export (cheapest, no auth).
 *   2. On 401/403 or HTML-login response, fall back to Sheets API v4 if signed in.
 *   3. If not signed in, throw with a `nexus auth login google` hint.
 */
export async function fetchGoogleSheet(ref: SheetRef): Promise<string> {
  const res = await fetch(ref.csvUrl, {
    redirect: "follow",
    headers: { Accept: "text/csv,*/*" },
  });

  if (res.ok) {
    const text = await res.text();
    if (!looksLikeHtml(text)) return text;
    // Google returned an HTML login page for a private sheet — try auth path.
  } else if (res.status !== 401 && res.status !== 403) {
    throw new Error(`Couldn't fetch the sheet (status ${res.status}).`);
  }

  if (!loadTokens()) {
    throw new Error(
      `That sheet isn't public. Run \`nexus auth login google\` to grant Nexus read access, then try again.\n` +
        `(Or, in Google Sheets, click Share → "Anyone with the link" → Viewer for the public-only path.)`
    );
  }

  return await fetchSheetViaApi(ref);
}

/**
 * Direct public-CSV fetch — kept for callers that explicitly want the no-auth path.
 */
export async function fetchSheetCsv(csvUrl: string): Promise<string> {
  const res = await fetch(csvUrl, {
    redirect: "follow",
    headers: { Accept: "text/csv,*/*" },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "That sheet isn't public. In Google Sheets, click Share, then set 'Anyone with the link' to Viewer."
    );
  }
  if (!res.ok) {
    throw new Error(`Couldn't fetch the sheet (status ${res.status}).`);
  }

  const text = await res.text();
  if (looksLikeHtml(text)) {
    throw new Error(
      "That sheet isn't public. In Google Sheets, click Share, then set 'Anyone with the link' to Viewer."
    );
  }

  return text;
}

function looksLikeHtml(text: string): boolean {
  return text.trimStart().toLowerCase().startsWith("<");
}

export function parseCsv(text: string): ParsedSheet {
  const rows = parseCsvToRows(text);
  if (rows.length === 0) {
    return { headers: [], rows: [], rawRowCount: 0 };
  }

  const headers = rows[0].map((h, i) => (h?.trim() ? h.trim() : `column_${i + 1}`));
  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell !== ""));

  const records = dataRows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = row[i] ?? "";
    });
    return record;
  });

  return {
    headers,
    rows: records,
    rawRowCount: dataRows.length,
  };
}

/**
 * Minimal CSV tokenizer. Handles:
 *  - quoted fields containing commas
 *  - escaped quotes via ""
 *  - \r\n and \n row terminators
 */
function parseCsvToRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Flush trailing field/row if no terminal newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
