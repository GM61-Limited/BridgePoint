
// src/pages/ReprocessingMonitor.tsx
import React, { useEffect, useState } from "react";

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

  // tick each second to refresh the "Running for" clocks
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
                            <button className="btn btn-outline-secondary" title="Details (placeholder)" disabled>
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
