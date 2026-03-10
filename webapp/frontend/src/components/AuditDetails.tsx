import React, { useMemo, useState } from "react";

type AuditDetailsProps = {
  /** Raw `it.details` object from the API */
  details: any;
  /** Optional action name (helps for display, but not required) */
  action?: string;
};

function safeJsonStringify(value: any) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function humanKey(k: string) {
  return k
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(s: string, max = 80) {
  if (!s) return s;
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function asString(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // for objects/arrays, keep it compact
  return safeJsonStringify(v);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

export default function AuditDetails({ details, action }: AuditDetailsProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const normalized = useMemo(() => {
    // Details might be null, string, array, etc.
    if (!isPlainObject(details)) {
      return {
        kind: "non_object" as const,
        raw: details,
        summary: {},
        extra: null as Record<string, any> | null,
        other: {} as Record<string, any>,
      };
    }

    const d = details as Record<string, any>;
    const extra = isPlainObject(d.extra) ? (d.extra as Record<string, any>) : null;

    // Common fields we want to show as “Summary”
    const summary = {
      outcome: d.outcome,
      message: d.message,
      request_id: d.request_id,
      ip_address: d.ip_address,
      user_agent: d.user_agent,
      entity_type: d.entity_type,
      entity_id: d.entity_id,
    };

    // Build “other fields”: anything not in summary keys and not `extra`
    const summaryKeys = new Set(Object.keys(summary));
    const other: Record<string, any> = {};

    for (const [k, v] of Object.entries(d)) {
      if (k === "extra") continue;
      if (summaryKeys.has(k)) continue;
      other[k] = v;
    }

    return {
      kind: "object" as const,
      raw: d,
      summary,
      extra,
      other,
    };
  }, [details]);

  const rawJson = useMemo(() => safeJsonStringify(details), [details]);

  const outcome = normalized.kind === "object" ? normalized.summary.outcome : undefined;
  const outcomeLabel =
    typeof outcome === "string"
      ? outcome
      : outcome === true
      ? "SUCCESS"
      : outcome === false
      ? "FAIL"
      : undefined;

  const outcomeTone =
    outcomeLabel?.toUpperCase() === "SUCCESS"
      ? "success"
      : outcomeLabel?.toUpperCase() === "FAIL"
      ? "danger"
      : "secondary";

  const handleCopy = async () => {
    await copyToClipboard(rawJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 900);
  };

  return (
    <div style={styles.wrap}>
      {/* Header row */}
      <div style={styles.topRow}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>Details</strong>
          {action ? <span style={styles.chip}>{action}</span> : null}
          {outcomeLabel ? (
            <span
              style={{
                ...styles.outcome,
                ...(outcomeTone === "success"
                  ? styles.outcomeSuccess
                  : outcomeTone === "danger"
                  ? styles.outcomeDanger
                  : styles.outcomeNeutral),
              }}
            >
              {outcomeLabel}
            </span>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={handleCopy} style={styles.smallButton}>
            {copied ? "Copied!" : "Copy JSON"}
          </button>
          <button
            onClick={() => setShowRaw((v) => !v)}
            style={styles.smallButtonSecondary}
          >
            {showRaw ? "Hide raw" : "Show raw"}
          </button>
        </div>
      </div>

      {/* Friendly view */}
      {normalized.kind === "non_object" ? (
        <div style={styles.card}>
          <div style={styles.row}>
            <div style={styles.label}>Value</div>
            <div style={styles.value}>{asString(normalized.raw)}</div>
          </div>
        </div>
      ) : (
        <>
          {/* Summary grid */}
          <div style={styles.card}>
            <div style={styles.grid}>
              <Field label="Message" value={normalized.summary.message} />
              <Field label="Request ID" value={normalized.summary.request_id} />
              <Field label="IP address" value={normalized.summary.ip_address} />
              <Field
                label="Browser / user agent"
                value={
                  normalized.summary.user_agent
                    ? truncate(String(normalized.summary.user_agent), 120)
                    : "—"
                }
                title={normalized.summary.user_agent ? String(normalized.summary.user_agent) : undefined}
              />
              <Field label="Entity type" value={normalized.summary.entity_type} />
              <Field label="Entity id" value={normalized.summary.entity_id} />
            </div>
          </div>

          {/* Extra */}
          {normalized.extra && Object.keys(normalized.extra).length > 0 ? (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Extra</div>
              <div style={styles.kvList}>
                {Object.entries(normalized.extra).map(([k, v]) => (
                  <div key={k} style={styles.kvRow}>
                    <div style={styles.kvKey}>{humanKey(k)}</div>
                    <div style={styles.kvVal}>{renderValue(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Other fields */}
          {normalized.other && Object.keys(normalized.other).length > 0 ? (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Other fields</div>
              <div style={styles.kvList}>
                {Object.entries(normalized.other).map(([k, v]) => (
                  <div key={k} style={styles.kvRow}>
                    <div style={styles.kvKey}>{humanKey(k)}</div>
                    <div style={styles.kvVal}>{renderValue(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* Raw JSON */}
      {showRaw ? (
        <div style={styles.rawCard}>
          <pre style={styles.pre}>{rawJson}</pre>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  title,
}: {
  label: string;
  value: any;
  title?: string;
}) {
  const display = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div style={styles.field}>
      <div style={styles.label}>{label}</div>
      <div style={styles.value} title={title}>
        {display}
      </div>
    </div>
  );
}

function renderValue(v: any) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);

  // small objects/arrays: pretty JSON but not massive
  const s = safeJsonStringify(v);
  return (
    <span style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
      {s}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 },

  topRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },

  chip: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(var(--bs-primary-rgb), 0.12)",
    border: "1px solid rgba(var(--bs-primary-rgb), 0.25)",
    fontWeight: 800,
    fontSize: 12,
  },

  outcome: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
  },
  outcomeSuccess: {
    background: "rgba(var(--bs-success-rgb), 0.14)",
    border: "1px solid rgba(var(--bs-success-rgb), 0.35)",
    color: "var(--bs-success)",
  },
  outcomeDanger: {
    background: "rgba(var(--bs-danger-rgb), 0.14)",
    border: "1px solid rgba(var(--bs-danger-rgb), 0.35)",
    color: "var(--bs-danger)",
  },
  outcomeNeutral: {
    background: "rgba(var(--bs-secondary-rgb), 0.12)",
    border: "1px solid rgba(var(--bs-secondary-rgb), 0.25)",
    color: "var(--bs-secondary-color)",
  },

  smallButton: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--bs-border-color)",
    background: "transparent",
    color: "var(--bs-body-color)",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
  },
  smallButtonSecondary: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--bs-border-color)",
    background: "rgba(var(--bs-secondary-rgb), 0.08)",
    color: "var(--bs-body-color)",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
  },

  card: {
    border: "1px solid var(--bs-border-color)",
    borderRadius: 10,
    padding: 12,
    background: "var(--bs-body-bg)",
  },

  rawCard: {
    border: "1px solid var(--bs-border-color)",
    borderRadius: 10,
    padding: 12,
    background: "var(--bs-tertiary-bg)",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(240px, 1fr))",
    gap: 10,
  },

  field: { display: "flex", flexDirection: "column", gap: 4 },

  label: {
    fontSize: 12,
    fontWeight: 800,
    color: "var(--bs-secondary-color)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  value: {
    fontSize: 14,
    color: "var(--bs-body-color)",
    wordBreak: "break-word",
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: 900,
    marginBottom: 8,
    color: "var(--bs-body-color)",
  },

  kvList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  kvRow: {
    display: "grid",
    gridTemplateColumns: "220px 1fr",
    gap: 10,
    alignItems: "start",
    padding: "6px 0",
    borderBottom: "1px dashed rgba(var(--bs-border-color-rgb), 0.55)",
  },

  kvKey: {
    fontSize: 13,
    fontWeight: 800,
    color: "var(--bs-body-color)",
    opacity: 0.9,
  },

  kvVal: {
    fontSize: 13,
    color: "var(--bs-body-color)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },

  pre: {
    margin: 0,
    background: "transparent",
    padding: 0,
    overflowX: "auto",
    fontSize: 12,
    color: "var(--bs-body-color)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    whiteSpace: "pre-wrap",
  },
};