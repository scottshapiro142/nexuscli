"use client";

/**
 * Nexus: shared pagination footer for List / Table / Triage renderers.
 * Plain inline-styled buttons; resets are handled by remount via Renderer key.
 */

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
};

export default function Pagination({ page, pageSize, total, onChange }: Props) {
  if (total <= pageSize) {
    return (
      <div style={footer}>
        {total} {total === 1 ? "item" : "items"}
      </div>
    );
  }
  const totalPages = Math.ceil(total / pageSize);
  const startIdx = page * pageSize + 1;
  const endIdx = Math.min(total, (page + 1) * pageSize);

  return (
    <div style={footer}>
      <span style={{ color: "#666" }}>
        {startIdx}–{endIdx} of {total}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          style={btn(page === 0)}
        >
          ← Prev
        </button>
        <span style={{ alignSelf: "center", fontSize: 12, color: "#888" }}>
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          style={btn(page >= totalPages - 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

const footer: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 12,
  color: "#666",
  flexWrap: "wrap",
};

function btn(disabled: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    border: "1px solid #ddd",
    background: disabled ? "#f6f6f6" : "white",
    color: disabled ? "#aaa" : "#333",
    borderRadius: 5,
    cursor: disabled ? "default" : "pointer",
    fontSize: 12,
    fontFamily: "inherit",
  };
}
