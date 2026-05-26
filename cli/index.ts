#!/usr/bin/env node
/**
 * Nexus CLI entrypoint. Run via `npm run nexus -- <cmd>` in dev (tsx) or
 * `npx nexus <cmd>` once published.
 */

import { Command } from "commander";
import { runConnect } from "./commands/connect";
import { runList } from "./commands/list";
import { runQuery } from "./commands/query";
import { runServe } from "./commands/serve";
import { runTools } from "./commands/tools";

const program = new Command();

program
  .name("nexus")
  .description("Nexus: local-first agent layer for tabular data.")
  .version("0.2.0-alpha");

program
  .command("connect <path-or-url>")
  .description("Register a master (CSV / XLSX / SQLite / Google Sheets URL) and run Iris's read.")
  .option("--table <name>", "SQLite source: pick a specific table")
  .option("--source <id>", "Force a specific source id (mostly for tests)")
  .option("--skip-iris", "Skip the LLM read; just register the source")
  .action(async (target: string, opts) => {
    try {
      await runConnect(target, opts);
    } catch (err) {
      process.stderr.write(`nexus connect: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List derivations for the active source (or every source with --all).")
  .option("--type <kind>", "view | collection | branch | snapshot | annotation")
  .option("--source <id>", "Restrict to one source id")
  .option("--all", "List across every connected source")
  .option("--sources", "List the connected master sources instead of their derivations")
  .action((opts) => {
    try {
      runList(opts);
    } catch (err) {
      process.stderr.write(`nexus list: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

program
  .command("query <view-name>")
  .description("Run a saved view and print rows.")
  .option("--source <id>", "Restrict to one source id")
  .option("--limit <n>", "Max rows to print", (v) => Number.parseInt(v, 10))
  .option("--json", "Emit JSON instead of a table")
  .action((viewName: string, opts) => {
    try {
      runQuery(viewName, opts);
    } catch (err) {
      process.stderr.write(`nexus query: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

program
  .command("tools")
  .description("Print MCP-style tool definitions Iris would emit for the source's derivations.")
  .option("--source <id>", "Restrict to one source id")
  .action((opts) => {
    try {
      runTools(opts);
    } catch (err) {
      process.stderr.write(`nexus tools: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

program
  .command("serve")
  .description("Start the Nexus MCP server for a connected source (HTTP by default).")
  .option("--source <id>", "Source id to serve. Defaults to the most-recently-connected source")
  .option("--port <n>", "HTTP port (default 5391)", (v) => Number.parseInt(v, 10))
  .option("--host <h>", "Bind address (default 127.0.0.1)")
  .option("--path <p>", "URL path for the MCP endpoint (default /mcp)")
  .option("--stdio", "Serve over stdio instead of HTTP (for `claude mcp add`)")
  .action(async (opts) => {
    try {
      await runServe(opts);
    } catch (err) {
      process.stderr.write(`nexus serve: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
