# Nexus

**Local-first agent layer for tabular data.**

Drop any CSV, XLSX, or SQLite file. Get a local MCP server your AI agent can query and manipulate — without your data ever leaving your machine.

> Obsidian gave us local-first notes. Nexus does the same for structured data.

[Vision post](https://scottshapiro.substack.com/) · [Issues](https://github.com/scottshapiro142/nexuscli/issues) · MIT licensed

---

## Why

When you hand your data to AI tools today, it goes to their cloud. Salesforce + ChatGPT, Sheets + Gemini, Notion + Claude — same pattern.

Nexus inverts that. **Your data stays on your machine.** Claude Code, Cursor, and any other MCP-aware agent talks to a local server that exposes your sheets as semantically meaningful tools (`describe_source`, `find_rows`, `create_collection`, …). The master sheet is never mutated — collections, branches (what-if cell overlays), views, snapshots, and annotations all layer on top non-destructively.

The four pillars:

1. **Universal input.** CSV, XLSX, SQLite, Google Sheets — one CLI, any tabular source.
2. **Agent-native.** Every sheet becomes an MCP server. Claude Code or Cursor sees it as a domain-specific tool palette.
3. **Non-destructive derivations.** Save subsets, what-if scenarios, filters, point-in-time snapshots, and row annotations — all without touching the master.
4. **Selective cloud publishing.** Coming in v0.3.x — share specific derivations to the cloud while the master stays local.

---

## Install & first run (under 60 seconds)

```bash
# 1. Point Nexus at any local sheet
npx @pixeldesigns/nexus connect ~/Downloads/customers.csv

# 2. Start the MCP server (HTTP on localhost:5391/mcp by default)
npx @pixeldesigns/nexus serve

# 3. In another terminal, connect Claude Code to it
claude mcp add --transport http nexus http://localhost:5391/mcp
claude
> what does this sheet contain?
> find stale customers and draft outreach emails
> save the stale customers as a collection called "needs-outreach"
```

That's the whole local-file flow. Iris (the LLM that reads your sheet semantically) generates a description, columns get typed, suggested questions appear, and your agent gets a tool palette named after your data.

### Private Google Sheets first run

Public Google Sheets work without auth when the sheet is shared as “Anyone with the link → Viewer.” Private sheets need a one-time Google sign-in:

```bash
# 1. Sign in once. The top-level alias is equivalent.
nexus auth login google
# or: nexus login google

# 2. Quote the URL so shells do not treat ? or #gid as syntax.
nexus connect "https://docs.google.com/spreadsheets/d/<sheet-id>/edit#gid=0"

# 3. Query saved views from the cached latest rows without reconnecting.
nexus query <view-name>
```

Nexus still tries the public CSV export first. If Google responds with a private/login page and you have Google OAuth tokens, Nexus uses the Sheets API v4, converts those rows into the same CSV ingestion pipeline, and stores the latest master snapshot locally for later `nexus query` runs.

### Going faster after the first run

Install globally so the command is just `nexus`:

```bash
npm install -g @pixeldesigns/nexus
nexus connect ~/Downloads/customers.csv
nexus serve
```

---

## Requirements

- **Node.js 20+**
- **An OpenRouter API key** for Iris's semantic read of your sheet. Iris is what gives you typed columns, suggested questions, and Tells. Without it you can still `nexus connect <file> --skip-iris` to register the source as raw rows only.
- **For private Google Sheets:** a Google OAuth client configured for Nexus. In development, Nexus reads `NEXUS_GOOGLE_CLIENT_ID` / `NEXUS_GOOGLE_CLIENT_SECRET` (or the `GOOGLE_OAUTH_CLIENT_*` aliases) from the environment.

Get a key at [openrouter.ai/keys](https://openrouter.ai/keys), then either:

```bash
# Option A: store it once (writes ~/.nexus/config.json, chmod 600)
nexus config set-key sk-or-...

# Option B: export per-shell (env always wins over the stored key)
export OPENROUTER_API_KEY=sk-or-...
```

Check what's set with `nexus config get`. Remove the stored key with `nexus config unset-key`.

---

## Commands

```
nexus connect <path-or-url>    Register a sheet/database as a master source.
                                 Supports: .csv, .tsv, .xlsx, .xls, .sqlite,
                                 and public/private Google Sheets URLs.

nexus list                      List derivations (views, collections,
                                 branches, snapshots, annotations) for the
                                 active source.

nexus list --sources            List every connected master source.

nexus query <view-name>         Run a saved view and print rows.

nexus tools                     Print the MCP tool definitions Iris exposes
                                 for the active source.

nexus serve                     Start the MCP server.
  --port <n>                    HTTP port (default 5391)
  --host <h>                    Bind address (default 127.0.0.1)
  --stdio                       Serve over stdio (for `claude mcp add` stdio mode)

nexus config get                Show resolved config (secrets masked).
nexus config set-key [<key>]    Store OpenRouter API key (or pipe via stdin).
nexus config unset-key          Remove the stored key.
nexus config path               Print the config file path.

nexus auth login google         Sign in to Google for private Sheets access.
                                Alias: nexus login google
  --force                       Force re-consent / refresh-token rotation.

nexus auth logout google        Remove stored Google OAuth tokens.
                                Alias: nexus logout google
```

### Private Google Sheets

Public Google Sheets still work through the no-auth CSV export path. For private sheets, sign in once:

```bash
nexus auth login google         # or: nexus login google
nexus connect "https://docs.google.com/spreadsheets/d/<sheet-id>/edit#gid=0"
```

Nexus first tries the public CSV export URL. If Google returns a private/login response and Google OAuth tokens are available, it falls back to the Google Sheets API and then feeds the returned rows through the same CSV parser used by local/public sheets. Stored Google tokens live under `~/.nexus/auth/google.json` with owner-only file permissions and can be removed with `nexus auth logout google` or `nexus logout google`.

Troubleshooting:

- **Shell says `no matches found` or mangles the URL:** quote Google Sheet URLs. `?` and `#gid=0` have meaning in shells like zsh.
- **`Missing Google OAuth client credentials`:** set `NEXUS_GOOGLE_CLIENT_ID` and `NEXUS_GOOGLE_CLIENT_SECRET` in the environment, or use the documented local development aliases.
- **Google did not return a refresh token:** run `nexus auth login google --force` to force the consent screen and rotate the refresh token.
- **Session expired or revoked:** run `nexus auth login google` again.
- **Permission denied from Google:** make sure the signed-in account can view the sheet, or switch the sheet to “Anyone with the link → Viewer” and use the public path.

---

## Connecting from Claude Code

**HTTP transport (recommended):**

```bash
nexus serve --port 5391
claude mcp add --transport http nexus http://localhost:5391/mcp
```

**stdio transport (Claude Code launches Nexus itself):**

```bash
claude mcp add nexus -- npx @pixeldesigns/nexus serve --stdio
```

Once added, `/mcp` inside Claude Code shows Nexus's tools, including auto-generated ones (`query_<your-view>`, `read_<your-collection>`) that reflect the derivations you've saved.

---

## Where your data lives

Everything stays in `~/.nexus/<source-hash>/` — a SQLite database for derivations + the master sheet metadata. Nothing is uploaded.

To inspect:

```bash
ls ~/.nexus/
```

To remove a connected source, delete its directory.

---

## What's in v0.3.0

- ✅ CSV / TSV / XLSX / SQLite / public Google Sheets ingestion
- ✅ Private Google Sheets ingestion through Google OAuth and Sheets API v4
- ✅ Top-level Google auth aliases: `nexus login google` and `nexus logout google`
- ✅ Cached `master.latest` rows so `nexus query <view>` can run after `connect` without refetching a private sheet
- ✅ Iris semantic read (column types, subject, suggested questions, row Tells)
- ✅ Derivations: views, collections, branches (what-if overlays), snapshots, annotations
- ✅ MCP server with auto-generated semantic tools per derivation
- ✅ HTTP and stdio transports
- ✅ Local SQLite kernel — every operation is persistent across runs
- ✅ Release-quality hardening: lint, type-check, build, package dry-run, and Sheets ingestion/query-cache tests

Deferred to v0.3.x:

- Selective cloud publishing (share specific derivations, master stays local)
- Project concept (group multiple sheets, one MCP surface)
- Web UI (the local kernel's third surface, alongside CLI and MCP)

---

## Contributing

Bug reports and feature requests welcome at [github.com/scottshapiro142/nexuscli/issues](https://github.com/scottshapiro142/nexuscli/issues).

Pull requests welcome but please open an issue first to discuss approach — this is a young project and the surface is still hardening.

---

## License

MIT — see [LICENSE](./LICENSE).

Built by [PixelDesigns LLC](https://github.com/pixeldesignsllc).
