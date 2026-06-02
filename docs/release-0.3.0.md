# NexusCLI 0.3.0 Release Plan

## Release theme

Private Google Sheets support with release-quality hardening.

Nexus 0.3.0 expands Google Sheets ingestion from public-only CSV exports to private sheets via Google OAuth while keeping the master data local and preserving the existing CSV parser/kernel/MCP flow.

## Scope

### Included

- `nexus auth login google` / `nexus auth logout google` command surface, plus top-level `nexus login google` / `nexus logout google` aliases.
- OAuth token storage under `~/.nexus/auth/google.json` with refresh for Google Sheets read access.
- Public-first Google Sheets ingestion:
  1. Try the existing public CSV export path.
  2. If Google returns a private/login response and OAuth tokens exist, use Sheets API v4.
  3. Serialize API rows back into CSV and reuse the same parser as local/public sheets.
- QA hardening:
  - ESLint ignores generated folders.
  - CLI TypeScript check passes.
  - Next build passes.
  - CLI bundle builds.
  - npm package dry-run contains only expected package files.
- Automated Sheets ingestion regression tests.
- Cached `master.latest` snapshot persistence so `nexus query <view>` can use the latest connected Google Sheets rows without forcing another live fetch.

### Deferred to 0.3.x

- Selective cloud publishing.
- Project grouping / multi-sheet MCP surface.
- Local web UI as a third surface.

## Verification checklist

Run from the repo root:

```bash
npm test
npm run lint
npx tsc -p tsconfig.cli.json --noEmit
npm run build:cli
npm run build
npm pack --dry-run
```

Expected results for the current local pass:

- `npm test`: passes Sheets ingestion, CLI auth alias, and Google Sheets query-cache tests.
- `npm run lint`: passes with no warnings.
- `npx tsc -p tsconfig.cli.json --noEmit`: passes.
- `npm run build:cli`: emits `dist/cli/index.js` successfully.
- `npm run build`: Next.js production build passes.
- `npm pack --dry-run`: package includes exactly:
  - `LICENSE`
  - `README.md`
  - `dist/cli/index.js`
  - `package.json`

## Manual smoke tests before publishing

Use a real private Google Sheet that the Google account can read.

```bash
npm run build:cli
node dist/cli/index.js auth login google --force
# Equivalent alias: node dist/cli/index.js login google --force
node dist/cli/index.js connect "https://docs.google.com/spreadsheets/d/<sheet-id>/edit#gid=0" --skip-iris
node dist/cli/index.js list --sources
node dist/cli/index.js query <view-name>
node dist/cli/index.js auth logout google
# Equivalent alias: node dist/cli/index.js logout google
```

Then test the public path still works:

```bash
node dist/cli/index.js connect "https://docs.google.com/spreadsheets/d/<public-sheet-id>/edit#gid=0" --skip-iris
node dist/cli/index.js list --sources
```

If running the non-`--skip-iris` path, verify `OPENROUTER_API_KEY` is configured through env or `nexus config set-key`.

## Release notes

### NexusCLI 0.3.0 — private Sheets, still local-first

NexusCLI 0.3.0 makes private Google Sheets usable from the same local-first agent workflow that already worked for CSV, XLSX, SQLite, and public Sheets.

The important change is not “Nexus talks to Google.” The important change is that your agent can now work with a private Sheet without turning the Sheet public and without moving the master dataset into someone else’s app. Nexus reads the sheet, normalizes it through the same ingestion pipeline, stores local derivations under `~/.nexus`, and exposes the result to MCP-aware agents from your machine.

What's new:

- Added Google OAuth sign-in for private Sheets: `nexus auth login google`.
- Added top-level auth aliases: `nexus login google` and `nexus logout google`.
- Added Google OAuth sign-out: `nexus auth logout google`.
- `nexus connect <google-sheet-url>` now tries the public CSV export first, then falls back to the Google Sheets API when the sheet is private and OAuth is configured.
- Sheets API rows are serialized into CSV and passed through the same ingestion pipeline used by local files and public sheets.
- `nexus connect` persists a `master.latest` row snapshot, and `nexus query <view>` can read that cache instead of forcing another Google fetch.
- Added automated regression tests for Sheets URL parsing, API row serialization, A1 sheet title escaping, CLI auth aliases, and Google Sheets query-cache behavior.
- Cleaned release hygiene: lint, CLI type-checking, Next build, CLI bundle, and npm package dry-run all pass locally.

What stays local-first:

- Your master data and derivations stay under `~/.nexus`.
- Google OAuth tokens stay on the local machine at `~/.nexus/auth/google.json` with owner-only permissions.
- The MCP server runs locally unless you explicitly expose it.
- Public Sheets still use the no-auth CSV export path when available.

Upgrade notes:

- Quote Google Sheets URLs in the shell: `nexus connect "https://docs.google.com/spreadsheets/d/<sheet-id>/edit#gid=0"`.
- If Google does not issue a refresh token, run `nexus auth login google --force`.
- If a session expires or is revoked, run `nexus auth login google` again.
- For dev/client setup, provide `NEXUS_GOOGLE_CLIENT_ID` and `NEXUS_GOOGLE_CLIENT_SECRET` in the environment.

Not in this release:

- Selective cloud publishing, project grouping, and the local web UI are intentionally deferred to 0.3.x so 0.3.0 can ship the private Sheets path cleanly.

## Publish gate

Do not publish until:

- Version is bumped from `0.2.2` to `0.3.0`.
- The manual private-sheet OAuth smoke test has been run with a real Google account.
- The final verification checklist passes after the version bump.
- `npm pack --dry-run` still shows only the expected package files.
