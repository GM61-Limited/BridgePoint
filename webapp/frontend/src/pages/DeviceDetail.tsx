
// src/pages/DeviceDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

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
  temperature?: number;
  pressure?: number;
  doorOpen: boolean;
  operator?: string;
  config?: { waterType?: string; chemistry?: string; thermalHoldMin?: number; tempMinC?: number };
}

/** Demo devices — IDs match WashersOverview (w-01, w-03, w-06) */
const DEMO_DEVICES: Device[] = [
  { id: "w-01", name: "Washer 01", type: "Washer", site: "North General Hospital", manufacturer: "Getinge", version: "v4.2.1",
    status: "Running", cycleNumber: 124, phase: "Wash", temperature: 62.4, pressure: 12.2, doorOpen: false, operator: "A. Patel",
    config: { waterType: "RO", chemistry: "Enzymatic", thermalHoldMin: 10, tempMinC: 90 } },
  { id: "w-03", name: "Washer 03", type: "Washer", site: "East Valley Clinic", manufacturer: "MMM", version: "v5.1.3",
    status: "Fault", cycleNumber: 37, phase: "Dry", temperature: 40.2, pressure: 15.0, doorOpen: false, operator: "M. Chen",
    config: { waterType: "Deionised", chemistry: "Neutral", thermalHoldMin: 10, tempMinC: 90 } },
  { id: "w-06", name: "Washer 06", type: "Washer", site: "Westside Community Trust", manufacturer: "MMM", version: "v5.2.0",
    status: "Running", cycleNumber: 12, phase: "Thermal", temperature: 91.0, pressure: 13.6, doorOpen: false, operator: "K. O’Neill",
    config: { waterType: "RO", chemistry: "Enzymatic", thermalHoldMin: 10, tempMinC: 90 } }
];

function StatusBadge({ status }: { status: DeviceStatus }) {
  const cls =
    status === "Running" ? "text-bg-primary" :
    status === "Fault"   ? "text-bg-danger"  :
                           "text-bg-secondary";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const [device, setDevice] = useState<Device | null>(null);

  useEffect(() => {
    const d = DEMO_DEVICES.find(x => x.id === deviceId) ?? null;
    setDevice(d);
  }, [deviceId]);

  if (!device) {
    return (
      <div className="container py-4">
        <div className="alert alert-warning d-flex justify-content-between align-items-center">
          <span>Device not found.</span>
          <Link to="/washers" className="btn btn-outline-secondary btn-sm">Back to Washers</Link>
        </div>
      </div>
    );
  }

  // Demo telemetry arrays (theme-aware UI)
  const temps: number[] = useMemo(() => {
    const base = device.temperature ?? 22;
    const jitter = device.status === "Running" ? 0.2 : 0.05;
    return Array.from({ length: 18 }, (_, i) => +(base + (Math.sin(i / 3) * jitter)).toFixed(1));
  }, [device.temperature, device.status]);

  const pressures: number[] = useMemo(() => {
    const base = device.pressure ?? 0;
    const jitter = device.status === "Running" ? 0.3 : 0.05;
    return Array.from({ length: 18 }, (_, i) => +(base + (Math.cos(i / 4) * jitter)).toFixed(1));
  }, [device.pressure, device.status]);

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <h1 className="h4 mb-0">{device.name}</h1>
            <StatusBadge status={device.status} />
          </div>
          <div className="text-secondary small">
            {device.type} • {device.manufacturer}{device.version ? ` • ${device.version}` : ""} • {device.site}
          </div>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate(-1)}>Back</button>
          <Link to={`/wash-cycles?device=${encodeURIComponent(device.id)}`} className="btn btn-outline-secondary btn-sm">View cycles</Link>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {/* Status card */}
      <div className={`card ${device.status === "Fault" ? "border-danger" : device.status === "Running" ? "border-primary" : "border-secondary"} mb-3`}
           style={device.status === "Fault"
             ? { boxShadow: "0 0 0.75rem rgba(var(--bs-danger-rgb), .35)" }
             : device.status === "Running"
             ? { boxShadow: "0 0 0.75rem rgba(var(--bs-primary-rgb), .30)" }
             : undefined}>
        <div className="card-body">
          <div className="row g-3 text-secondary small">
            <div className="col-6 col-md-4"><div className="d-flex justify-content-between"><span>Cycle</span><span className="fw-semibold">{device.cycleNumber ?? "—"}</span></div></div>
            <div className="col-6 col-md-4"><div className="d-flex justify-content-between"><span>Phase</span><span className="fw-semibold">{device.phase}</span></div></div>
            <div className="col-6 col-md-4"><div className="d-flex justify-content-between"><span>Door</span><span className="fw-semibold">{device.doorOpen ? "Open" : "Closed"}</span></div></div>
            <div className="col-6 col-md-4"><div className="d-flex justify-content-between"><span>Temperature</span><span className="fw-semibold">{typeof device.temperature === "number" ? `${device.temperature.toFixed(1)} °C` : "—"}</span></div></div>
            <div className="col-6 col-md-4"><div className="d-flex justify-content-between"><span>Pressure</span><span className="fw-semibold">{typeof device.pressure === "number" ? `${device.pressure.toFixed(1)} kPa` : "—"}</span></div></div>
            <div className="col-6 col-md-4"><div className="d-flex justify-content-between"><span>Operator</span><span className="fw-semibold">{device.operator ?? "—"}</span></div></div>
          </div>
        </div>
      </div>

      {/* Telemetry mini-charts (pure CSS bars, theme-aware) */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-lg-6">
          <div className="card border-secondary">
            <div className="card-body">
              <h2 className="h6">Temperature (recent)</h2>
              <div className="d-flex align-items-end gap-1" style={{ height: 72 }}>
                {temps.map((p: number, idx: number) => (
                  <div key={idx} title={`${p} °C`} style={{ width: 10, height: Math.max(4, (p / 100) * 68), background: "var(--bs-primary)", borderRadius: 2, opacity: 0.9 }} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="card border-secondary">
            <div className="card-body">
              <h2 className="h6">Pressure (recent)</h2>
              <div className="d-flex align-items-end gap-1" style={{ height: 72 }}>
                {pressures.map((p: number, idx: number) => (
                  <div key={idx} title={`${p} kPa`} style={{ width: 10, height: Math.max(4, (p / 220) * 68), background: "var(--bs-primary)", borderRadius: 2, opacity: 0.9 }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="d-flex justify-content-between align-items-center">
        <div className="text-secondary small">Updated just now (demo)</div>
        <div className="d-flex gap-2">
          <Link to="/washers" className="btn btn-outline-secondary btn-sm">Back to Washers</Link>
          <Link to={`/wash-cycles?device=${encodeURIComponent(device.id)}`} className="btn btn-outline-secondary btn-sm">View cycles</Link>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}>Print</button>
        </div>
      </div>
    </div>
  );
}
