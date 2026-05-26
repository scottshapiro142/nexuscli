/**
 * `nexus tools` — print MCP-style tool definitions Iris would emit for the
 * derivations in a source.
 *
 * B2 (NEX-10) will plug this into a real MCP server. For now we emit the
 * Anthropic / OpenAI function-calling tool schema so a developer can copy it
 * into a Claude Code config or sanity-check the names Iris has chosen.
 *
 * Conventions:
 *   - Each View becomes a tool named `query_<view_name>` (slugified).
 *   - Each Snapshot of flavor "appspec" becomes a tool `render_<name>` (no-op
 *     today, advisory).
 *   - Sheet-level metadata becomes a tool `describe_source`.
 */

import { openStore, closeStore, listViews, listSnapshots } from "@/lib/kernel/store";
import { resolveSourceId } from "../util";
import { metaPath } from "@/lib/kernel/paths";
import * as fs from "node:fs";
import type { Source } from "@/lib/kernel/types";

export interface ToolsOpts {
  source?: string;
}

interface McpTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required: string[];
  };
}

export function runTools(opts: ToolsOpts): void {
  const sourceId = resolveSourceId(opts.source);
  const db = openStore(sourceId);
  try {
    const source = readMeta(sourceId);
    const tools: McpTool[] = [];

    tools.push({
      name: "describe_source",
      description: source?.subject
        ? `Describe the connected master. ${source.subject}. ${source.description ?? ""}`.trim()
        : `Describe the connected master at ${sourceId}.`,
      input_schema: { type: "object", properties: {}, required: [] },
    });

    for (const v of listViews(db, sourceId)) {
      const slug = v.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
      tools.push({
        name: `query_${slug}`,
        description:
          `Run the saved view '${v.title ?? v.name}'. ` +
          (v.description ?? "Returns the matching rows.") +
          ` Filters: ${v.filters.length}. ${v.sort ? `Sort: ${v.sort.field} ${v.sort.direction}. ` : ""}` +
          (v.columns.length > 0 ? `Columns: ${v.columns.join(", ")}.` : "All columns."),
        input_schema: {
          type: "object",
          properties: {
            limit: { type: "integer", description: "Max rows to return. Defaults to the view's stored limit." },
          },
          required: [],
        },
      });
    }

    for (const s of listSnapshots(db, sourceId)) {
      if (s.flavor !== "appspec") continue;
      const slug = s.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
      tools.push({
        name: `render_${slug}`,
        description: `Render the AppSpec snapshot '${s.title ?? s.name}' (archetype: ${s.appSpec?.archetype}). Advisory in v0.2.`,
        input_schema: { type: "object", properties: {}, required: [] },
      });
    }

    process.stdout.write(JSON.stringify({ source: sourceId, tools }, null, 2) + "\n");
  } finally {
    closeStore(db);
  }
}

function readMeta(sourceId: string): Source | null {
  const p = metaPath(sourceId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Source;
  } catch {
    return null;
  }
}
