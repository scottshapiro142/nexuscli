/**
 * Nexus: Google Sheets URL parsing
 *
 * Public sheets only in v1. We use the CSV export endpoint to skip OAuth.
 * Any sheet shared "Anyone with the link can view" works.
 */

export type SheetRef = {
  sheetId: string;
  gid: string;
  csvUrl: string;
};

const SHEET_ID_RE = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
const GID_RE = /[#&?]gid=([0-9]+)/;

export function parseSheetUrl(input: string): SheetRef {
  const url = input.trim();

  const idMatch = url.match(SHEET_ID_RE);
  if (!idMatch) {
    throw new Error(
      "Could not find a sheet ID in that URL. Make sure it looks like https://docs.google.com/spreadsheets/d/..."
    );
  }
  const sheetId = idMatch[1];

  const gidMatch = url.match(GID_RE);
  const gid = gidMatch ? gidMatch[1] : "0";

  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  return { sheetId, gid, csvUrl };
}
