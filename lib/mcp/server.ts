/**
 * Build a configured McpServer for a single connected source.
 *
 * The server is transport-agnostic — caller wires it to stdio or
 * StreamableHTTP. The `serverInfo` it advertises includes the source id so
 * clients distinguishing multiple Nexus stores see them as different servers.
 *
 * Tool lifecycle: tools are built once from the current store contents at
 * server-creation time. Newly-created views/snapshots/etc. become callable
 * only after the next start. This matches the spec's end-of-session check
 * (which exits the server between actions) and keeps tool listings stable
 * within a session.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "better-sqlite3";
import { openStore, closeStore } from "@/lib/kernel/store";
import type { SourceContext } from "./source-context";
import { buildRegistry, type ToolEntry } from "./registry";
import * as handlers from "./handlers";

export interface NexusMcpServer {
  mcp: McpServer;
  ctx: SourceContext;
  db: Database;
  tools: ToolEntry[];
  /** Close the SQLite handle. The McpServer itself is closed by its transport. */
  dispose(): void;
}

export function createNexusMcpServer(ctx: SourceContext): NexusMcpServer {
  const db = openStore(ctx.source.id);
  const tools = buildRegistry(ctx, db);

  const mcp = new McpServer(
    {
      name: `nexus-${ctx.source.id}`,
      version: "0.2.0",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: instructionsFor(ctx),
    }
  );

  for (const t of tools) {
    mcp.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.inputShape,
      },
      async (args: Record<string, unknown> | undefined) => {
        const result = await dispatch(ctx, db, t.handlerKey, args ?? {});
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );
  }

  return {
    mcp,
    ctx,
    db,
    tools,
    dispose() {
      closeStore(db);
    },
  };
}

async function dispatch(
  ctx: SourceContext,
  db: Database,
  handlerKey: string,
  args: Record<string, unknown>
): Promise<unknown> {
  // The MCP SDK has already validated args against the tool's inputShape, so
  // each handler can safely receive its narrowed shape via cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = args as any;

  if (handlerKey.startsWith("view:")) {
    return handlers.handleRunView(ctx, db, handlerKey.slice("view:".length), a);
  }
  if (handlerKey.startsWith("collection:")) {
    return handlers.handleRunCollection(ctx, db, handlerKey.slice("collection:".length));
  }
  if (handlerKey.startsWith("snapshot:")) {
    return handlers.handleRunSnapshot(ctx, db, handlerKey.slice("snapshot:".length));
  }

  switch (handlerKey) {
    case "describe_source":
      return handlers.handleDescribeSource(ctx, db);
    case "list_rows":
      return handlers.handleListRows(ctx, db, a);
    case "find_rows":
      return handlers.handleFindRows(ctx, db, a);
    case "list_derivations":
      return handlers.handleListDerivations(ctx, db, a);
    case "create_view":
      return handlers.handleCreateView(ctx, db, a);
    case "create_collection":
      return handlers.handleCreateCollection(ctx, db, a);
    case "create_branch":
      return handlers.handleCreateBranch(ctx, db, a);
    case "create_snapshot":
      return handlers.handleCreateSnapshot(ctx, db, a);
    case "annotate_row":
      return handlers.handleAnnotateRow(ctx, db, a);
    default:
      throw new Error(`Unknown handler '${handlerKey}'.`);
  }
}

function instructionsFor(ctx: SourceContext): string {
  const s = ctx.source;
  return [
    `You are connected to a local Nexus master sheet.`,
    s.subject ? `Subject: ${s.subject}` : null,
    s.description ? `Description: ${s.description}` : null,
    `${s.rowCount} rows. Columns: ${s.headers.join(", ")}.`,
    ``,
    `Start with describe_source to see Iris's interpretation of this sheet, then`,
    `prefer the saved query_* tools when they fit. Use find_rows for ad-hoc`,
    `predicates. Pass rowIds returned by any read tool into create_collection`,
    `or annotate_row to persist derivations.`,
    ``,
    `Persistence tools: create_collection saves a SUBSET of rows ("group by X",`,
    `"the rows I care about"). create_branch saves WHAT-IF cell edits without`,
    `mutating the master. create_view saves a re-runnable filter+sort.`,
    `create_snapshot freezes the current master rows. annotate_row attaches a`,
    `note/tag/status to one row.`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
