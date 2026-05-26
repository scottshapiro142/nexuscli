"use client";

/**
 * Nexus: Renderer dispatch.
 *
 * Discriminates on AppSpec.archetype and renders the matching component.
 * Each renderer is pure (spec + rows → UI), no LLM calls.
 *
 * When mode = "build", components reveal in a staggered sequence and the
 * Iris cursor overlay traces between them. mode = "instant" renders normally.
 */

import { useRef } from "react";
import type { AppSpec } from "@/lib/spec/types";
import Dashboard from "./Dashboard";
import ListView from "./List";
import Tracker from "./Tracker";
import TableView from "./Table";
import Triage from "./Triage";
import { BuildModeProvider, BuildItem, BuildStage, BuildCursor } from "./BuildMode";

type Row = Record<string, string>;
type Mode = "instant" | "build";

export default function Renderer({
  spec,
  rows,
  mode = "instant",
}: {
  spec: AppSpec;
  rows: Row[];
  mode?: Mode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <BuildModeProvider mode={mode}>
      <div ref={containerRef} style={{ position: "relative" }}>
        <BuildStage>
          <BuildItem>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  background: "#111",
                  color: "white",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                {spec.archetype}
              </span>
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{spec.title}</h3>
            </div>
          </BuildItem>
          {renderArchetype(spec, rows)}
        </BuildStage>
        {mode === "build" && <BuildCursor containerRef={containerRef} />}
      </div>
    </BuildModeProvider>
  );
}

function renderArchetype(spec: AppSpec, rows: Row[]) {
  switch (spec.archetype) {
    case "dashboard":
      return <Dashboard spec={spec} rows={rows} />;
    case "list":
      return <ListView spec={spec} rows={rows} />;
    case "tracker":
      return <Tracker spec={spec} rows={rows} />;
    case "table":
      return <TableView spec={spec} rows={rows} />;
    case "triage":
      return <Triage spec={spec} rows={rows} />;
  }
}
