/**
 * `nexus serve` — boot the MCP server for a connected source.
 *
 * Default transport: Streamable HTTP on http://127.0.0.1:5391/mcp — paste
 * that into Claude Code with `--mcp http://localhost:5391/mcp` and the tools
 * appear. Pass --stdio for the stdio transport used by `claude mcp add`.
 *
 * Prints the connection details and the full tool list at startup so users
 * see exactly what Iris is exposing. Shuts down cleanly on Ctrl-C.
 */

import { resolveSourceId, bold, dim, fail, printKV } from "../util";
import { loadSourceContext } from "@/lib/mcp/source-context";
import { createNexusMcpServer } from "@/lib/mcp/server";
import { serveOverHttp, serveOverStdio } from "@/lib/mcp/transport";

const DEFAULT_PORT = 5391;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PATH = "/mcp";

export interface ServeOpts {
  source?: string;
  port?: number;
  host?: string;
  path?: string;
  stdio?: boolean;
}

export async function runServe(opts: ServeOpts): Promise<void> {
  const sourceId = resolveSourceId(opts.source);
  // Progress goes to stderr so we never corrupt the stdio JSON-RPC stream.
  const ctx = await loadSourceContext(sourceId, {
    onProgress: (msg) => process.stderr.write(`  ${dim(msg)}\n`),
  });

  if (opts.stdio) {
    // stdio: a single client lives for the process lifetime, so one server
    // instance is correct. Any human-readable output would corrupt the
    // JSON-RPC stream on stdout, so logs go to stderr only.
    const server = createNexusMcpServer(ctx);
    process.stderr.write(
      `nexus serve: source=${sourceId} (${ctx.rows.length} rows) — ${server.tools.length} tools — stdio\n`
    );
    process.stderr.write(`nexus serve: ${server.tools.map((t) => t.name).join(", ")}\n`);

    const shutdown = () => {
      server.dispose();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    try {
      await serveOverStdio(server);
    } catch (err) {
      process.stderr.write(`nexus serve (stdio): ${(err as Error).message}\n`);
      server.dispose();
      process.exit(1);
    }
    return;
  }

  // HTTP: build a sample server for the startup printout (tool list, counts),
  // then dispose it. The transport spins up a fresh server per session via
  // the factory below — required because McpServer can only be connected to
  // one transport, and its Server cannot be re-initialized.
  const sample = createNexusMcpServer(ctx);
  const toolList = sample.tools.map((t) => ({
    name: t.name,
    title: t.title,
    kind: t.kind,
  }));
  const toolCount = sample.tools.length;
  sample.dispose();

  const port = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? DEFAULT_HOST;
  const path = opts.path ?? DEFAULT_PATH;

  let handle;
  try {
    handle = await serveOverHttp(() => createNexusMcpServer(ctx), { port, host, path });
  } catch (err) {
    fail(`Failed to bind ${host}:${port}: ${(err as Error).message}`);
  }

  process.stdout.write(`${bold("nexus serve")} — MCP server ready\n`);
  printKV({
    source: ctx.source.id,
    subject: ctx.source.subject ?? "(no subject)",
    rows: ctx.source.rowCount,
    endpoint: handle.url,
    tools: toolCount,
  });

  process.stdout.write(`\n${bold("Tools exposed")}\n`);
  for (const t of toolList) {
    const marker = t.kind === "mutate" ? "!" : " ";
    process.stdout.write(`  ${marker} ${t.name.padEnd(28)} ${dim(t.title)}\n`);
  }

  process.stdout.write(`\n${dim("Connect from Claude Code:")}\n`);
  process.stdout.write(
    `${dim(`  claude mcp add --transport http nexus ${handle.url}`)}\n`
  );
  process.stdout.write(
    `${dim(`  (or use --stdio mode to let Claude Code launch the server itself)`)}\n`
  );
  process.stdout.write(`${dim("Ctrl-C to stop.")}\n`);

  const shutdown = async () => {
    process.stdout.write(`\n${dim("shutting down…")}\n`);
    try {
      await handle.stop();
    } catch {
      // ignore
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise<never>(() => {});
}
