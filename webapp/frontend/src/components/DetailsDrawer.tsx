
// src/components/DetailsDrawer.tsx
import React, { useEffect, useMemo, useRef } from "react";

// Reuse your types locally (or import them if you export from a shared types file)
type DeviceType = "washer" | "autoclave" | "steriliser";
type DeviceStatus = "running" | "idle" | "fault";
export type DeviceRow = {
  id: string; type: DeviceType; name: string; make?: string; location?: string;
  active: boolean; status: DeviceStatus; cycleNumber: number;
  startedAt?: string | null; lastUpdated?: string;
};

// Props
export default function DetailsDrawer({
  device,
  nowMs,
  onClose,
}: {
  device: DeviceRow;
  nowMs: number;
  onClose: () => void;
}) {
  // focus the close button on open; support ESC to close
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const summary = useMemo(() => makeCurrentCycleSummary(device), [device]);
  const points = useMemo(() => makeTelemetry(device, nowMs), [device, nowMs]);
  const history = useMemo(() => makeHistory(device), [device]);

  const avgTemp = points.length ? (points.reduce((s, p) => s + p.tempC, 0) / points.length) : 0;
  const maxTemp = points.length ? Math.max(...points.map(p => p.tempC)) : 0;
  const avgCond = points.length ? (points.reduce((s, p) => s + p.conductivityUs, 0) / points.length) : 0;

  const TYPE_META: Record<DeviceType, { icon: string; badgeClass: string; label: string }> = {
    washer:     { icon: "bi-droplet",          badgeClass: "bg-primary",  label: "Washer"     },
    autoclave:  { icon: "bi-thermometer-half", badgeClass: "bg-warning",  label: "Autoclave"  },
    steriliser: { icon: "bi-shield-check",     badgeClass: "bg-success",  label: "Steriliser" },
  };

  return (
    <div
      className="position-fixed top-0 end-0 h-100 bg-white shadow border-start"
      style={{ width: "520px", zIndex: 1040 }}
      role="dialog"
      aria-modal="true"
      aria-label={`${device.name} details`}
    >
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between border-bottom p-3">
        <div className="d-flex align-items-center gap-2">
          <span className={`badge ${TYPE_META[device.type].badgeClass}`}>
            <i className={`bi ${TYPE_META[device.type].icon}`} aria-hidden="true" />
          </span>
          <div>
            <div className="fw-semibold">{device.name}</div>
            <div className="text-muted small">{device.make ?? "—"} · {device.location ?? "—"}</div>
          </div>
        </div>
        <button ref={closeBtnRef} className="btn btn-sm btn-outline-secondary" onClick={onClose}>
          <i className="bi bi-x-lg" /> Close
        </button>
      </div>

      {/* Body */}
      <div className="p-3">
        {/* Current cycle */}
        <section className="mb-3">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-activity" /> <strong>Current cycle</strong>
          </div>
          <div className="mt-2 d-flex flex-wrap gap-3">
            <Kpi label="Status" value={summary.status} />
            <Kpi label="Cycle #" value={summary.cycleNumber} />
            <Kpi label="Started" value={summary.startedAt ? new Date(summary.startedAt).toLocaleTimeString() : "—"} />
            <Kpi label="Elapsed" value={formatDuration(elapsedSeconds(device, nowMs))} />
            <Kpi label="ETA (mins)" value={summary.estimatedMinutes ?? "—"} />
          </div>
        </section>

        {/* Performance */}
        <section className="mb-3">
          <div className="d-flex align-items-center gap-2 mb-2">
            <i className="bi bi-graph-up" /> <strong>Performance</strong>
            <span className="text-muted small">(placeholder telemetry)</span>
          </div>
          <DualSeriesSparkline points={points} height={160} tempTarget={85} condTarget={40} />
          <div className="mt-2 d-flex flex-wrap gap-3">
            <Kpi label="Avg Temp (°C)" value={avgTemp.toFixed(1)} />
            <Kpi label="Max Temp (°C)" value={maxTemp.toFixed(1)} />
            <Kpi label="Avg Rinse Cond (µS)" value={avgCond.toFixed(1)} />
          </div>
        </section>

        {/* History */}
        <section className="mb-3">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-clock-history" /> <strong>Historic cycles</strong>
          </div>
          <ul className="list-group mt-2">
            {history.map((h) => (
              <li key={h.cycleNumber} className="list-group-item d-flex align-items-center justify-content-between">
                <div>
                  <div className="fw-semibold">#{h.cycleNumber}</div>
                  <div className="text-muted small">
                    Duration {formatDuration(h.durationSec)} · Avg {h.avgTempC}°C (max {h.maxTempC}°C) · Rinse {h.avgConductivityUs} µS
                  </div>
                </div>
                <span className={`badge ${h.outcome === "pass" ? "bg-success" : "bg-danger"}`}>
                  {h.outcome === "pass" ? "Pass" : "Fail"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="text-muted small">
          All values are simulated for demo purposes. Live data will replace these when the API is connected.
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers (self-contained) ---------- */
type CyclePoint = { tSec: number; tempC: number; conductivityUs: number };
type CycleSummary = {
  cycleNumber: number; startedAt?: string | null; status: DeviceStatus;
  estimatedMinutes?: number; outcome?: "pass" | "fail" | "inconclusive";
};

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

function elapsedSeconds(d: DeviceRow, now: number) {
  if (d.status !== "running" || !d.startedAt) return 0;
  const start = Date.parse(d.startedAt);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 1000));
}

function seededRand(seed: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) h ^= seed.charCodeAt(i), h = Math.imul(h, 16777619);
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return (h >>> 0) / 0xFFFFFFFF;
  };
}

function makeCurrentCycleSummary(d: DeviceRow): CycleSummary {
  return {
    cycleNumber: d.cycleNumber,
    startedAt: d.startedAt ?? null,
    status: d.status,
    estimatedMinutes: d.type === "washer" ? 35 : d.type === "steriliser" ? 50 : 45,
    outcome: d.status === "running" ? undefined : "pass",
  };
}

function makeTelemetry(d: DeviceRow, nowMs: number): CyclePoint[] {
  const points: CyclePoint[] = [];
  const startMs = d.startedAt ? Date.parse(d.startedAt) : nowMs;
  const elapsed = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const stepSec = 30, maxPoints = 40; // ≈20 minutes
  const rnd = seededRand(d.id + ":" + d.cycleNumber);

  for (let i = 0; i < Math.min(Math.floor(elapsed / stepSec), maxPoints); i++) {
    const tSec = i * stepSec;
    const phase = tSec < 240 ? "warmup" : tSec < 900 ? "wash" : tSec < 1200 ? "rinse" : "thermal";
    const baseTemp =
      phase === "warmup" ? (20 + tSec * 0.12) :
      phase === "wash"   ? (60 + (rnd() - 0.5) * 6) :
      phase === "rinse"  ? (42 + (rnd() - 0.5) * 4) :
                           (90 + (rnd() - 0.5) * 3);

    const tempC = Math.max(18, baseTemp + (rnd() - 0.5) * 2);
    const conductivityUs =
      phase === "rinse" ? Math.max(10, 30 + (rnd() - 0.5) * 6) : Math.max(50, 120 + (rnd() - 0.5) * 20);
    points.push({ tSec, tempC, conductivityUs });
  }
  return points;
}

type HistoricCycle = {
  cycleNumber: number; durationSec: number; outcome: "pass" | "fail";
  avgTempC: number; maxTempC: number; avgConductivityUs: number;
};
function makeHistory(d: DeviceRow): HistoricCycle[] {
  const rnd = seededRand(d.id);
  const list: HistoricCycle[] = [];
  for (let i = 0; i < 8; i++) {
    const cycleNumber = d.cycleNumber - (i + 1);
    const durationSec = 1800 + Math.floor(rnd() * 1800); // 30–60 min
    const maxTempC = 86 + Math.floor(rnd() * 8);
    const avgTempC = 62 + Math.floor(rnd() * 6);
    const avgConductivityUs = 35 + Math.floor(rnd() * 10);
    const outcome = rnd() < 0.94 ? "pass" : "fail";
    list.push({ cycleNumber, durationSec, outcome, avgTempC, maxTempC, avgConductivityUs });
  }
  return list;
}

/* ---------- tiny chart ---------- */
function DualSeriesSparkline({
  points,
  height = 140,
  tempTarget,
  condTarget,
}: {
  points: CyclePoint[];
  height?: number;
  tempTarget?: number;
  condTarget?: number;
}) {
  const width = 480;
  const padding = 24;

  const maxT = points.length ? points[points.length - 1].tSec : 0;
  const x = (t: number) => padding + (t / Math.max(1, maxT)) * (width - padding * 2);

  const tempMax = Math.max(tempTarget ?? 90, ...points.map(p => p.tempC), 90);
  const tempMin = Math.min(...points.map(p => p.tempC).concat([20]));
  const yTemp = (v: number) => height - padding - ((v - tempMin) / Math.max(1, tempMax - tempMin)) * (height - padding * 2);

  const condMax = Math.max(condTarget ?? 50, ...points.map(p => p.conductivityUs), 50);
  const condMin = Math.min(...points.map(p => p.conductivityUs).concat([10]));
  const yCond = (v: number) => height - padding - ((v - condMin) / Math.max(1, condMax - condMin)) * (height - padding * 2);

  const path = (series: ("temp" | "cond")) => {
    const pts = points.map(p => {
      const y = series === "temp" ? yTemp(p.tempC) : yCond(p.conductivityUs);
      return `${x(p.tSec)},${y}`;
    });
    return pts.length ? `M ${pts[0]} L ${pts.slice(1).join(" ")}` : "";
  };

  return (
    <svg width={width} height={height} className="border rounded bg-light">
      {typeof tempTarget === "number" && (
        <line x1={padding} x2={width - padding} y1={yTemp(tempTarget)} y2={yTemp(tempTarget)}
              stroke="#dc3545" strokeDasharray="4 3" />
      )}
      {typeof condTarget === "number" && (
        <line x1={padding} x2={width - padding} y1={yCond(condTarget)} y2={yCond(condTarget)}
              stroke="#0d6efd" strokeDasharray="4 3" />
      )}
      <path d={path("temp")} fill="none" stroke="#dc3545" strokeWidth={2} />
      <path d={path("cond")} fill="none" stroke="#0d6efd" strokeWidth={2} />
      {points.map((p, i) => <circle key={i} cx={x(p.tSec)} cy={yTemp(p.tempC)} r={1.8} fill="#dc3545" />)}
      {points.map((p, i) => <circle key={"c"+i} cx={x(p.tSec)} cy={yCond(p.conductivityUs)} r={1.8} fill="#0d6efd" />)}
    </svg>
  );
}

/* ---------- small KPI ---------- */
function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted small">{label}</div>
      <div className="fw-semibold">{value}</div>
    </div>
  );
}
