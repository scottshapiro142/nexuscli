/**
 * Nexus: Fetch and parse a public Google Sheet as CSV.
 *
 * No dependencies. Tiny CSV parser handles quoted fields with commas and
 * escaped quotes, which is what Google's export produces.
 */

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
  rawRowCount: number;
};

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

  // Google returns an HTML login page instead of CSV for private sheets.
  // The body starts with "<!DOCTYPE" or "<HTML" in that case.
  if (text.trimStart().toLowerCase().startsWith("<")) {
    throw new Error(
      "That sheet isn't public. In Google Sheets, click Share, then set 'Anyone with the link' to Viewer."
    );
  }

  return text;
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
