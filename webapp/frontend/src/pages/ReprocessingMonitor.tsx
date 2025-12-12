
// src/pages/ReprocessingMonitor.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/** --- Types --- */
type DeviceType = "washer" | "autoclave" | "steriliser";
type DeviceStatus = "running" | "idle" | "fault";

type DeviceRow = {
  id: string;
  type: DeviceType;
  name: string;            // human-readable (e.g., VISION, UNICLEAN, STER100NX)
  make?: string;           // OEM (Steris, MMM, Getinge, etc.)
  location?: string;       // e.g., Southampton, Ruislip
  active: boolean;         // device enabled in site
  status: DeviceStatus;
  cycleNumber: number;     // current/last cycle number
  startedAt?: string | null; // ISO when current cycle started
  lastUpdated?: string;    // ISO
};

/** format seconds as HH:mm:ss */
function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

/** map type -> icon and badge theme */
const TYPE_META: Record<DeviceType, { icon: string; badgeClass: string; label: string }> = {
  washer:     { icon: "bi-droplet",          badgeClass: "bg-primary",  label: "Washer"     },
  autoclave:  { icon: "bi-thermometer-half", badgeClass: "bg-warning",  label: "Autoclave"  },
  steriliser: { icon: "bi-shield-check",     badgeClass: "bg-success",  label: "Steriliser" },
};

/** --- Placeholder seed (feel free to tweak) --- */
function seedDevices(): DeviceRow[] {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const startedMinsAgo = (mins: number) => iso(new Date(now.getTime() - mins * 60_000));

  return [
    { id: "VISION",     type: "washer",    name: "VISION",     make: "Steris",  location: "London",      active: true,  status: "running", cycleNumber: 1542, startedAt: startedMinsAgo(22), lastUpdated: iso(now) },
    { id: "UNICLEAN",   type: "washer",    name: "UNICLEAN",   make: "MMM",     location: "London",      active: true,  status: "idle",    cycleNumber: 845,  startedAt: null,                lastUpdated: iso(now) },
    { id: "STAGE23",    type: "washer",    name: "STAGE23",    make: "Steris",  location: "London",      active: true,  status: "running", cycleNumber: 998,  startedAt: startedMinsAgo(5),  lastUpdated: iso(now) },
    { id: "SELECTPL",   type: "steriliser",name: "SELECTPL",   make: "MMM",     location: "London",      active: true,  status: "idle",    cycleNumber: 432,  startedAt: null,                lastUpdated: iso(now) },
    { id: "STER100NX",  type: "steriliser",name: "STER100NX",  make: "Sterrad", location: "London",      active: true,  status: "running", cycleNumber: 219,  startedAt: startedMinsAgo(12), lastUpdated: iso(now) },
    { id: "STERISPRO",  type: "steriliser",name: "STERISPRO",  make: "Steris",  location: "Ruislip",     active: true,  status: "idle",    cycleNumber: 701,  startedAt: null,                lastUpdated: iso(now) },
    { id: "EDFLOW",     type: "washer",    name: "EDFLOW",     make: "Getinge", location: "Southampton", active: true,  status: "fault",   cycleNumber: 130,  startedAt: null,                lastUpdated: iso(now) },
    { id: "MANUAL",     type: "washer",    name: "MANUAL",     make: "—",       location: "Southampton", active: false, status: "idle",    cycleNumber: 0,    startedAt: null,                lastUpdated: iso(now) },
  ];
}

/** compute elapsed seconds for a device */
function elapsedSeconds(d: DeviceRow, now: number) {
  if (d.status !== "running" || !d.startedAt) return 0;
  const start = Date.parse(d.startedAt);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 1000));
}

/** --- Page component --- */
export default function ReprocessingMonitor() {
  const [devices, setDevices] = useState<DeviceRow[]>(seedDevices());
  const [filterType, setFilterType] = useState<DeviceType | "all">("all");
  const [activeOnly, setActiveOnly] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Theme-aware Details drawer selection
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // tick each second to refresh the "Running for" clocks & chart
  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // optional 10s auto-refresh to randomise placeholder states
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      setDevices((prev) => prev.map((d) => {
        if (!d.active) return d;
        const roll = Math.random();
        let status = d.status;
        let cycleNumber = d.cycleNumber;
        let startedAt = d.startedAt;

        if (roll < 0.08) status = "fault";
        else if (roll < 0.45) status = "idle";
        else status = "running";

        if (status === "running") {
          if (d.status !== "running") {
            cycleNumber = d.cycleNumber + 1;
            startedAt = new Date().toISOString();
          }
        } else {
          startedAt = null;
        }

        return { ...d, status, cycleNumber, startedAt, lastUpdated: new Date().toISOString() };
      }));
    }, 10_000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  /** simulate manual start/stop for placeholders */
  function toggleRun(d: DeviceRow) {
    setDevices((prev) => prev.map((x) => {
      if (x.id !== d.id) return x;
      if (x.status === "running") {
        return { ...x, status: "idle", startedAt: null, lastUpdated: new Date().toISOString() };
      } else {
        return { ...x, status: "running", cycleNumber: x.cycleNumber + 1, startedAt: new Date().toISOString(), lastUpdated: new Date().toISOString() };
      }
    }));
  }

  /** placeholder manual refresh */
  function refreshFromServer() {
    setDevices(seedDevices());
  }

  /** derived list */
  const filtered = devices.filter((d) => {
    if (filterType !== "all" && d.type !== filterType) return false;
    if (activeOnly && !d.active) return false;
    return true;
  });

  /** selection lookup */
  const selectedDevice = selectedId ? devices.find(d => d.id === selectedId) ?? null : null;

  /** summary */
  const counts = {
    washers: devices.filter((d) => d.type === "washer" && d.active).length,
    autoclaves: devices.filter((d) => d.type === "autoclave" && d.active).length,
    sterilisers: devices.filter((d) => d.type === "steriliser" && d.active).length,
    running: devices.filter((d) => d.status === "running" && d.active).length,
    faults: devices.filter((d) => d.status === "fault" && d.active).length,
  };

  return (
    <div className="container-xxl py-3">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">Reprocessing Monitor</h2>
        <div className="text-muted small">Last refresh: {new Date(nowTick).toLocaleTimeString()}</div>
      </div>

      {/* toolbar */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-speedometer" aria-hidden="true" />
            <strong>Live status</strong>
          </div>
          <div className="d-flex flex-wrap gap-2">
            {/* type filter chips */}
            <div className="btn-group btn-group-sm" role="group" aria-label="Filter by type">
              <button className={`btn btn-outline-primary ${filterType === "all" ? "active" : ""}`} onClick={() => setFilterType("all")}>All</button>
              <button className={`btn btn-outline-primary ${filterType === "washer" ? "active" : ""}`} onClick={() => setFilterType("washer")}>Washers</button>
              <button className={`btn btn-outline-primary ${filterType === "autoclave" ? "active" : ""}`} onClick={() => setFilterType("autoclave")}>Autoclaves</button>
              <button className={`btn btn-outline-primary ${filterType === "steriliser" ? "active" : ""}`} onClick={() => setFilterType("steriliser")}>Sterilisers</button>
            </div>

            {/* active only switch */}
            <div className="form-check form-switch d-flex align-items-center">
              <input
                className="form-check-input"
                type="checkbox"
                id="active-only"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                aria-label="Show active devices only"
              />
              <label className="form-check-label ms-1" htmlFor="active-only">Active only</label>
            </div>

            {/* auto refresh */}
            <div className="form-check form-switch d-flex align-items-center">
              <input
                className="form-check-input"
                type="checkbox"
                id="auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                aria-label="Auto refresh (10s)"
              />
              <label className="form-check-label ms-1" htmlFor="auto-refresh">Auto-refresh</label>
            </div>

            {/* manual refresh */}
            <button className="btn btn-sm btn-outline-secondary" onClick={refreshFromServer}>
              <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>

        <div className="card-body">
          {/* summary tiles */}
          <div className="row g-3 mb-2">
            <Stat title="Washers"      value={counts.washers}      icon="bi-droplet" />
            <Stat title="Autoclaves"   value={counts.autoclaves}   icon="bi-thermometer-half" />
            <Stat title="Sterilisers"  value={counts.sterilisers}  icon="bi-shield-check" />
            <Stat title="Running"      value={counts.running}      icon="bi-play-fill" />
            <Stat title="Faults"       value={counts.faults}       icon="bi-exclamation-triangle" />
          </div>

          {/* table */}
          {filtered.length === 0 ? (
            <div className="text-muted">No devices match the current filters.</div>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ width: "10%" }}>Type</th>
                    <th style={{ width: "20%" }}>Name</th>
                    <th style={{ width: "16%" }}>Make</th>
                    <th style={{ width: "14%" }}>Status</th>
                    <th style={{ width: "14%" }}>Cycle #</th>
                    <th style={{ width: "16%" }}>Running for</th>
                    <th style={{ width: "10%" }} className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const meta = TYPE_META[d.type];
                    const elapsed = formatDuration(elapsedSeconds(d, Date.now()));
                    const statusClass =
                      d.status === "running" ? "text-success" :
                      d.status === "fault"   ? "text-danger"  :
                                              "text-muted";
                    return (
                      <tr key={d.id}>
                        <td>
                          <span className={`badge ${meta.badgeClass} me-2`}><i className={`bi ${meta.icon}`} aria-hidden="true" /></span>
                          <span className="align-middle">{meta.label}</span>
                        </td>
                        <td>
                          <div className="fw-semibold">{d.name}</div>
                          <div className="text-muted small">{d.location ?? "—"}</div>
                        </td>
                        <td>{d.make ?? "—"}</td>
                        <td className={statusClass}>
                          <i className={`bi ${d.status === "running" ? "bi-play-fill" : d.status === "fault" ? "bi-x-octagon" : "bi-pause-fill"}`} aria-hidden="true" />{" "}
                          {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                        </td>
                        <td>{d.cycleNumber}</td>
                        <td>{d.status === "running" ? elapsed : "—"}</td>
                        <td className="text-end">
                          <div className="btn-group btn-group-sm">
                            <button
                              className={`btn ${d.status === "running" ? "btn-outline-secondary" : "btn-outline-primary"}`}
                              onClick={() => toggleRun(d)}
                              aria-label={d.status === "running" ? `Stop ${d.name}` : `Start ${d.name}`}
                            >
                              {d.status === "running" ? <>Stop</> : <>Start</>}
                            </button>
                            <button
                              className="btn btn-outline-secondary"
                              title={`Details for ${d.name}`}
                              onClick={() => setSelectedId(d.id)}
                            >
                              <i className="bi bi-info-circle" aria-hidden="true" /> Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-muted small mt-2">
            Placeholder only — when the API is available we’ll replace the seed with live device status and cycle telemetry.
          </div>
        </div>
      </div>

      {/* Drawer + backdrop */}
      {selectedDevice && (
        <>
          {/* theme-neutral backdrop */}
          <div
            className="position-fixed top-0 start-0 w-100 h-100 bg-black bg-opacity-25"
            style={{ zIndex: 1039 }}
            onClick={() => setSelectedId(null)}
            aria-hidden="true"
          />
          <DetailsDrawer
            device={selectedDevice}
            nowMs={nowTick}
            onClose={() => setSelectedId(null)}
          />
        </>
      )}
    </div>
  );
}

/** --- Small stat tile --- */
function Stat({ title, value, icon }: { title: string; value: React.ReactNode; icon: string }) {
  return (
    <div className="col-sm-4 col-md-3">
      <div className="p-3 border rounded d-flex align-items-center gap-2">
        <i className={`bi ${icon}`} aria-hidden="true" />
        <div>
          <div className="text-muted small">{title}</div>
          <div className="fw-semibold">{value}</div>
        </div>
      </div>
    </div>
  );
}

/* ======================================================================= */
/*                           Details Drawer + Graph                        */
/* ======================================================================= */

type CyclePoint = { tSec: number; tempC: number; conductivityUs: number };
type CycleSummary = {
  cycleNumber: number;
  startedAt?: string | null;
  status: DeviceStatus;
  estimatedMinutes?: number;
  outcome?: "pass" | "fail" | "inconclusive";
};

/** deterministic placeholder RNG */
function seededRand(seed: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
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
  cycleNumber: number;
  durationSec: number;
  outcome: "pass" | "fail";
  avgTempC: number;
  maxTempC: number;
  avgConductivityUs: number;
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

function DetailsDrawer({
  device,
  nowMs,
  onClose,
}: {
  device: DeviceRow;
  nowMs: number;
  onClose: () => void;
}) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const summary = useMemo(() => makeCurrentCycleSummary(device), [device]);
  const points  = useMemo(() => makeTelemetry(device, nowMs), [device, nowMs]);
  const history = useMemo(() => makeHistory(device), [device]);

  const avgTemp = points.length ? (points.reduce((s, p) => s + p.tempC, 0) / points.length) : 0;
  const maxTemp = points.length ? Math.max(...points.map(p => p.tempC)) : 0;
  const avgCond = points.length ? (points.reduce((s, p) => s + p.conductivityUs, 0) / points.length) : 0;

  return (
    <div
      className="position-fixed top-0 end-0 h-100 shadow border-start"
      style={{
        width: "520px",
        zIndex: 1040,
        backgroundColor: "var(--bs-body-bg)",
        color: "var(--bs-body-color)",
        borderColor: "var(--bs-border-color)",
      }}
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

/** --- tiny KPI --- */
function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted small">{label}</div>
      <div className="fw-semibold">{value}</div>
    </div>
  );
}

/** --- minimal inline SVG chart: temp & conductivity vs time --- */
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
    <svg
      width={width}
      height={height}
      style={{
        background: "var(--bs-tertiary-bg)",
        border: "1px solid var(--bs-border-color)",
        borderRadius: 6,
      }}
    >
      {/* target lines */}
      {typeof tempTarget === "number" && (
        <line x1={padding} x2={width - padding} y1={yTemp(tempTarget)} y2={yTemp(tempTarget)}
              stroke="var(--bs-danger)" strokeDasharray="4 3" />
      )}
      {typeof condTarget === "number" && (
        <line x1={padding} x2={width - padding} y1={yCond(condTarget)} y2={yCond(condTarget)}
              stroke="var(--bs-primary)" strokeDasharray="4 3" />
      )}

      {/* temp line */}
      <path d={path("temp")} fill="none" stroke="var(--bs-danger)" strokeWidth={2} />
      {/* conductivity line */}
      <path d={path("cond")} fill="none" stroke="var(--bs-primary)" strokeWidth={2} />

      {/* points */}
      {points.map((p, i) => (
        <circle key={i} cx={x(p.tSec)} cy={yTemp(p.tempC)} r={1.8} fill="var(--bs-danger)" />
      ))}
      {points.map((p, i) => (
        <circle key={"c"+i} cx={x(p.tSec)} cy={yCond(p.conductivityUs)} r={1.8} fill="var(--bs-primary)" />
      ))}

      {/* minimal labels */}
      <text x={padding} y={height - 6} fontSize="12px" fill="var(--bs-secondary-color)">time</text>
      <text x={width - padding - 46} y={14} fontSize="12px" fill="var(--bs-secondary-color)">temp/cond</text>
    </svg>
  );
}
