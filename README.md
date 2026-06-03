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
- **For private Google Sheets:** nothing extra — Nexus ships with a registered Google OAuth client, so `nexus auth login google` just works. (Contributors who want to BYO credentials can set `NEXUS_GOOGLE_CLIENT_ID` / `NEXUS_GOOGLE_CLIENT_SECRET`.)

Nexus uses an LLM (Iris) to pre-read your sheet — typed columns, structural summary, suggested views, and non-obvious patterns ("Tells"). Iris is optional. Three backends, auto-detected in this order:

1. **Claude Code** if `claude` is on your `PATH`. Uses your existing Claude Code auth — no second key. Each `nexus connect` consumes a small amount of your Claude usage.
2. **OpenRouter** if `OPENROUTER_API_KEY` is set (env or `~/.nexus/config.json`).
3. **Local** — no LLM. `nexus connect` ingests, types columns, and persists rows. Your agent forms its own description of the sheet on first MCP contact.

Force a specific backend with `--sampler local|claude-code|openrouter` on `nexus connect`, or `NEXUS_SAMPLER=...` env. Override the model picked by Claude Code or OpenRouter with `NEXUS_MODEL=...`.

To use OpenRouter, get a key at [openrouter.ai/keys](https://openrouter.ai/keys), then either:

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
  --sampler <backend>            Iris backend: local | claude-code | openrouter.
                                 Auto-detected if omitted.
  --skip-iris                    Don't run Iris at all (alias for --sampler local).

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

## How Nexus compares to similar tools

|  | **Nexus** | Datasette | DuckDB UI | Quadratic | Rill | OpenAI Code Interpreter | Copilot for Excel |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Runs entirely on your machine | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Reads CSV / XLSX / SQLite / Sheets | ✅ | ⚠️ SQLite-first | ✅ | ⚠️ in-app only | ⚠️ Parquet-first | ⚠️ upload | ❌ Excel only |
| Exposes data to your AI agent (MCP) | ✅ | ❌ | ❌ | ⚠️ in-app AI | ❌ | ❌ | ⚠️ in-app AI |
| Typed semantic layer (not raw cells) | ✅ Iris | ❌ | ❌ | ❌ | ✅ metrics | ❌ | ⚠️ partial |
| Non-destructive derivations (views, branches, snapshots) | ✅ | ❌ | ❌ | ❌ | ⚠️ dashboards | ❌ | ❌ |
| Open source | ✅ MIT | ✅ Apache | ✅ MIT | ⚠️ AGPL/cloud | ✅ Apache | ❌ | ❌ |

**When to pick which:**

- **Datasette** — best for publishing a SQLite database as a browsable web UI. Different audience (data journalism, public datasets), no agent integration.
- **DuckDB UI** — best for fast local analytical SQL over Parquet/CSV. Querying engine, not agent layer.
- **Quadratic / Copilot / Code Interpreter** — best when uploading is fine and you want a polished in-app AI experience. Nexus exists for the case when uploading is *not* fine.
- **Rill** — best for local-first BI dashboards. Overlapping local-first ethos; different primitive (dashboards vs. agent tools).
- **Nexus** — best when you want your existing AI agent (Claude Code, Cursor, any MCP client) to query your spreadsheets *in place*, without uploading, with a non-destructive layer for what-ifs.

---

## Security model — Google OAuth credentials

Nexus ships with a registered Google "Desktop app" OAuth client embedded in the binary. The client ID and secret are visible in the published source and npm tarball. This is deliberate:

1. **Google's Desktop app client type requires `client_secret` on every token exchange.** PKCE-only is not viable (empirically verified — see `lib/auth/google/client-creds.ts`). The token endpoint returns `400 client_secret is missing.` when the secret is omitted.
2. **Google explicitly states** the Desktop client secret "is obviously not treated as a secret" — see https://developers.google.com/identity/protocols/oauth2.
3. **Every comparable OSS CLI ships its embedded secret.** `gcloud`, `gh`, `firebase`, and `npm` all distribute Google OAuth client secrets in their binaries.

What this gives you:
- Zero configuration. Install Nexus and `nexus auth login google` works.
- PKCE still protects against auth-code interception.
- Your refresh token, your scope, your data — all on your machine.

What this means for the client identity:
- Nexus users authenticate as themselves to Google, *via* the registered PixelDesigns "Nexus" app. The consent screen shows "Nexus wants to access your Google Sheets."
- PixelDesigns can see, in the GCP Console audit log, that a given Google account granted Nexus access at a given time. PixelDesigns cannot see the data — it never passes through PixelDesigns infrastructure.

To use your own credentials instead (uncommon, but supported): set `NEXUS_GOOGLE_CLIENT_ID` and `NEXUS_GOOGLE_CLIENT_SECRET` in the environment. They override the embedded constants.

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
