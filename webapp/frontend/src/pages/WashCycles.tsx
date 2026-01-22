
// src/pages/WashCycles.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

/** Types kept in sync with our previous pages */
type Approval = {
  by: string;        // display name (demo)
  at: string;        // ISO timestamp
  reason?: string;
  signature?: string;
};

type ParameterPoint = { t: string; value: number };

type CycleTrace = {
  temperatureC?: ParameterPoint[];
  pressureBar?: ParameterPoint[];
  conductivityUs?: ParameterPoint[];
};

type WashCycle = {
  id: string;
  deviceId: string;
  cycleNo: number;
  program: string;       // e.g., Instruments High
  start: string;         // ISO
  durationMin: number;
  pass: boolean;
  failReasons?: string[];
  load?: { cartId?: string; trays?: number; instruments?: number; weightKg?: number };
  phases?: { name: string; durationMin: number }[];
  trace?: CycleTrace;
  approvals?: Approval[];
};

/** ---- Demo data (self-contained) ---- */
const DEMO_CYCLES: WashCycle[] = [
  {
    id: "c-124", deviceId: "w-01", cycleNo: 124, program: "Instruments High",
    start: "2026-01-13T08:10:00Z", durationMin: 43, pass: true,
    load: { cartId: "CART-01", trays: 6, instruments: 142, weightKg: 27.5 },
    phases: [
      { name: "Pre-wash", durationMin: 5 }, { name: "Wash", durationMin: 20 },
      { name: "Rinse", durationMin: 10 }, { name: "Thermal", durationMin: 5 }, { name: "Dry", durationMin: 3 }
    ],
    trace: {
      temperatureC: [
        { t: "08:10", value: 25 }, { t: "08:15", value: 55 },
        { t: "08:25", value: 65 }, { t: "08:30", value: 88 },
        { t: "08:35", value: 92 }, { t: "08:40", value: 90 }
      ],
      pressureBar: [{ t: "08:10", value: 0.8 }, { t: "08:40", value: 1.2 }],
      conductivityUs: [{ t: "08:20", value: 15 }, { t: "08:30", value: 7 }, { t: "08:40", value: 5 }]
    },
    approvals: []
  },
  {
    id: "c-123", deviceId: "w-01", cycleNo: 123, program: "Instruments High",
    start: "2026-01-13T07:20:00Z", durationMin: 44, pass: true
  },
  {
    id: "c-122", deviceId: "w-01", cycleNo: 122, program: "Instruments Standard",
    start: "2026-01-13T06:40:00Z", durationMin: 41, pass: true
  },
  {
    id: "c-37", deviceId: "w-03", cycleNo: 37, program: "Instruments Standard",
    start: "2026-01-12T17:25:00Z", durationMin: 39, pass: false, failReasons: ["Thermal hold < 10min"]
  },
  {
    id: "c-36", deviceId: "w-03", cycleNo: 36, program: "Instruments Standard",
    start: "2026-01-12T16:40:00Z", durationMin: 40, pass: true
  },
  {
    id: "c-12", deviceId: "w-06", cycleNo: 12, program: "Instruments High",
    start: "2026-01-13T07:55:00Z", durationMin: 46, pass: true,
    trace: { temperatureC: [{ t: "07:55", value: 90 }, { t: "08:00", value: 91 }, { t: "08:05", value: 92 }] }
  }
];

const DEVICE_IDS = Array.from(new Set(DEMO_CYCLES.map(c => c.deviceId)));
const PROGRAMS  = Array.from(new Set(DEMO_CYCLES.map(c => c.program)));

/** Inline SVG LineChart (no deps) */
function LineChart({
  points,
  min = 0,
  max = 100,
  complianceMin
}: {
  points: ParameterPoint[];
  min?: number;
  max?: number;
  complianceMin?: number;
}) {
  const width = 360, height = 140, padding = 16;
  const span = Math.max(1, max - min);
  const xs = points.map((_, i) => padding + (i * (width - padding * 2)) / Math.max(1, points.length - 1));
  const ys = points.map(p => padding + (1 - (p.value - min) / span) * (height - padding * 2));
  const path = points.length
    ? "M " + xs.map((x, i) => `${x} ${ys[i]}`).join(" L ")
    : "";

  const compY = complianceMin !== undefined
    ? padding + (1 - (complianceMin - min) / span) * (height - padding * 2)
    : undefined;

  return (
    <svg width={width} height={height} role="img" aria-label="Temperature trend">
      <rect x={0} y={0} width={width} height={height} fill="var(--bs-body-bg)" stroke="var(--bs-border-color)"/>
      {path && <path d={path} fill="none" stroke="var(--bs-primary)" strokeWidth={2} />}
      {compY !== undefined && (
        <line x1={padding} x2={width - padding} y1={compY} y2={compY}
              stroke="var(--bs-secondary)" strokeDasharray="6,6" />
      )}
      {/* axes labels - minimal */}
      <text x={8} y={12} fontSize="10" fill="var(--bs-secondary)">Temp (°C)</text>
    </svg>
  );
}

export default function WashCycles() {
  const [params] = useSearchParams();
  const initialDevice = params.get("device") ?? "ALL";

  const [cycles, setCycles] = useState<WashCycle[]>(DEMO_CYCLES);
  const [filterDevice, setFilterDevice] = useState<string>(initialDevice);
  const [filterProgram, setFilterProgram] = useState<string>("ALL");
  const [filterResult, setFilterResult] = useState<string>("ALL");
  const [active, setActive] = useState<WashCycle | null>(null);
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    // if device param is present but not in list, keep ALL
    if (filterDevice !== "ALL" && !DEVICE_IDS.includes(filterDevice)) {
      setFilterDevice("ALL");
    }
  }, [filterDevice]);

  const filtered = useMemo(() => cycles.filter(c =>
    (filterDevice === "ALL" || c.deviceId === filterDevice) &&
    (filterProgram === "ALL" || c.program === filterProgram) &&
    (filterResult === "ALL" || (filterResult === "PASS" ? c.pass : !c.pass))
  ), [cycles, filterDevice, filterProgram, filterResult]);

  function approve(cycle: WashCycle, reasonText?: string) {
    const approval: Approval = {
      by: "Nick LeMasonry",                   // demo identity
      at: new Date().toISOString(),
      reason: reasonText || undefined,
      signature: "demo-signature"
    };
    setCycles(prev => prev.map(c => c.id === cycle.id
      ? { ...c, approvals: [...(c.approvals ?? []), approval] }
      : c
    ));
    setActive(prev => prev && prev.id === cycle.id
      ? { ...prev, approvals: [...(prev.approvals ?? []), approval] }
      : prev
    );
    setReason("");
  }

  function downloadJson(cycle: WashCycle) {
    const blob = new Blob([JSON.stringify(cycle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `cycle-${cycle.cycleNo}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-0">Wash Cycles</h1>
          <div className="text-secondary small">Filter, inspect graphs, and approve cycles (audit‑stamped).</div>
        </div>
        <div className="d-flex gap-2">
          <Link to="/wash-cycles/upload" className="btn btn-outline-secondary btn-sm">
            Upload cycles (manual)
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
        <label className="text-sm" aria-label="Filter by device">
          <span className="me-2">Device</span>
          <select
            value={filterDevice}
            onChange={e => setFilterDevice(e.target.value)}
            className="form-select form-select-sm"
            style={{ width: 220 }}
          >
            <option value="ALL">All devices</option>
            {DEVICE_IDS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>

        <label className="text-sm" aria-label="Filter by program">
          <span className="me-2">Program</span>
          <select
            value={filterProgram}
            onChange={e => setFilterProgram(e.target.value)}
            className="form-select form-select-sm"
            style={{ width: 220 }}
          >
            <option value="ALL">All programs</option>
            {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>

        <label className="text-sm" aria-label="Filter by result">
          <span className="me-2">Result</span>
          <select
            value={filterResult}
            onChange={e => setFilterResult(e.target.value)}
            className="form-select form-select-sm"
            style={{ width: 160 }}
          >
            <option value="ALL">All</option>
            <option value="PASS">Pass</option>
            <option value="FAIL">Fail</option>
          </select>
        </label>
      </div>

      {/* Table */}
      <div className="card border-secondary">
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th className="text-nowrap">Cycle #</th>
                <th>Device</th>
                <th>Program</th>
                <th>Start</th>
                <th className="text-nowrap">Duration</th>
                <th>Result</th>
                <th>Approvals</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>#{c.cycleNo}</td>
                  <td>{c.deviceId}</td>
                  <td>{c.program}</td>
                  <td>{new Date(c.start).toLocaleString()}</td>
                  <td>{c.durationMin} min</td>
                  <td className={c.pass ? "text-success" : "text-danger"}>{c.pass ? "Pass" : "Fail"}</td>
                  <td>{c.approvals?.length ?? 0}</td>
                  <td className="text-nowrap">
                    <button className="btn btn-outline-secondary btn-sm me-2" onClick={() => setActive(c)}>View</button>
                    <button className="btn btn-primary btn-sm me-2" onClick={() => approve(c)}>Approve</button>
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => downloadJson(c)}>Download</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center text-secondary py-4">No cycles match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail & graph modal */}
      {active && (
        <div className="modal fade show" style={{ display: "block" }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h2 className="h6 modal-title">Cycle #{active.cycleNo} · {active.program}</h2>
                <button className="btn-close" onClick={() => setActive(null)} aria-label="Close"/>
              </div>
              <div className="modal-body">
                {active.trace?.temperatureC ? (
                  <LineChart
                    points={active.trace.temperatureC}
                    min={0}
                    max={100}
                    complianceMin={90}
                  />
                ) : (
                  <p className="text-secondary small">No temperature trace available.</p>
                )}

                <div className="mt-3 text-sm">
                  {active.pass ? (
                    <span className="text-success">Pass ✓</span>
                  ) : (
                    <span className="text-danger">Fail × {active.failReasons?.join(", ")}</span>
                  )}
                </div>

                <div className="mt-3">
                  <label className="form-label">Approval reason (optional)</label>
                  <input
                    className="form-control"
                    placeholder="e.g., Reviewed parameters and load composition"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => approve(active, reason || undefined)}>Approve</button>
                <button className="btn btn-outline-secondary" onClick={() => downloadJson(active)}>Download JSON</button>
                <button className="btn btn-outline-secondary" onClick={() => window.print()}>Print audit PDF</button>
              </div>
            </div>
          </div>
          {/* Backdrop */}
          <div className="modal-backdrop fade show" onClick={() => setActive(null)} />
        </div>
      )}
    </div>
  );
}
