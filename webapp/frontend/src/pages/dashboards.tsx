
// src/pages/dashboards.tsx
import { useEffect, useRef, useState } from "react";

/* -------------------------------------------------------------------------- */
/*                               TYPES & CONSTS                                */
/* -------------------------------------------------------------------------- */

type FacilityPerf = { name: string; success: number; fail: number };
type MachineType = { type: string; count: number };
type FeedItem = { t: string; msg: string };

const LIVE_REFRESH_MS_DEFAULT = 15000; // 15s
const COMPACT_DEFAULT = true;          // compact to minimise scrolling

/* -------------------------------------------------------------------------- */
/*                                DEMO DATA                                    */
/* -------------------------------------------------------------------------- */

const BASE = {
  totalMachines: 52,
  totalFacilities: 5,
  activeMachines: 28,
  cyclesToday: 337,
  failuresToday: 7,
  avgCycleMinutes: 44,
  facilityPerformance: [
    { name: "North General",     success: 98, fail: 2 },
    { name: "East Valley",       success: 95, fail: 5 },
    { name: "Westside Trust",    success: 96, fail: 4 },
    { name: "City Centre",       success: 92, fail: 8 },
    { name: "Riverside Clinic",  success: 97, fail: 3 },
  ] as FacilityPerf[],
  machineTypes: [
    { type: "Washers",          count: 212 },
    { type: "Autoclaves",       count: 131 },
    { type: "Sterrad",          count: 78  },
    { type: "Ultrasonic",       count: 54  },
    { type: "Drying Cabinets",  count: 42  },
  ] as MachineType[],
  // 24h pattern: AM ramp -> midday peak -> PM taper
  cyclesPerHour24:     [ 8, 11, 14, 18, 24, 32, 41, 49, 58, 63, 67, 72, 79, 83, 88, 92, 85, 73, 61, 54, 42, 31, 20, 12 ],
  failuresPerHour24:   [ 0,  0,  0,  1,  0,  1,  1,  0,  1,  2,  0,  0,  1,  1,  0,  0,  1,  0,  1,  1,  0,  0,  0,  0 ],
  cycles7Day:          [ 280, 312, 301, 330, 348, 362, 355 ],
  criticalAlerts: [
    "Washer 03 has failed the last 3 cycles",
    "Sterrad Unit 12: pressure curve out of tolerance",
    "Autoclave 5: thermal validation short by 1.5 min",
  ],
  activity: [
    { t: "10:12", msg: "Washer 21 completed cycle #561" },
    { t: "09:55", msg: "Washer 03 failed (Conductivity > 25 μS)" },
    { t: "09:37", msg: "Operator M. Harris logged in (North General)" },
    { t: "09:22", msg: "Washer 44 started cycle #771" },
    { t: "09:11", msg: "Auto-report exported for Westside Trust" },
  ] as FeedItem[],
};

/* -------------------------------------------------------------------------- */
/*                          RANDOM / UPDATE HELPERS                            */
/* -------------------------------------------------------------------------- */

function jitter(n: number, pct = 0.08): number {
  const delta = n * pct * (Math.random() * 2 - 1);
  return Math.max(0, n + delta);
}
function bounded(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
function rotateAndJitter(arr: number[], jitterPct = 0.1): number[] {
  const copy = [...arr.slice(1), arr[0]];
  return copy.map((v) => Math.max(0, Math.round(jitter(v, jitterPct))));
}
function updateFacilities(perf: FacilityPerf[]): FacilityPerf[] {
  return perf.map((f) => {
    const s = bounded(Math.round(jitter(f.success, 0.02)), 85, 99);
    const fail = 100 - s;
    return { ...f, success: s, fail };
  });
}
function updateMachineTypes(mt: MachineType[]): MachineType[] {
  return mt.map((m, i) => {
    const j = i === 0 ? 0.05 : 0.08; // washers more stable
    return { ...m, count: Math.round(jitter(m.count, j)) };
  });
}
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* -------------------------------------------------------------------------- */
/*                       ANIMATED COUNTERS (CountUp)                           */
/* -------------------------------------------------------------------------- */

function useCountUp(target: number, durationMs = 700, decimals = 0) {
  const [display, setDisplay] = useState<number>(target);
  const prevRef = useRef<number>(target);

  useEffect(() => {
    const start = performance.now();
    const from = prevRef.current;
    const to = target;
    const diff = to - from;
    let raf = 0;

    const step = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const val = from + diff * eased;
      setDisplay(Number(val.toFixed(decimals)));
      if (p < 1) raf = requestAnimationFrame(step);
    };

    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
    prevRef.current = target;
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, decimals]);

  return display;
}

function CountUp({ value, suffix = "", decimals = 0, duration = 700 }: {
  value: number; suffix?: string; decimals?: number; duration?: number;
}) {
  const d = useCountUp(value, duration, decimals);
  return <>{d.toLocaleString()}{suffix}</>;
}

/* -------------------------------------------------------------------------- */
/*                         PURE SVG / CSS VISUALS                              */
/* -------------------------------------------------------------------------- */

/** Donut (success vs failure) */
function DonutSummary({ success, failure }: { success: number; failure: number }) {
  const total = Math.max(1, success + failure);
  const sAngle = (success / total) * 360;
  const fAngle = (failure / total) * 360;

  const polar = (a: number) => {
    const r = 45;
    const rad = ((a - 90) * Math.PI) / 180;
    return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
  };
  const [sx, sy] = polar(0);
  const [ex1, ey1] = polar(sAngle);
  const [ex2, ey2] = polar(sAngle + fAngle);

  return (
    <svg viewBox="0 0 100 100" style={{ width: 130, height: 130 }}>
      <circle cx="50" cy="50" r="45" fill="var(--bs-body-bg)" stroke="var(--bs-border-color)" strokeWidth="3" />
      {/* Success arc */}
      <path d={`M ${sx} ${sy} A 45 45 0 ${sAngle > 180 ? 1 : 0} 1 ${ex1} ${ey1}`} stroke="var(--bs-success)" strokeWidth="12" fill="none" />
      {/* Failure arc */}
      <path d={`M ${ex1} ${ey1} A 45 45 0 ${fAngle > 180 ? 1 : 0} 1 ${ex2} ${ey2}`} stroke="var(--bs-danger)" strokeWidth="12" fill="none" />
      <circle cx="50" cy="50" r="30" fill="var(--bs-body-bg)" />
      <text x="50" y="47" textAnchor="middle" style={{ fill: "var(--bs-body-color)", fontSize: "12px" }}>Success</text>
      <text x="50" y="63" textAnchor="middle" style={{ fill: "var(--bs-body-color)", fontSize: "15px", fontWeight: 600 }}>
        {Math.round((success / total) * 100)}%
      </text>
    </svg>
  );
}

/** Animated bars + failure overlay (24 points) */
function CyclesByHour({ values, failures, compact }: { values: number[]; failures: number[]; compact: boolean; }) {
  const max = Math.max(...values, 1);
  const failMax = Math.max(...failures, 1);
  const barW = compact ? 8 : 12;
  const chartH = compact ? 110 : 140;
  const barH = chartH - (compact ? 18 : 20);

  return (
    <div className="position-relative">
      <div className="d-flex align-items-end gap-2" style={{ height: chartH }}>
        {values.map((v, i) => (
          <div
            key={i}
            style={{
              width: barW,
              height: `${(v / max) * barH}px`,
              background: "var(--bs-primary)",
              borderRadius: 4,
              opacity: 0.9,
              transition: "height 600ms ease",
            }}
            title={`${v} cycles @ ${i}:00`}
          />
        ))}
      </div>
      <svg width="100%" height={chartH} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <polyline
          fill="none"
          stroke="var(--bs-danger)"
          strokeWidth={compact ? 2 : 2.5}
          points={failures
            .map((f, i) => {
              const x = i * (100 / (failures.length - 1));
              const y = chartH - (f / failMax) * barH;
              return `${x},${isFinite(y) ? y : chartH}`;
            })
            .join(" ")}
        />
      </svg>
    </div>
  );
}

/** Facility performance card (animated bar) */
function FacilityCard({ perf, compact }: { perf: FacilityPerf; compact: boolean }) {
  return (
    <div className="card border-secondary h-100">
      <div className="card-body">
        <div className="d-flex justify-content-between">
          <h3 className="h6 mb-0">{perf.name}</h3>
          <span className="text-danger small">{perf.fail}% fail</span>
        </div>
        <div className={`mt-${compact ? 2 : 3} d-flex align-items-baseline justify-content-between`}>
          <div className="text-success fw-semibold">{perf.success}%</div>
        </div>
        <div
          className="mt-2"
          style={{
            height: compact ? 8 : 10,
            width: "100%",
            background: "var(--bs-secondary-bg)",
            borderRadius: 5,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${perf.success}%`,
              height: "100%",
              background: "var(--bs-success)",
              transition: "width 600ms ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Machine type colourful bars (animated widths) */
function MachineTypeBars({ data, compact }: { data: MachineType[]; compact: boolean }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const palette = ["var(--bs-primary)", "var(--bs-success)", "var(--bs-info)", "var(--bs-warning)", "var(--bs-danger)"];

  return (
    <div>
      {data.map((d, i) => {
        const pct = Math.round((d.count / max) * 100);
        return (
          <div key={d.type} className={compact ? "mb-2" : "mb-3"}>
            <div className="d-flex justify-content-between small fw-semibold">
              <span>{d.type}</span>
              <span className="text-secondary">{d.count.toLocaleString()} cycles</span>
            </div>
            <div
              style={{
                height: compact ? 10 : 14,
                width: `${pct}%`,
                background: palette[i % palette.length],
                borderRadius: 6,
                transition: "width 600ms ease",
              }}
              title={`${d.count} cycles`}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Robust semi‑donut gauge using stroke-dasharray (no arc math pitfalls) */
function AvgDurationGauge({ minutes, compact }: { minutes: number; compact: boolean }) {
  const minV = 30, maxV = 60;
  const clamped = bounded(minutes, minV, maxV);
  const ratio = (clamped - minV) / (maxV - minV); // 0..1
  const pathLen = 100;                              // virtual length
  const dash = Math.max(0.0001, ratio * pathLen);   // avoid 0-length edge cases
  const gap  = pathLen - dash;
  const color = ratio < 0.4 ? "var(--bs-success)" : ratio < 0.75 ? "var(--bs-warning)" : "var(--bs-danger)";
  const w = compact ? 180 : 220, h = compact ? 90 : 120;

  return (
    <div className="text-center">
      <svg viewBox="0 0 100 60" style={{ width: w, height: h }}>
        {/* Track */}
        <path d="M5,50 A45,45 0 1 1 95,50"
              stroke="var(--bs-border-color)" strokeWidth="10" fill="none" />
        {/* Value */}
        <path d="M5,50 A45,45 0 1 1 95,50"
              stroke={color} strokeWidth="10" fill="none"
              strokeDasharray={`${dash} ${gap}`} pathLength={pathLen}
              style={{ transition: "stroke-dasharray 600ms ease" }} />
        <text x="50" y="55" textAnchor="middle" style={{ fill: "var(--bs-body-color)", fontSize: compact ? "10px" : "12px" }}>
          Avg duration
        </text>
      </svg>
      <div className={compact ? "fw-semibold" : "fs-5 fw-semibold"}>{Math.round(clamped)} min</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    PAGE                                    */
/* -------------------------------------------------------------------------- */

export default function Dashboards() {
  // Live flags
  const [live, setLive] = useState<boolean>(true);
  const [speedMs, setSpeedMs] = useState<number>(LIVE_REFRESH_MS_DEFAULT);
  const [compact, setCompact] = useState<boolean>(COMPACT_DEFAULT);

  // Live state
  const [cyclesToday, setCyclesToday]       = useState<number>(BASE.cyclesToday);
  const [failuresToday, setFailuresToday]   = useState<number>(BASE.failuresToday);
  const [activeMachines, setActiveMachines] = useState<number>(BASE.activeMachines);
  const [avgMinutes, setAvgMinutes]         = useState<number>(BASE.avgCycleMinutes);

  const [cycles24, setCycles24] = useState<number[]>(BASE.cyclesPerHour24);
  const [fails24, setFails24]   = useState<number[]>(BASE.failuresPerHour24);
  const [facPerf, setFacPerf]   = useState<FacilityPerf[]>(BASE.facilityPerformance);
  const [machineTypes, setMachineTypes] = useState<MachineType[]>(BASE.machineTypes);
  const [cycles7Day, setCycles7Day] = useState<number[]>(BASE.cycles7Day);
  const [criticalAlerts, setCriticalAlerts] = useState<string[]>(BASE.criticalAlerts);
  const [feed, setFeed] = useState<FeedItem[]>(BASE.activity);

  // Sim engine
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!live) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = window.setInterval(() => {
      setCyclesToday((c) => Math.round(c + 5 + Math.random() * 12));
      setFailuresToday((f) => bounded(Math.round(jitter(f, 0.1)), 3, 12));
      setActiveMachines((a) => bounded(Math.round(jitter(a, 0.1)), 18, 38));
      setAvgMinutes((m) => bounded(Math.round(jitter(m, 0.03)), 35, 55));

      setCycles24((arr) => rotateAndJitter(arr, 0.12));
      setFails24((arr) => rotateAndJitter(arr, 0.25).map((v) => bounded(v, 0, 3)));
      setFacPerf((p) => updateFacilities(p));
      setMachineTypes((m) => updateMachineTypes(m));
      setCycles7Day((d) => rotateAndJitter(d, 0.06));

      if (Math.random() > 0.72) {
        const candidates = [
          "Machine 03 failed 3 consecutive cycles",
          "Sterrad 12: vacuum hold near threshold",
          "Washer 28: door sensor intermittent",
          "Autoclave 5: load temp slow rise",
        ];
        setCriticalAlerts((prev) => [pickRandom(candidates), ...prev].slice(0, 5));
      }
      if (Math.random() > 0.6) {
        const candidates = [
          "Washer 06 completed cycle",
          "Operator J. Patel logged in (Riverside Clinic)",
          "Washer 44 started cycle",
          "Exported performance report",
          "Conductivity reading within spec",
        ];
        const t = new Date().toTimeString().slice(0, 5);
        setFeed((prev) => [{ t, msg: pickRandom(candidates) }, ...prev].slice(0, 8));
      }
    }, speedMs) as unknown as number;

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [live, speedMs]);

  //const successToday = Math.max(0, cyclesToday - failuresToday);

  // Heartbeat CSS (scoped)
  const heartbeat = `
  @keyframes heartbeat {
    0% { box-shadow: 0 0 0 0 rgba(13,110,253,.45); }
    70%{ box-shadow: 0 0 0 12px rgba(13,110,253,0); }
    100%{ box-shadow: 0 0 0 0 rgba(13,110,253,0); }
  }
  .heartbeat { animation: heartbeat 1.6s ease-in-out infinite; border-color: var(--bs-primary)!important; }
  `;

  // Layout tweaks for compact mode
  const kpiNumClass = compact ? "h3 fw-bold" : "display-6 fw-bold";
  const sectionGapClass = compact ? "g-3" : "g-4";
  const kpiRowMargin = compact ? "mb-3" : "mb-4";

  return (
    <div className="container py-3">
      <style>{heartbeat}</style>

      {/* Header + controls */}
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h1 className="h5 mb-1">Analytics Dashboard</h1>
          <div className="text-secondary">Across {BASE.totalFacilities} facilities • Demo with live simulation</div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" id="liveToggle"
                   checked={live} onChange={(e) => setLive(e.target.checked)} />
            <label className="form-check-label" htmlFor="liveToggle">Live</label>
          </div>
          <select
            className="form-select form-select-sm"
            value={String(speedMs)}
            onChange={(e) => setSpeedMs(Number(e.target.value))}
            aria-label="Update speed"
            style={{ width: 140 }}
          >
            <option value={25000}>Slow (25s)</option>
            <option value={15000}>Normal (15s)</option>
            <option value={7000}>Fast (7s)</option>
          </select>

          <div className="form-check form-switch ms-2">
            <input className="form-check-input" type="checkbox" id="compactToggle"
                   checked={compact} onChange={(e) => setCompact(e.target.checked)} />
            <label className="form-check-label" htmlFor="compactToggle">Compact</label>
          </div>
        </div>
      </div>

      {/* KPI ROW — four tiles (Active has heartbeat) */}
      <div className={`row ${sectionGapClass} ${kpiRowMargin}`}>
        <div className="col-6 col-md-3">
          <div className="card border-primary">
            <div className="card-body py-2">
              <div className="text-secondary small">Total machines</div>
              <div className={kpiNumClass}>
                <CountUp value={BASE.totalMachines} />
              </div>
              <div className="text-secondary small">across {BASE.totalFacilities} facilities</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className={`card ${live ? "heartbeat" : "border-info"}`}>
            <div className="card-body py-2">
              <div className="text-secondary small">Active right now</div>
              <div className={kpiNumClass}>
                <CountUp value={activeMachines} />
              </div>
              <div className="text-secondary small">live simulated</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-success">
            <div className="card-body py-2">
              <div className="text-secondary small">Cycles today</div>
              <div className={kpiNumClass}>
                <CountUp value={cyclesToday} />
              </div>
              <div className="text-secondary small">growing gradually</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-danger">
            <div className="card-body py-2">
              <div className="text-secondary small">Failed cycles</div>
              <div className={`${kpiNumClass} text-danger`}>
                <CountUp value={failuresToday} />
              </div>
              <div className="text-secondary small">
                ~ <CountUp value={Math.round((failuresToday / Math.max(1, cyclesToday)) * 100)} suffix="%" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 1 — Donut + 24h chart */}
      <div className={`row ${sectionGapClass} ${compact ? "mb-3" : "mb-4"}`}>
        <div className="col-lg-4">
          <div className="card border-secondary h-100">
            <div className="card-body d-flex flex-column align-items-center justify-content-center">
              <h2 className="h6 mb-2">Success vs Failures</h2>
              <DonutSummary success={Math.max(0, cyclesToday - failuresToday)} failure={failuresToday} />
            </div>
          </div>
        </div>
        <div className="col-lg-8">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <h2 className="h6 mb-2">Cycles by Hour (24h, animated)</h2>
              <CyclesByHour values={cycles24} failures={fails24} compact={compact} />
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2 — Facility cards + Machine types + Avg duration (side‑by‑side) */}
      <div className={`row ${sectionGapClass} ${compact ? "mb-3" : "mb-4"}`}>
        <div className="col-lg-7">
          <h2 className="h6 mb-2">Facility Performance</h2>
          <div className={`row ${sectionGapClass}`}>
            {facPerf.map((f) => (
              <div key={f.name} className="col-6 col-xl-4">
                <FacilityCard perf={f} compact={compact} />
              </div>
            ))}
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <h2 className="h6 mb-2">Cycles by Machine Type</h2>
              <MachineTypeBars data={machineTypes} compact={compact} />
              <div className="border-top pt-2 mt-3">
                <AvgDurationGauge minutes={avgMinutes} compact={compact} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 3 — 7-day, Alerts, Activity (single row to avoid scroll) */}
      <div className={`row ${sectionGapClass}`}>
        <div className="col-lg-4">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <h2 className="h6 mb-2">7‑Day Throughput</h2>
              <SevenDayTrend values={cycles7Day} />
              <div className="text-secondary small mt-1">animated bars (demo)</div>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card border-danger h-100">
            <div className="card-body">
              <h2 className="h6 text-danger mb-2">Critical Alerts</h2>
              <ul className="list-group list-group-flush small">
                {criticalAlerts.map((msg, i) => (
                  <li key={i} className="list-group-item bg-transparent border-secondary">⚠ {msg}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <h2 className="h6 mb-2">Recent Activity</h2>
              <ul className="list-group list-group-flush small">
                {feed.map((a, i) => (
                  <li key={`${a.t}-${i}`} className="list-group-item bg-transparent border-secondary">
                    <span className="text-secondary">{a.t}</span> — {a.msg}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

/** 7‑day bars */
function SevenDayTrend({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="d-flex align-items-end gap-2" style={{ height: 70 }}>
      {values.map((v, i) => (
        <div
          key={i}
          title={`${v} cycles`}
          style={{
            width: 18,
            height: `${(v / max) * 60}px`,
            background: "var(--bs-info)",
            borderRadius: 4,
            transition: "height 600ms ease",
          }}
        />
      ))}
    </div>
  );
}
