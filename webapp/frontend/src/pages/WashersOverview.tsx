
// src/pages/WashersOverview.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

/** Types consistent with Devices.tsx */
type DeviceType = "Washer" | "Autoclave" | "Steriliser";
type DeviceStatus = "Idle" | "Running" | "Fault";

interface Device {
  id: string;
  name: string;
  type: DeviceType;
  site: string;
  manufacturer: string;
  version?: string;
  status: DeviceStatus;
  cycleNumber?: number;
  phase: string;
  temperature?: number;   // °C
  pressure?: number;      // kPa
  doorOpen: boolean;
  operator?: string;
}

/** Demo data */
const SITES = ["North General Hospital", "East Valley Clinic", "Westside Community Trust"];

const DEMO: Device[] = [
  { id: "w-01", name: "Washer 01", type: "Washer", site: SITES[0], manufacturer: "Getinge", version: "v4.2.1",
    status: "Running", cycleNumber: 124, phase: "Wash", temperature: 62.4, pressure: 12.2, doorOpen: false, operator: "A. Patel" },
  { id: "w-02", name: "Washer 02", type: "Washer", site: SITES[0], manufacturer: "Belimed", version: "v3.9.0",
    status: "Idle", cycleNumber: 0, phase: "Ready", temperature: 22.1, pressure: 0.0, doorOpen: true },
  { id: "w-03", name: "Washer 03", type: "Washer", site: SITES[1], manufacturer: "MMM", version: "v5.1.3",
    status: "Fault", cycleNumber: 37, phase: "Dry", temperature: 40.2, pressure: 15.0, doorOpen: false, operator: "M. Chen" },
  { id: "w-04", name: "Washer 04", type: "Washer", site: SITES[1], manufacturer: "Getinge", version: "v4.1.0",
    status: "Running", cycleNumber: 68, phase: "Rinse", temperature: 45.3, pressure: 11.0, doorOpen: false, operator: "S. Ahmed" },
  { id: "w-05", name: "Washer 05", type: "Washer", site: SITES[2], manufacturer: "Belimed", version: "v3.8.2",
    status: "Idle", cycleNumber: 0, phase: "Ready", temperature: 21.8, pressure: 0.0, doorOpen: false },
  { id: "w-06", name: "Washer 06", type: "Washer", site: SITES[2], manufacturer: "MMM", version: "v5.2.0",
    status: "Running", cycleNumber: 12, phase: "Thermal", temperature: 91.0, pressure: 13.6, doorOpen: false, operator: "K. O’Neill" },
  { id: "w-07", name: "Washer 07", type: "Washer", site: SITES[0], manufacturer: "Getinge", version: "v4.0.9",
    status: "Idle", cycleNumber: 0, phase: "Ready", temperature: 22.0, pressure: 0.0, doorOpen: false },
  { id: "a-01", name: "Autoclave A1", type: "Autoclave", site: SITES[1], manufacturer: "STERIS", version: "v2.7.8",
    status: "Running", cycleNumber: 53, phase: "Sterilise", temperature: 134.0, pressure: 210.0, doorOpen: false, operator: "J. Smith" }
];

const RECENT_RESULTS: Record<string, boolean[]> = {
  "w-01": [true, true, true, false, true, true, true, true, true, true, true, true],
  "w-02": [true, true, true, true, true, true, true, true, true, true, true, true],
  "w-03": [true, false, false, true, false, false, true, false, true, false, false, false],
  "w-04": [true, true, true, true, true, true, true, true, true, false, true, true],
  "w-05": [true, true, true, true, true, true, true, true, true, true, true, true],
  "w-06": [true, true, true, true, true, true, true, true, true, true, true, true],
  "w-07": [true, true, true, true, true, true, true, true, true, true, true, true]
};

/** Utilities */
function StatusBadge({ status }: { status: DeviceStatus }) {
  const cls =
    status === "Running" ? "text-bg-primary" :
    status === "Fault"   ? "text-bg-danger"  :
                           "text-bg-secondary";
  // Smaller badge
  return (
    <span
      className={`badge ${cls}`}
      style={{ fontSize: "0.65rem", lineHeight: 1, padding: "0.25em 0.5em" }}
    >
      {status}
    </span>
  );
}

function PassFailSparkline({ results }: { results: boolean[] }) {
  return (
    <div className="d-flex gap-1" aria-label="Recent cycle results">
      {results.map((ok: boolean, i: number) => (
        <span
          key={i}
          style={{ display: "inline-block", width: "0.375rem", height: "0.75rem", borderRadius: "0.125rem" }}
          className={ok ? "bg-success" : "bg-danger"}
          title={`${ok ? "Pass" : "Fail"} · #${i + 1}`}
        />
      ))}
    </div>
  );
}

/** Issues (with severity) */
type Severity = "low" | "medium" | "high";
function getIssues(d: Device): { msg: string; sev: Severity }[] {
  const issues: { msg: string; sev: Severity }[] = [];
  if (d.type !== "Washer") return issues;
  if (d.status === "Fault") issues.push({ msg: "Device fault", sev: "high" });
  if (d.status === "Running" && d.doorOpen) issues.push({ msg: "Door open while running", sev: "medium" });
  if ((d.pressure ?? 0) > 200) issues.push({ msg: "Pressure out of expected washer range", sev: "medium" });
  return issues;
}

/** Stable polling (Strict Mode: no double immediate run) */
function usePolling(fn: () => void, intervalMs = 30000, runImmediately = true) {
  const savedFn = useRef(fn);
  const hasRunImmediateRef = useRef(false);

  // keep ref current without resetting the interval
  useEffect(() => {
    savedFn.current = fn;
  }, [fn]);

  useEffect(() => {
    // Avoid duplicate immediate call in React 18 Strict Mode dev double-mount
    if (runImmediately && !hasRunImmediateRef.current) {
      savedFn.current();
      hasRunImmediateRef.current = true;
    }

    const id = window.setInterval(() => {
      savedFn.current();
    }, intervalMs);

    return () => {
      window.clearInterval(id);
    };
  }, [intervalMs, runImmediately]);
}

/** Page */
export default function WashersOverview() {
  const [searchParams] = useSearchParams(); // no unused variable warning
  const navigate = useNavigate();

  const [loading, setLoading] = useState<boolean>(true);
  const [devices, setDevices] = useState<Device[]>(DEMO);
  const washers: Device[] = useMemo(() => devices.filter(d => d.type === "Washer"), [devices]);

  // Filters
  const [query, setQuery] = useState<string>(searchParams.get("q") ?? "");
  const [site, setSite] = useState<string>(searchParams.get("site") ?? "");
  const [manufacturer, setManufacturer] = useState<string>(searchParams.get("mfr") ?? "");
  const [chip, setChip] = useState<"All" | "Running" | "Idle" | "Fault">((searchParams.get("chip") as any) ?? "All");

  // Derived
  const manufacturers: string[] = useMemo(
    () => Array.from(new Set(washers.map(w => w.manufacturer))),
    [washers]
  );

  // KPIs
  const total: number = washers.length;
  const runningCount: number = washers.filter(w => w.status === "Running").length;
  const faultCount: number = washers.filter(w => w.status === "Fault").length;

  /** Per-device timing to slow down w-04/w-06 updates */
  const lastUpdateRef = useRef<Record<string, number>>({});
  const getUpdateInterval = (d: Device) =>
    (d.id === "w-04" || d.id === "w-06") ? 120_000 : 30_000; // 2 min vs 30 s
  const getDeltaScale = (d: Device) =>
    (d.id === "w-04" || d.id === "w-06") ? 0.25 : 1;         // smaller magnitude too

  // Polling target (stable)
  const refreshTemps = useCallback(() => {
    const now = Date.now();
    setDevices(prev =>
      prev.map((d: Device) => {
        if (d.type !== "Washer" || d.status !== "Running") return d;
        if (d.id === "w-01") return d; // freeze Washer 01 for demo stability

        // throttle per device
        const last = lastUpdateRef.current[d.id] ?? 0;
        const interval = getUpdateInterval(d);
        if (now - last < interval) return d;
        lastUpdateRef.current[d.id] = now;

        // small ± delta with sensible clamp per phase
        const baseDelta = (Math.random() - 0.5) * 0.4; // ±0.2°C baseline for most
        const scaledDelta = baseDelta * getDeltaScale(d);
        const current = typeof d.temperature === "number" ? d.temperature : 22;
        const phaseMax = d.phase === "Thermal" ? 95 : 75;
        const next = Math.max(15, Math.min(phaseMax, current + scaledDelta));
        return { ...d, temperature: next };
      })
    );
  }, []);

  // Polling (every 30s baseline; immediate run guarded for Strict Mode)
  usePolling(refreshTemps, 30_000, true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(t);
  }, []);

  const filtered: Device[] = useMemo(() => {
    return washers.filter((d: Device) => {
      const matchText = [d.name, d.manufacturer, d.site, d.status, d.phase]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchSite = !site || d.site === site;
      const matchMfr = !manufacturer || d.manufacturer === manufacturer;
      const matchChip = chip === "All" || d.status === chip;
      return matchText && matchSite && matchMfr && matchChip;
    });
  }, [washers, query, site, manufacturer, chip]);

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-0">Washers Overview</h1>
          <div className="text-secondary small">Fleet of washer‑disinfectors across facilities.</div>
        </div>
        <div className="d-flex gap-2">
          <Link to="/wash-cycles" className="btn btn-outline-secondary btn-sm">All cycles</Link>
          <Link to="/wash-cycles/upload" className="btn btn-outline-secondary btn-sm">Upload cycles</Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-sm-6 col-lg-4 d-flex">
          <div className="card border-secondary flex-fill">
            <div className="card-body">
              <div>Total washers</div>
              <div className="h4 mb-0">{total}</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-lg-4 d-flex">
          <div className="card border-secondary flex-fill">
            <div className="card-body">
              <div>Running</div>
              <div className="h4 mb-0">{runningCount}</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-lg-4 d-flex">
          <div className="card border-secondary flex-fill">
            <div className="card-body">
              <div>Faults</div>
              <div className="h4 mb-0">{faultCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="row g-2 align-items-center mb-3">
        <div className="col-12 col-sm-6 col-md-4 col-lg-3">
          <select
            className="form-select form-select-sm"
            value={site}
            onChange={e => setSite(e.target.value)}
            aria-label="Filter by site"
          >
            <option value="">All sites</option>
            {SITES.map((s: string) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="col-12 col-sm-6 col-md-4 col-lg-3">
          <select
            className="form-select form-select-sm"
            value={manufacturer}
            onChange={e => setManufacturer(e.target.value)}
            aria-label="Filter by manufacturer"
          >
            <option value="">All manufacturers</option>
            {manufacturers.map((m: string) => <option key={m}>{m}</option>)}
          </select>
        </div>

        <div className="col-12 col-md-4 col-lg-3">
          <input
            className="form-control form-control-sm"
            placeholder="Search..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search"
          />
        </div>

        <div className="col-12 col-lg-3">
          <div className="btn-group btn-group-sm w-100" role="group" aria-label="Status filter">
            <button
              className={`btn ${chip === "Running" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setChip("Running")}
            >
              Running
            </button>
            <button
              className={`btn ${chip === "Idle" ? "btn-secondary" : "btn-outline-secondary"}`}
              onClick={() => setChip("Idle")}
            >
              Idle
            </button>
            <button
              className={`btn ${chip === "Fault" ? "btn-danger" : "btn-outline-secondary"}`}
              onClick={() => setChip("Fault")}
            >
              Fault
            </button>
            <button
              className={`btn ${chip === "All" ? "btn-outline-dark" : "btn-outline-secondary"}`}
              onClick={() => setChip("All")}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="row g-3">
        {loading && Array.from({ length: 6 }).map((_, i: number) => (
          <div key={i} className="col-12 col-sm-6 col-xl-4 d-flex">
            <div className="card border-secondary flex-fill h-100">
              <div className="card-body placeholder-glow">
                <span className="placeholder col-6"></span>
              </div>
            </div>
          </div>
        ))}

        {!loading && filtered.map((d: Device) => {
          const issues = getIssues(d);
          const hasIssues = issues.length > 0;
          const cardBorderClass = hasIssues ? "border-danger" : d.status === "Running" ? "border-primary" : "border-secondary";
          const cardGlowStyle = hasIssues
            ? { boxShadow: "0 0 0.75rem rgba(var(--bs-danger-rgb), .35)" }
            : d.status === "Running"
            ? { boxShadow: "0 0 0.75rem rgba(var(--bs-primary-rgb), .30)" }
            : undefined;
          const recent = RECENT_RESULTS[d.id] ?? [];

          return (
            <div key={d.id} className="col-12 col-sm-6 col-xl-4 d-flex">
              <div className={`card ${cardBorderClass} flex-fill h-100`} style={cardGlowStyle}>
                <div className="card-body d-flex flex-column">
                  <div className="d-flex justify-content-between">
                    <div>
                      <div className="fw-semibold">{d.name}</div>
                      <div className="text-secondary small">{d.manufacturer}{d.version ? ` • ${d.version}` : ""}</div>
                      <div className="text-secondary small">{d.site}</div>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>

                  <div className="mt-2 text-secondary small">
                    <div>Cycle: {d.cycleNumber ?? "—"} · Phase: {d.phase}</div>
                    <div>
                      Temp: {typeof d.temperature === "number" ? `${d.temperature.toFixed(1)} °C` : "—"}
                      {" "}· Pressure: {typeof d.pressure === "number" ? `${d.pressure.toFixed(1)} kPa` : "—"}
                    </div>
                  </div>

                  {recent.length > 0 && <div className="mt-2"><PassFailSparkline results={recent} /></div>}

                  {hasIssues && (
                    <ul className="mt-2 small mb-0">
                      {issues.map((i: { msg: string; sev: Severity }, idx: number) => (
                        <li
                          key={idx}
                          className={i.sev === "high" ? "text-danger" : i.sev === "medium" ? "text-warning" : "text-secondary"}
                        >
                          {i.msg}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-auto d-flex justify-content-between align-items-center pt-2">
                    <div className="btn-group btn-group-sm">
                      {/* Use programmatic navigation to ensure it always works */}
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => navigate(`/devices/${encodeURIComponent(d.id)}`)}
                      >
                        View device
                      </button>
                      <Link to={`/wash-cycles?device=${encodeURIComponent(d.id)}`} className="btn btn-outline-secondary">
                        View cycles
                      </Link>
                      <Link to="/wash-cycles/upload" className="btn btn-outline-secondary">
                        Upload cycle
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
