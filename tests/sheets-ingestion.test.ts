import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv } from "../lib/sheets/fetch-csv";
import { parseSheetUrl } from "../lib/sheets/parse-url";
import { resolveValuesRange, serializeCsv } from "../lib/sheets/google-api";

test("parseSheetUrl builds the public CSV export URL with gid", () => {
  const ref = parseSheetUrl("https://docs.google.com/spreadsheets/d/sheet_123/edit#gid=456");

  assert.deepEqual(ref, {
    sheetId: "sheet_123",
    gid: "456",
    csvUrl: "https://docs.google.com/spreadsheets/d/sheet_123/export?format=csv&gid=456",
  });
});

test("serializeCsv preserves quoted commas, quotes, and newlines from Sheets API rows", () => {
  const csv = serializeCsv([
    ["Name", "Notes"],
    ["Odysseus", "Builds apps from prompts"],
    ["Quote", "A \"real\" comma, plus\nnewline"],
  ]);

  assert.equal(
    csv,
    'Name,Notes\nOdysseus,Builds apps from prompts\nQuote,"A ""real"" comma, plus\nnewline"'
  );

  const parsed = parseCsv(csv);
  assert.deepEqual(parsed.headers, ["Name", "Notes"]);
  assert.deepEqual(parsed.rows[1], {
    Name: "Quote",
    Notes: 'A "real" comma, plus\nnewline',
  });
});

test("resolveValuesRange escapes sheet titles for Google Sheets A1 syntax", () => {
  assert.equal(resolveValuesRange("Sheet1"), "'Sheet1'");
  assert.equal(resolveValuesRange("O'Brien, Import"), "'O''Brien, Import'");
});
