// src/pages/DeviceDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getMachine, type Machine } from "../lib/api";

function toTitle(s?: string | null) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="d-flex justify-content-between py-1 border-bottom border-secondary-subtle">
      <div className="text-secondary small">{label}</div>
      <div className="text-body small text-end" style={{ maxWidth: "65%" }}>
        {value || "—"}
      </div>
    </div>
  );
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  const cls = enabled ? "text-bg-success" : "text-bg-secondary";
  return (
    <span
      className={`badge ${cls}`}
      style={{ fontSize: "0.7rem", lineHeight: 1, padding: "0.25em 0.5em" }}
    >
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

export default function DeviceDetail() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  const parsedId = useMemo(() => {
    // deviceId comes from /devices/:deviceId
    // We now pass numeric machine IDs
    const n = Number(deviceId);
    return Number.isFinite(n) ? n : null;
  }, [deviceId]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [machine, setMachine] = useState<Machine | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");
      setMachine(null);

      if (parsedId === null) {
        setError("Invalid device id.");
        setLoading(false);
        return;
      }

      try {
        const m = await getMachine(parsedId);
        if (!alive) return;
        setMachine(m);
      } catch (e: any) {
        if (!alive) return;
        // If API returns 404, show "Device not found."
        const msg = e?.message || "Failed to load device.";
        setError(msg.toLowerCase().includes("not found") ? "Device not found." : msg);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [parsedId]);

  if (loading) {
    return (
      <div className="container py-4">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h1 className="h5 mb-0">Device details</h1>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate("/washers")}>
            Back to Washers
          </button>
        </div>

        <div className="card border-secondary">
          <div className="card-body">
            <div className="placeholder-glow">
              <span className="placeholder col-6" />
              <span className="placeholder col-4" />
              <span className="placeholder col-8" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="container py-4">
        <div
          className="alert alert-warning d-flex justify-content-between align-items-center"
          role="alert"
        >
          <span>{error || "Device not found."}</span>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate("/washers")}>
            Back to Washers
          </button>
        </div>
      </div>
    );
  }

  const host =
    machine.hostname ||
    (machine.ip_address ? `${machine.ip_address}${machine.port ? `:${machine.port}` : ""}` : "");

  const subtitle =
    `${machine.manufacturer ? machine.manufacturer : "Unknown manufacturer"}${machine.model ? ` • ${machine.model}` : ""}`;

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <h1 className="h5 mb-0">{machine.machine_name}</h1>
            <EnabledBadge enabled={machine.is_active} />
          </div>
          <div className="text-secondary small">{subtitle}</div>
          <div className="text-secondary small">
            Code: <span className="font-monospace">{machine.machine_code}</span>
          </div>
        </div>

        <div className="d-flex gap-2">
          <Link
            to={`/wash-cycles?device=${encodeURIComponent(String(machine.id))}`}
            className="btn btn-outline-secondary btn-sm"
          >
            View cycles
          </Link>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate("/washers")}>
            Back to Washers
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="card border-secondary">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Machine details</span>
              <span className="text-secondary small">ID: {machine.id}</span>
            </div>
            <div className="card-body">
              <InfoRow label="Type" value={toTitle(machine.machine_type)} />
              <InfoRow label="Manufacturer" value={machine.manufacturer ?? ""} />
              <InfoRow label="Model" value={machine.model ?? ""} />
              <InfoRow label="Serial number" value={machine.serial_number ?? ""} />
              <InfoRow label="Integration profile" value={machine.integration_key ?? ""} />
              <InfoRow label="Location" value={machine.location ?? ""} />
              <InfoRow label="Timezone" value={machine.timezone ?? ""} />
              <InfoRow label="Notes" value={machine.notes ?? ""} />
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card border-secondary">
            <div className="card-header fw-semibold">Connectivity (file-based)</div>
            <div className="card-body">
              <div className="text-secondary small mb-2">
                These devices are <strong>file-driven</strong> (cycle files received at end of cycle), not continuously online.
              </div>

              <InfoRow label="Host" value={host} />
              <InfoRow label="Protocol" value={machine.protocol ?? ""} />
              <InfoRow label="Base path" value={machine.base_path ?? ""} />

              <div className="mt-3 text-secondary small">
                <div className="fw-semibold text-body">Next milestone</div>
                <div>
                  We’ll add: <span className="text-body">Last cycle file received</span>, cycle history, and upload/parse tools.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Future: uploads & cycle summary cards can go here */}
      </div>
    </div>
  );
}