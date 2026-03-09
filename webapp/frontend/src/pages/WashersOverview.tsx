// src/pages/WashersOverview.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  createMachine,
  getIntegrationProfiles,
  getMachineTypes,
  type IntegrationProfile,
  listMachines,
  listWasherCycles,
  type Machine,
  type MachineType,
  updateMachine,
  type WasherCycle,
} from "../lib/api";

/**
 * Connectivity badge
 * ------------------
 * Grey for file-based/non-live devices.
 */
function ConnectivityBadge(_machine: Machine) {
  return (
    <span
      className="badge text-bg-secondary"
      style={{ fontSize: "0.65rem", lineHeight: 1, padding: "0.25em 0.5em" }}
      title="This device is file-driven (not live). Cycle files are received at end of cycle."
    >
      Offline (file-based)
    </span>
  );
}

/** Separate indicator for config state (Enabled/Disabled), neutral styling */
function EnabledPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`badge ${enabled ? "bg-outline-success" : "bg-outline-secondary"}`}
      style={{
        fontSize: "0.6rem",
        lineHeight: 1,
        padding: "0.2em 0.45em",
        border: "1px solid",
        borderColor: enabled
          ? "rgba(var(--bs-success-rgb), .55)"
          : "rgba(var(--bs-secondary-rgb), .55)",
        color: enabled
          ? "rgba(var(--bs-success-rgb), 1)"
          : "rgba(var(--bs-secondary-rgb), 1)",
        background: "transparent",
      }}
      title={enabled ? "Machine is enabled (in service)" : "Machine is disabled (not in use)"}
    >
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

function safeStr(v: unknown) {
  return v === null || v === undefined ? "" : String(v);
}

/**
 * Cycle result helpers
 * --------------------
 * We don't know the exact field name in WasherCycle for "result".
 * This function tries common candidates safely.
 */
function extractCycleResult(c: WasherCycle): string {
  const anyC = c as any;

  // 1) Most likely in your API: result is boolean|null (from washer_cycles.result)
  if (typeof anyC.result === "boolean") return anyC.result ? "PASS" : "FAIL";
  if (anyC.result === null || anyC.result === undefined) return "UNKNOWN";

  // 2) Sometimes it may already be a string in other environments
  if (typeof anyC.result === "string" && anyC.result.trim()) return anyC.result.trim();

  // 3) Other candidate fields (future-proofing)
  const strCandidate =
    anyC.cycle_result ??
    anyC.cycleResult ??
    anyC.status ??
    anyC.outcome ??
    anyC.state ??
    null;

  if (typeof strCandidate === "string" && strCandidate.trim()) return strCandidate.trim();

  // 4) Alternate boolean field
  if (typeof anyC.passed === "boolean") return anyC.passed ? "PASS" : "FAIL";

  return "UNKNOWN";
}

function resultBadgeClass(resultRaw: string): string {
  const r = (resultRaw || "").toLowerCase();

  // Green-ish outcomes
  if (
    r === "pass" ||
    r === "passed" ||
    r === "ok" ||
    r === "success" ||
    r === "successful" ||
    r === "complete" ||
    r === "completed"
  ) {
    return "text-bg-success";
  }

  // Red-ish outcomes
  if (r === "fail" || r === "failed" || r === "error" || r === "aborted" || r === "rejected") {
    return "text-bg-danger";
  }

  // Unknown / not supplied
  if (r === "--" || r === "unknown" || r === "n/a") return "text-bg-secondary";

  // Neutral default
  return "text-bg-primary";
}

/**
 * Build a map: machine_id -> latest cycle summary
 * We treat "latest" as the first occurrence per machine in the
 * already-sorted-by-started_at-desc washer-cycles response.
 */
function buildLastCycleMap(
  cycles: WasherCycle[]
): Map<number, { cycleNo: string; program: string; result: string }> {
  const m = new Map<number, { cycleNo: string; program: string; result: string }>();

  for (const c of cycles) {
    // only set once (first == newest)
    if (m.has(c.machine_id)) continue;

    const cycleNo =
      c.cycle_number === null || c.cycle_number === undefined ? "--" : String(c.cycle_number);

    const program =
      c.program_name === null || c.program_name === undefined || c.program_name === ""
        ? "--"
        : String(c.program_name);

    const result = extractCycleResult(c);

    m.set(c.machine_id, { cycleNo, program, result });
  }

  return m;
}

type MachineFormState = {
  machine_name: string;
  machine_code: string;
  machine_type: string;

  manufacturer: string;
  model: string;
  serial_number: string;

  ip_address: string;
  port: string;
  hostname: string;
  protocol: string;
  base_path: string;

  location: string;
  timezone: string;
  notes: string;

  integration_key: string;
  is_active: boolean;
};

const emptyForm: MachineFormState = {
  machine_name: "",
  machine_code: "",
  machine_type: "washer",

  manufacturer: "",
  model: "",
  serial_number: "",

  ip_address: "",
  port: "",
  hostname: "",
  protocol: "http",
  base_path: "",

  location: "",
  timezone: "Europe/London",
  notes: "",

  integration_key: "",
  is_active: true,
};

export default function WashersOverview() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineTypes, setMachineTypes] = useState<MachineType[]>([]);
  const [integrationProfiles, setIntegrationProfiles] = useState<IntegrationProfile[]>([]);

  // ✅ Last-cycle map from washer cycles
  const [lastByMachineId, setLastByMachineId] = useState<
    Map<number, { cycleNo: string; program: string; result: string }>
  >(() => new Map());

  // Filters (removed Enabled/Disabled chip filter)
  const [query, setQuery] = useState<string>("");
  const [typeKey, setTypeKey] = useState<string>(""); // all types
  const [manufacturer, setManufacturer] = useState<string>("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<MachineFormState>(emptyForm);

  // Initial load
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setErr("");

      try {
        const [types, profiles] = await Promise.all([getMachineTypes(), getIntegrationProfiles()]);
        if (!alive) return;

        setMachineTypes(types);
        setIntegrationProfiles(profiles);

        // Load machines + cycles in parallel (frontend-only enrichment)
        const [items, cycles] = await Promise.all([listMachines(), listWasherCycles()]);
        if (!alive) return;

        setMachines(items);
        setLastByMachineId(buildLastCycleMap(cycles));
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load machines");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  async function refreshMachinesAndLast() {
    setErr("");
    try {
      const [items, cycles] = await Promise.all([listMachines(), listWasherCycles()]);
      setMachines(items);
      setLastByMachineId(buildLastCycleMap(cycles));
    } catch (e: any) {
      setErr(e?.message || "Failed to refresh machines");
    }
  }

  const manufacturers = useMemo(() => {
    return Array.from(
      new Set((machines.map((m) => m.manufacturer).filter(Boolean) as string[]))
    ).sort();
  }, [machines]);

  const filtered = useMemo(() => {
    return machines.filter((m) => {
      const matchType = !typeKey || m.machine_type === typeKey;
      const matchMfr = !manufacturer || (m.manufacturer || "") === manufacturer;

      const hay = [
        m.machine_name,
        m.machine_code,
        m.machine_type,
        m.manufacturer,
        m.model,
        m.location,
        m.hostname,
        m.ip_address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchText = hay.includes(query.toLowerCase());

      return matchType && matchMfr && matchText;
    });
  }, [machines, typeKey, manufacturer, query]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, machine_type: typeKey || "washer" });
    setErr("");
    setShowModal(true);
  }

  function openEdit(m: Machine) {
    setEditingId(m.id);
    setForm({
      machine_name: safeStr(m.machine_name),
      machine_code: safeStr(m.machine_code),
      machine_type: safeStr(m.machine_type || "washer"),

      manufacturer: safeStr(m.manufacturer),
      model: safeStr(m.model),
      serial_number: safeStr(m.serial_number),

      ip_address: safeStr(m.ip_address),
      port: m.port === null || m.port === undefined ? "" : String(m.port),
      hostname: safeStr(m.hostname),
      protocol: safeStr(m.protocol || "http"),
      base_path: safeStr(m.base_path),

      location: safeStr(m.location),
      timezone: safeStr(m.timezone || "Europe/London"),
      notes: safeStr(m.notes),

      integration_key: safeStr(m.integration_key),
      is_active: !!m.is_active,
    });
    setErr("");
    setShowModal(true);
  }

  async function onSave() {
    setSaving(true);
    setErr("");

    if (!form.machine_name.trim() || !form.machine_code.trim() || !form.machine_type.trim()) {
      setErr("Please fill in Machine name, Machine code, and Machine type.");
      setSaving(false);
      return;
    }

    const payload: Partial<Machine> = {
      machine_name: form.machine_name.trim(),
      machine_code: form.machine_code.trim(),
      machine_type: form.machine_type,

      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,

      ip_address: form.ip_address.trim() || null,
      port: form.port.trim() ? Number(form.port.trim()) : null,
      hostname: form.hostname.trim() || null,
      protocol: form.protocol.trim() || null,
      base_path: form.base_path.trim() || null,

      location: form.location.trim() || null,
      timezone: form.timezone.trim() || null,
      notes: form.notes.trim() || null,

      integration_key: form.integration_key.trim() || null,
      is_active: form.is_active,
    };

    try {
      if (editingId === null) await createMachine(payload);
      else await updateMachine(editingId, payload);

      setShowModal(false);
      await refreshMachinesAndLast();
    } catch (e: any) {
      setErr(e?.message || "Failed to save machine");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-0">Machines Overview</h1>
          {/* ✅ Removed subtext under title for production */}
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            + Add machine
          </button>
        </div>
      </div>

      {err && (
        <div className="alert alert-danger py-2" role="alert">
          {err}
        </div>
      )}

      {/* ✅ Removed KPI cards */}

      {/* Filters */}
      <div className="row g-2 align-items-center mb-3">
        <div className="col-12 col-sm-6 col-md-4 col-lg-3">
          <select
            className="form-select form-select-sm"
            value={typeKey}
            onChange={(e) => setTypeKey(e.target.value)}
            aria-label="Filter by machine type"
          >
            <option value="">All types</option>
            {machineTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="col-12 col-sm-6 col-md-4 col-lg-3">
          <select
            className="form-select form-select-sm"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            aria-label="Filter by manufacturer"
          >
            <option value="">All manufacturers</option>
            {manufacturers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="col-12 col-md-4 col-lg-3">
          <input
            className="form-control form-control-sm"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
          />
        </div>

        {/* ✅ Removed Enabled/Disabled chip filter */}
      </div>

      {/* Grid */}
      <div className="row g-3">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="col-12 col-sm-6 col-xl-4 d-flex">
              <div className="card border-secondary flex-fill h-100">
                <div className="card-body placeholder-glow">
                  <span className="placeholder col-6" />
                </div>
              </div>
            </div>
          ))}

        {!loading &&
          filtered.map((m) => {
            const host =
              m.hostname || (m.ip_address ? `${m.ip_address}${m.port ? `:${m.port}` : ""}` : "—");

            const sub = `${m.manufacturer ? m.manufacturer : "Unknown manufacturer"}${
              m.model ? ` • ${m.model}` : ""
            }`;

            const last = lastByMachineId.get(m.id) ?? { cycleNo: "--", program: "--", result: "--" };

            return (
              <div key={m.id} className="col-12 col-sm-6 col-xl-4 d-flex">
                <div className="card border-secondary flex-fill h-100">
                  <div className="card-body d-flex flex-column">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <div className="fw-semibold">{m.machine_name}</div>
                        <div className="text-secondary small">{sub}</div>
                        <div className="text-secondary small">
                          Code: <span className="font-monospace">{m.machine_code}</span>
                        </div>
                      </div>

                      <div className="d-flex flex-column align-items-end gap-1">
                        <ConnectivityBadge {...m} />
                        <EnabledPill enabled={m.is_active} />
                      </div>
                    </div>

                    {/* ✅ Last cycle / program / result */}
                    <div className="mt-3 small">
                      <div className="d-flex justify-content-between">
                        <span className="text-secondary">Last cycle</span>
                        <span className="text-body fw-semibold">{last.cycleNo}</span>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span className="text-secondary">Last program</span>
                        <span className="text-body">{last.program}</span>
                      </div>
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-secondary">Last result</span>
                        <span className={`badge ${resultBadgeClass(last.result)}`}>
                          {last.result || "--"}
                        </span>
                      </div>
                    </div>

                    {/* --- Machine info --- */}
                    <div className="mt-3 text-secondary small">
                      <div>
                        Type: <span className="text-body">{m.machine_type}</span>
                      </div>
                      <div>
                        Host: <span className="text-body">{host}</span>
                      </div>
                      <div>
                        Location: <span className="text-body">{m.location || "—"}</span>
                      </div>
                    </div>

                    <div className="mt-auto d-flex justify-content-between align-items-center pt-3">
                      <div className="btn-group btn-group-sm">
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => navigate(`/devices/${encodeURIComponent(String(m.id))}`)}
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => openEdit(m)}
                        >
                          Edit
                        </button>

                        {/* ✅ Removed Disable button */}
                      </div>

                      <div className="d-flex gap-2">
                        <Link
                          to={`/wash-cycles/upload?machineId=${encodeURIComponent(String(m.id))}`}
                          className="btn btn-outline-primary btn-sm"
                          title="Upload cycles for this machine"
                        >
                          Upload
                        </Link>

                        <Link
                          to={`/wash-cycles?machineId=${encodeURIComponent(String(m.id))}`}
                          className="btn btn-outline-secondary btn-sm"
                          title="View cycles for this machine"
                        >
                          Cycles
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Modal (unchanged) */}
      {showModal && (
        <>
          <div className="modal show" style={{ display: "block" }} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-lg">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{editingId === null ? "Add machine" : "Edit machine"}</h5>
                  <button type="button" className="btn-close" onClick={() => setShowModal(false)} />
                </div>

                <div className="modal-body">
                  {err && (
                    <div className="alert alert-danger py-2" role="alert">
                      {err}
                    </div>
                  )}

                  <div className="row g-2">
                    <div className="col-md-6">
                      <label className="form-label small">Machine name *</label>
                      <input
                        className="form-control form-control-sm"
                        value={form.machine_name}
                        onChange={(e) => setForm({ ...form, machine_name: e.target.value })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small">Machine code *</label>
                      <input
                        className="form-control form-control-sm"
                        value={form.machine_code}
                        onChange={(e) => setForm({ ...form, machine_code: e.target.value })}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label small">Machine type *</label>
                      <select
                        className="form-select form-select-sm"
                        value={form.machine_type}
                        onChange={(e) => setForm({ ...form, machine_type: e.target.value })}
                      >
                        {machineTypes.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.display_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-md-4">
                      <label className="form-label small">Manufacturer</label>
                      <input
                        className="form-control form-control-sm"
                        value={form.manufacturer}
                        onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label small">Model</label>
                      <input
                        className="form-control form-control-sm"
                        value={form.model}
                        onChange={(e) => setForm({ ...form, model: e.target.value })}
                      />
                    </div>

                    <div className="col-md-4">
                      <label className="form-label small">IP address</label>
                      <input
                        className="form-control form-control-sm"
                        placeholder="e.g. 192.168.20.10"
                        value={form.ip_address}
                        onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
                      />
                    </div>

                    <div className="col-md-2">
                      <label className="form-label small">Port</label>
                      <input
                        className="form-control form-control-sm"
                        placeholder="80"
                        value={form.port}
                        onChange={(e) => setForm({ ...form, port: e.target.value })}
                      />
                    </div>

                    <div className="col-md-3">
                      <label className="form-label small">Protocol</label>
                      <input
                        className="form-control form-control-sm"
                        placeholder="http"
                        value={form.protocol}
                        onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                      />
                    </div>

                    <div className="col-md-3">
                      <label className="form-label small">Hostname</label>
                      <input
                        className="form-control form-control-sm"
                        value={form.hostname}
                        onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small">Location</label>
                      <input
                        className="form-control form-control-sm"
                        value={form.location}
                        onChange={(e) => setForm({ ...form, location: e.target.value })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small">Timezone</label>
                      <input
                        className="form-control form-control-sm"
                        value={form.timezone}
                        onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small">Integration profile</label>
                      <select
                        className="form-select form-select-sm"
                        value={form.integration_key}
                        onChange={(e) => setForm({ ...form, integration_key: e.target.value })}
                      >
                        <option value="">(none)</option>
                        {integrationProfiles.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.display_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-md-6 d-flex align-items-end">
                      <div className="form-check">
                        <input
                          id="enabledCheck"
                          className="form-check-input"
                          type="checkbox"
                          checked={form.is_active}
                          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                        />
                        <label className="form-check-label small" htmlFor="enabledCheck">
                          Enabled
                        </label>
                      </div>
                    </div>

                    <div className="col-12">
                      <label className="form-label small">Notes</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={3}
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setShowModal(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-backdrop show" />
        </>
      )}
    </div>
  );
}