#!/usr/bin/env node
/**
 * Nexus CLI entrypoint. Run via `npm run nexus -- <cmd>` in dev (tsx) or
 * `npx nexus <cmd>` once published.
 */

import { Command } from "commander";
import { runConnect } from "./commands/connect";
import {
  runConfigGet,
  runConfigPath,
  runConfigSetKey,
  runConfigUnsetKey,
} from "./commands/config";
import { runGoogleLogin, runGoogleLogout } from "./commands/google-auth";
import { runList } from "./commands/list";
import { runQuery } from "./commands/query";
import { runServe } from "./commands/serve";
import { runSuggest } from "./commands/suggest";
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
  .command("suggest")
  .description("List Iris-generated suggestions for the active source.")
  .option("--source <id>", "Restrict to one source id")
  .action((opts) => {
    try {
      runSuggest(opts);
    } catch (err) {
      process.stderr.write(`nexus suggest: ${(err as Error).message}\n`);
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

const config = program
  .command("config")
  .description("Manage user settings stored in ~/.nexus/config.json.");

config
  .command("get")
  .description("Print current config (secrets masked).")
  .action(async () => {
    try {
      await runConfigGet();
    } catch (err) {
      process.stderr.write(`nexus config get: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

config
  .command("set-key [key]")
  .description("Store an OpenRouter API key. Reads stdin if piped, or prompts.")
  .action(async (key?: string) => {
    try {
      await runConfigSetKey(key);
    } catch (err) {
      process.stderr.write(`nexus config set-key: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

config
  .command("unset-key")
  .description("Remove the stored OpenRouter API key.")
  .action(async () => {
    try {
      await runConfigUnsetKey();
    } catch (err) {
      process.stderr.write(`nexus config unset-key: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

config
  .command("path")
  .description("Print the config file path.")
  .action(() => {
    try {
      runConfigPath();
    } catch (err) {
      process.stderr.write(`nexus config path: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

const auth = program
  .command("auth")
  .description("Manage authentication for external sources.");

function assertGoogleProvider(provider: string, commandName: string): void {
  if (provider !== "google") {
    process.stderr.write(`nexus ${commandName}: unknown provider '${provider}'. Try 'google'.\n`);
    process.exit(1);
  }
}

async function loginGoogle(provider: string, opts: { force?: boolean }, commandName: string): Promise<void> {
  try {
    assertGoogleProvider(provider, commandName);
    await runGoogleLogin(opts);
  } catch (err) {
    process.stderr.write(`nexus ${commandName}: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

async function logoutGoogle(provider: string, commandName: string): Promise<void> {
  try {
    assertGoogleProvider(provider, commandName);
    await runGoogleLogout();
  } catch (err) {
    process.stderr.write(`nexus ${commandName}: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

program
  .command("login <provider>")
  .description("Sign in to a provider (currently: google). Alias for `nexus auth login`.")
  .option("--force", "Force re-consent (re-issues the refresh token)")
  .action((provider: string, opts) => loginGoogle(provider, opts, "login"));

program
  .command("logout <provider>")
  .description("Sign out of a provider (currently: google). Alias for `nexus auth logout`.")
  .action((provider: string) => logoutGoogle(provider, "logout"));

auth
  .command("login <provider>")
  .description("Sign in to a provider (currently: google).")
  .option("--force", "Force re-consent (re-issues the refresh token)")
  .action((provider: string, opts) => loginGoogle(provider, opts, "auth login"));

auth
  .command("logout <provider>")
  .description("Sign out of a provider (currently: google).")
  .action((provider: string) => logoutGoogle(provider, "auth logout"));

program.parseAsync(process.argv);
