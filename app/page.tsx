"use client";

/**
 * Nexus — sheet → understanding → app.
 *
 * Layout:
 *   LEFT  — Iris (inputs, what she read, what she noticed, what she'd build).
 *           Everything she says lives here.
 *   MAIN  — only the live rendered app. The product.
 */

import { useRef, useState } from "react";
import type { AppSpec } from "@/lib/spec/types";
import type { Tell } from "@/lib/tells/types";
import Renderer from "@/components/render/Renderer";

type ReadResponse = {
  ref: { sheetId: string; gid: string } | null;
  source: string;
  sheet: { headers: string[]; rowCount: number; rows: Record<string, string>[] };
  columns: {
    name: string;
    type: string;
    nonEmptyCount: number;
    uniqueCount: number;
    sampleValues: string[];
    enumValues?: string[];
  }[];
  summary: { subject: string; description: string; suggestedIntents: string[] };
  tells: Tell[];
};

const EXAMPLE = {
  csvPath: "/examples/shipOrSkip-reviews.csv",
  fileName: "shipOrSkip-reviews.csv",
};

export default function Page() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReadResponse | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [suggestsLoading, setSuggestsLoading] = useState(false);
  const [suggestsError, setSuggestsError] = useState<string | null>(null);
  const [suggests, setSuggests] = useState<AppSpec[] | null>(null);
  const [activeSpec, setActiveSpec] = useState<AppSpec | null>(null);

  const [intent, setIntent] = useState("");
  const [customLoading, setCustomLoading] = useState(false);

  function resetAll() {
    setError(null);
    setData(null);
    setSuggests(null);
    setSuggestsError(null);
    setActiveSpec(null);
  }

  async function postRead(body: { url?: string; csv?: string; source?: string }) {
    setLoading(true);
    resetAll();
    setLoadingStage(body.url ? "Fetching sheet…" : "Reading file…");
    try {
      setLoadingStage("Iris is reading your sheet…");
      const res = await fetch("/api/sheet/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.");
      } else {
        const read = json as ReadResponse;
        setData(read);
        void fetchSuggests(read);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
      setLoadingStage("");
    }
  }

  async function fetchSuggests(read: ReadResponse) {
    setSuggestsLoading(true);
    setSuggestsError(null);
    setSuggests(null);
    try {
      const res = await fetch("/api/suggests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: read.sheet,
          summary: read.summary,
          columns: read.columns,
          tells: read.tells,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSuggestsError(json.error ?? "Iris couldn't propose apps.");
      } else {
        const apps = json.apps as AppSpec[];
        setSuggests(apps);
        const triage = apps.find((a) => a.archetype === "triage");
        const first = triage ?? apps[0];
        if (first) setActiveSpec(first);
      }
    } catch (e) {
      setSuggestsError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSuggestsLoading(false);
    }
  }

  async function onSubmitUrl() {
    if (!url) return;
    await postRead({ url });
  }

  async function onFileChosen(file: File) {
    setFileName(file.name);
    resetAll();
    const lower = file.name.toLowerCase();
    const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xls");

    if (isXlsx) {
      try {
        setLoading(true);
        setLoadingStage("Parsing spreadsheet…");
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setError("That spreadsheet has no sheets.");
          setLoading(false);
          return;
        }
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
        await postRead({ csv, source: `upload:${file.name}` });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read that file.");
        setLoading(false);
        setLoadingStage("");
      }
    } else {
      try {
        const csv = await file.text();
        await postRead({ csv, source: `upload:${file.name}` });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read that file.");
      }
    }
  }

  async function onTryExample() {
    try {
      setLoading(true);
      resetAll();
      setFileName(EXAMPLE.fileName);
      setLoadingStage("Loading example…");
      const csv = await (await fetch(EXAMPLE.csvPath)).text();
      await postRead({ csv, source: `example:${EXAMPLE.fileName}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the example.");
      setLoading(false);
      setLoadingStage("");
    }
  }

  async function onCustomBuild() {
    if (!data || !intent.trim()) return;
    setCustomLoading(true);
    setActiveSpec(null);
    try {
      const res = await fetch("/api/spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: data.sheet,
          summary: data.summary,
          columns: data.columns,
          intent: intent.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setActiveSpec(json.spec as AppSpec);
      } else {
        setSuggestsError(json.error ?? "Couldn't build a spec.");
      }
    } catch (e) {
      setSuggestsError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setCustomLoading(false);
    }
  }

  function newSheet() {
    setUrl("");
    setFileName(null);
    setIntent("");
    resetAll();
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        {/* LEFT — Iris's voice + inputs */}
        <aside style={leftColStyle}>
          <div style={leftScrollStyle}>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, margin: 0 }}>Nexus</h1>
            <p style={{ color: "#777", marginTop: 6, fontSize: 12, lineHeight: 1.5 }}>
              Iris reads any sheet, tells you what she notices, and builds the app for it.
            </p>

            {/* Inputs — shown when no data yet, compressed when data loaded */}
            {!data ? (
              <div style={{ marginTop: 22 }}>
                <label style={labelStyle}>Sheet URL</label>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="docs.google.com/spreadsheets/..."
                    style={inputStyle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && url && !loading) onSubmitUrl();
                    }}
                  />
                  <button onClick={onSubmitUrl} disabled={loading || !url} style={primaryBtn(loading || !url)}>
                    {loading ? "…" : "Read"}
                  </button>
                </div>

                <div style={dividerRow}>
                  <div style={dividerLine} />
                  <span>or</span>
                  <div style={dividerLine} />
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onFileChosen(file);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  style={{ ...secondaryBtn, width: "100%" }}
                >
                  Upload CSV or Excel…
                </button>
                <button
                  onClick={onTryExample}
                  disabled={loading}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    padding: "10px 14px",
                    border: "1px solid #0a66c2",
                    background: "transparent",
                    color: "#0a66c2",
                    borderRadius: 6,
                    cursor: loading ? "default" : "pointer",
                    fontWeight: 500,
                    fontSize: 13,
                  }}
                >
                  See what Iris notices
                </button>
              </div>
            ) : (
              <div style={sheetBar}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
                    Sheet
                  </div>
                  <div style={{ fontSize: 13, color: "#222", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {fileName ?? "Google Sheet"}
                  </div>
                </div>
                <button onClick={newSheet} style={ghostBtn} title="Use a different sheet">
                  Swap
                </button>
              </div>
            )}

            {/* Loading state */}
            {loading && loadingStage && (
              <div style={{ marginTop: 18, color: "#444", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <Spinner /> {loadingStage}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={errorBox}>
                <strong style={{ display: "block", marginBottom: 4 }}>That didn&apos;t work</strong>
                <span style={{ fontSize: 13 }}>{error}</span>
              </div>
            )}

            {/* Iris's read */}
            {data && (
              <>
                <div style={section}>
                  <div style={sectionHeader}>Iris read</div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: "6px 0 6px", lineHeight: 1.35 }}>
                    {data.summary.subject}
                  </h2>
                  <p style={{ margin: 0, fontSize: 13, color: "#444", lineHeight: 1.55 }}>
                    {data.summary.description}
                  </p>
                </div>

                {data.tells.length > 0 && (
                  <div style={tellsBox}>
                    <div style={tellsHeader}>Iris noticed</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {data.tells.map((t, i) => (
                        <li key={i} style={{ marginBottom: 4, color: "#3a2d00", fontSize: 12.5, lineHeight: 1.5 }}>
                          {t.phrase}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={section}>
                  <div style={sectionHeader}>Iris would build</div>
                  {suggestsLoading && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#666", fontSize: 13, marginTop: 8 }}>
                      <Spinner /> Iris is proposing apps…
                    </div>
                  )}
                  {suggestsError && (
                    <div style={errorBox}>
                      <span style={{ fontSize: 13 }}>{suggestsError}</span>
                    </div>
                  )}
                  {suggests && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {suggests.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveSpec(s)}
                          style={suggestRow(activeSpec === s)}
                        >
                          <span style={archetypeBadge}>{s.archetype}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#111", textAlign: "left", flex: 1 }}>
                            {s.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={section}>
                  <div style={sectionHeader}>Build something else</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <input
                      type="text"
                      value={intent}
                      onChange={(e) => setIntent(e.target.value)}
                      placeholder="describe what you want…"
                      style={inputStyle}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && intent.trim() && !customLoading) onCustomBuild();
                      }}
                    />
                    <button
                      onClick={onCustomBuild}
                      disabled={customLoading || !intent.trim()}
                      style={{
                        padding: "9px 12px",
                        border: "1px solid #ccc",
                        background: customLoading || !intent.trim() ? "#f0f0f0" : "white",
                        color: "#333",
                        borderRadius: 6,
                        cursor: customLoading || !intent.trim() ? "default" : "pointer",
                        fontSize: 13,
                      }}
                    >
                      {customLoading ? "…" : "Build"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* MAIN — only the rendered app */}
        <section style={mainColStyle}>
          {!data && !loading && (
            <div style={mainEmpty}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#222", marginBottom: 10 }}>
                Drop a sheet on the left.
              </div>
              <div style={{ fontSize: 15, color: "#888", maxWidth: 420, lineHeight: 1.55, textAlign: "center" }}>
                Iris reads it, tells you what she noticed, and proposes apps. Pick one — it appears here.
              </div>
            </div>
          )}

          {loading && (
            <div style={mainEmpty}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#666", fontSize: 14 }}>
                <Spinner /> {loadingStage}
              </div>
            </div>
          )}

          {data && !activeSpec && !suggestsLoading && (
            <div style={mainEmpty}>
              <div style={{ fontSize: 16, color: "#888", maxWidth: 420, textAlign: "center" }}>
                Pick one of Iris&apos;s suggestions on the left to build it here.
              </div>
            </div>
          )}

          {data && !activeSpec && suggestsLoading && (
            <div style={mainEmpty}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#666", fontSize: 14 }}>
                <Spinner /> Iris is preparing the app…
              </div>
            </div>
          )}

          {data && activeSpec && (
            <div style={mainContent}>
              <Renderer
                key={`${activeSpec.archetype}|${activeSpec.title}`}
                spec={activeSpec}
                rows={data.sheet.rows}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

// ---- styles -----------------------------------------------------------------

const pageStyle: React.CSSProperties = {
  fontFamily: "system-ui",
  minHeight: "100vh",
  background: "#f6f7f9",
};

const shellStyle: React.CSSProperties = {
  height: "100vh",
  display: "grid",
  gridTemplateColumns: "380px 1fr",
};

const leftColStyle: React.CSSProperties = {
  borderRight: "1px solid #e5e7eb",
  background: "white",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const leftScrollStyle: React.CSSProperties = {
  overflowY: "auto",
  padding: "24px 20px",
  flex: 1,
};

const mainColStyle: React.CSSProperties = {
  overflowY: "auto",
  background: "#f6f7f9",
};

const mainEmpty: React.CSSProperties = {
  height: "100%",
  minHeight: "calc(100vh - 0px)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 40,
};

const mainContent: React.CSSProperties = {
  padding: 32,
  maxWidth: 1100,
  margin: "0 auto",
};

const sheetBar: React.CSSProperties = {
  marginTop: 20,
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fafafa",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const section: React.CSSProperties = {
  marginTop: 22,
};

const sectionHeader: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: "#888",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#666",
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: 9,
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 13,
  background: "white",
  minWidth: 0,
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "9px 14px",
    border: "1px solid #111",
    background: disabled ? "#999" : "#111",
    color: "white",
    borderRadius: 6,
    cursor: disabled ? "default" : "pointer",
    fontWeight: 500,
    fontSize: 13,
  };
}

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px dashed #999",
  background: "transparent",
  color: "#333",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};

const ghostBtn: React.CSSProperties = {
  padding: "4px 10px",
  border: "1px solid #ddd",
  background: "white",
  color: "#555",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
};

const dividerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  margin: "16px 0",
  color: "#999",
  fontSize: 12,
};

const dividerLine: React.CSSProperties = { flex: 1, height: 1, background: "#eee" };

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  background: "#fff4f4",
  border: "1px solid #f3b8b8",
  borderRadius: 8,
  color: "#7a1f1f",
};

const tellsBox: React.CSSProperties = {
  marginTop: 22,
  padding: "12px 14px",
  background: "#fffbea",
  border: "1px solid #f0e0a3",
  borderRadius: 10,
};

const tellsHeader: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: "#7a5a00",
  marginBottom: 6,
};

function suggestRow(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 10,
    border: active ? "1.5px solid #111" : "1px solid #e5e7eb",
    background: active ? "#f6f7f9" : "white",
    borderRadius: 8,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  };
}

const archetypeBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 7px",
  background: "#111",
  color: "white",
  borderRadius: 3,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: "uppercase",
};

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        border: "2px solid #ccc",
        borderTopColor: "#111",
        borderRadius: "50%",
        animation: "nexus-spin 0.7s linear infinite",
      }}
    >
      <style>{`@keyframes nexus-spin { to { transform: rotate(360deg) } }`}</style>
    </span>
  );
}
