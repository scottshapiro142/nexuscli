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
4. **Selective cloud publishing.** Coming in v0.3 — share specific derivations to the cloud while the master stays local.

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

That's the whole flow. Iris (the LLM that reads your sheet semantically) generates a description, columns get typed, suggested questions appear, and your agent gets a tool palette named after your data.

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
                                 and public Google Sheets URLs.

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
```

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

## What's in v0.2

- ✅ CSV / TSV / XLSX / SQLite / public Google Sheets ingestion
- ✅ Iris semantic read (column types, subject, suggested questions, row Tells)
- ✅ Derivations: views, collections, branches (what-if overlays), snapshots, annotations
- ✅ MCP server with auto-generated semantic tools per derivation
- ✅ HTTP and stdio transports
- ✅ Local SQLite kernel — every operation is persistent across runs

Coming in v0.3:

- Selective cloud publishing (share specific derivations, master stays local)
- Project concept (group multiple sheets, one MCP surface)
- Web UI (the local kernel's third surface, alongside CLI and MCP)
- Private Google Drive / Sheets support via OAuth

---

## Contributing

Bug reports and feature requests welcome at [github.com/scottshapiro142/nexuscli/issues](https://github.com/scottshapiro142/nexuscli/issues).

Pull requests welcome but please open an issue first to discuss approach — this is a young project and the surface is still hardening.

---

## License

MIT — see [LICENSE](./LICENSE).

Built by [PixelDesigns LLC](https://github.com/pixeldesignsllc).
