// src/pages/DeviceDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createMaintenanceLog,
  deleteMaintenanceLog,
  getApiErrorMessage,
  getMachine,
  listMaintenanceLogs,
  updateMaintenanceLog,
  type Machine,
  type MaintenanceLog,
} from "../lib/api";

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

/* ---------------- Maintenance helpers ---------------- */

function toIsoFromDatetimeLocal(value: string): string {
  const d = new Date(value);
  return d.toISOString();
}

function toDatetimeLocalFromIso(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

type ModalMode = "create" | "edit";

export default function DeviceDetail() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  const parsedId = useMemo(() => {
    const n = Number(deviceId);
    return Number.isFinite(n) ? n : null;
  }, [deviceId]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [machine, setMachine] = useState<Machine | null>(null);

  // --- Maintenance state (scoped to this machine) ---
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [reason, setReason] = useState<string>("");
  const [startedAtLocal, setStartedAtLocal] = useState<string>("");
  const [endedAtLocal, setEndedAtLocal] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const isEditing = modalMode === "edit" && editingId !== null;

  // Disable body scroll while modal is open
  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  // Load machine
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

  // Load maintenance logs for this machine
  useEffect(() => {
    if (!machine) return;
    let alive = true;

    (async () => {
      setLoadingLogs(true);
      setStatus("");
      try {
        const data = await listMaintenanceLogs({
          machine_id: machine.id,
          limit: 200,
          offset: 0,
        });
        if (!alive) return;
        // sort newest first by started_at
        const sorted = [...data].sort(
          (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        );
        setLogs(sorted);
      } catch (err) {
        if (!alive) return;
        setStatus(getApiErrorMessage(err) || "Failed to load maintenance logs.");
      } finally {
        if (alive) setLoadingLogs(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [machine]);

  function resetForm() {
    setReason("");
    setStartedAtLocal("");
    setEndedAtLocal("");
    setNotes("");
    setEditingId(null);
    setModalMode("create");
  }

  function openCreateModal() {
    resetForm();
    setModalMode("create");
    setEditingId(null);
    setModalOpen(true);
    setStatus("");
  }

  function openEditModal(log: MaintenanceLog) {
    setModalMode("edit");
    setEditingId(log.id);
    setReason(log.reason ?? "");
    setStartedAtLocal(toDatetimeLocalFromIso(log.started_at));
    setEndedAtLocal(toDatetimeLocalFromIso(log.ended_at));
    setNotes(log.notes ?? "");
    setModalOpen(true);
    setStatus("");
  }

  function closeModal() {
    setModalOpen(false);
  }

  function validate(): string | null {
    if (!machine) return "Machine not loaded.";
    if (!reason.trim()) return "Please enter a reason.";
    if (!startedAtLocal) return "Please enter a start date/time.";
    if (endedAtLocal) {
      const start = new Date(startedAtLocal).getTime();
      const end = new Date(endedAtLocal).getTime();
      if (end < start) return "End time cannot be before start time.";
    }
    return null;
  }

  async function refreshLogs() {
    if (!machine) return;
    setStatus("");
    setLoadingLogs(true);
    try {
      const data = await listMaintenanceLogs({
        machine_id: machine.id,
        limit: 200,
        offset: 0,
      });
      const sorted = [...data].sort(
        (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      );
      setLogs(sorted);
      setStatus("Refreshed ✅");
      setTimeout(() => setStatus(""), 900);
    } catch (err) {
      setStatus(getApiErrorMessage(err) || "Failed to refresh maintenance logs.");
    } finally {
      setLoadingLogs(false);
    }
  }

  async function submitModal() {
    setStatus("");

    const err = validate();
    if (err) {
      setStatus(err);
      return;
    }
    if (!machine) return;

    const payload = {
      machine_id: machine.id,
      reason: reason.trim(),
      started_at: toIsoFromDatetimeLocal(startedAtLocal),
      ended_at: endedAtLocal ? toIsoFromDatetimeLocal(endedAtLocal) : null,
      notes: notes.trim() ? notes.trim() : null,
    };

    try {
      if (!isEditing) {
        const created = await createMaintenanceLog(payload);
        setLogs((prev) =>
          [created, ...prev].sort(
            (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
          )
        );

        setStatus("Maintenance issue raised ✅");
        setModalOpen(false);
        resetForm();
        setTimeout(() => setStatus(""), 1200);
      } else {
        const updated = await updateMaintenanceLog(editingId!, payload);
        setLogs((prev) =>
          prev
            .map((x) => (x.id === updated.id ? updated : x))
            .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
        );

        setStatus("Maintenance entry updated ✅");
        setModalOpen(false);
        resetForm();
        setTimeout(() => setStatus(""), 1200);
      }
    } catch (err2) {
      setStatus(
        getApiErrorMessage(err2) ||
          (isEditing ? "Failed to update maintenance log." : "Failed to create maintenance log.")
      );
    }
  }

  async function deleteLog(id: string) {
    if (!confirm("Delete this maintenance entry? This cannot be undone.")) return;

    setStatus("");
    try {
      await deleteMaintenanceLog(id);
      setLogs((prev) => prev.filter((x) => x.id !== id));

      if (editingId === id) {
        setModalOpen(false);
        resetForm();
      }

      setStatus("Deleted ✅");
      setTimeout(() => setStatus(""), 1200);
    } catch (err) {
      setStatus(getApiErrorMessage(err) || "Failed to delete maintenance log.");
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maintenance_${machine?.machine_code ?? "machine"}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="container py-4">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h1 className="h5 mb-0">Device details</h1>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate("/machines")}>
            Back to Machines
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
        <div className="alert alert-warning d-flex justify-content-between align-items-center" role="alert">
          <span>{error || "Device not found."}</span>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate("/machines")}>
            Back to Machines
          </button>
        </div>
      </div>
    );
  }

  const host =
    machine.hostname ||
    (machine.ip_address ? `${machine.ip_address}${machine.port ? `:${machine.port}` : ""}` : "");

  const subtitle = `${machine.manufacturer ? machine.manufacturer : "Unknown manufacturer"}${
    machine.model ? ` • ${machine.model}` : ""
  }`;

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
          {/* ✅ Use machineId param (preferred) */}
          <Link
            to={`/wash-cycles?machineId=${encodeURIComponent(String(machine.id))}&machine=${encodeURIComponent(
              machine.machine_name
            )}`}
            className="btn btn-outline-secondary btn-sm"
          >
            View cycles
          </Link>

          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate("/machines")}>
            Back to Machines
          </button>
        </div>
      </div>

      {status && (
        <div className="alert alert-info py-2" role="alert">
          {status}
        </div>
      )}

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

        {/* ✅ NEW: Maintenance history for this machine */}
        <div className="col-12">
          <div className="card border-secondary">
            <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-wrench-adjustable" aria-hidden="true" />
                <span className="fw-semibold">Maintenance history</span>
                <span className="text-secondary small">({logs.length})</span>
                {loadingLogs && <span className="text-secondary small ms-2">Loading…</span>}
              </div>

              <div className="d-flex gap-2">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={openCreateModal}
                  disabled={loadingLogs}
                  title="Raise maintenance issue"
                >
                  <i className="bi bi-plus-circle" aria-hidden="true" /> Raise issue
                </button>

                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={exportJson}
                  disabled={!logs.length}
                  title="Export maintenance logs for this machine"
                >
                  <i className="bi bi-download" aria-hidden="true" /> Export JSON
                </button>

                <button
                  className="btn btn-outline-primary btn-sm"
                  onClick={refreshLogs}
                  disabled={loadingLogs}
                  title="Refresh"
                >
                  <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Refresh
                </button>
              </div>
            </div>

            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th style={{ width: "22%" }}>Reason</th>
                      <th style={{ width: "18%" }}>Start</th>
                      <th style={{ width: "18%" }}>End</th>
                      <th>Notes</th>
                      <th className="text-end" style={{ width: "10%" }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id}>
                        <td className="fw-semibold">{l.reason}</td>
                        <td>{formatDateTime(l.started_at)}</td>
                        <td>
                          {l.ended_at ? (
                            formatDateTime(l.ended_at)
                          ) : (
                            <span className="badge bg-secondary">Ongoing</span>
                          )}
                        </td>
                        <td className="text-secondary">{l.notes ?? "—"}</td>
                        <td className="text-end">
                          <div className="btn-group" role="group">
                            <button
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => openEditModal(l)}
                              title="Edit"
                            >
                              <i className="bi bi-pencil" aria-hidden="true" />
                            </button>
                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => deleteLog(l.id)}
                              title="Delete"
                            >
                              <i className="bi bi-trash" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {!loadingLogs && logs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-secondary py-4">
                          No maintenance entries for this machine yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-3 py-2 border-top text-secondary small">
                Tip: Use “Raise issue” to add a maintenance record directly from this machine page.
              </div>
            </div>
          </div>
        </div>

        {/* Future: uploads & cycle summary cards can go here */}
      </div>

      {/* Modal */}
      {modalOpen && (
        <>
          {/* Backdrop */}
          <div className="modal-backdrop fade show" onClick={closeModal} />

          {/* Modal dialog */}
          <div className="modal fade show" style={{ display: "block" }} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-lg modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-wrench-adjustable" aria-hidden="true" />
                    <h5 className="modal-title mb-0">
                      {isEditing ? "Edit maintenance entry" : "Raise maintenance issue"}
                    </h5>
                    {isEditing && <span className="badge bg-warning text-dark">Editing</span>}
                  </div>

                  <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} />
                </div>

                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Machine</label>
                      <input className="form-control" value={`${machine.machine_name} (${machine.machine_code})`} disabled />
                      <div className="text-secondary small mt-1">
                        {machine.manufacturer ?? "—"}
                        {machine.model ? ` • ${machine.model}` : ""}
                        {machine.location ? ` • ${machine.location}` : ""}
                      </div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Reason *</label>
                      <input
                        className="form-control"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Preventative service, Pump replaced, Leak investigated"
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Start date/time *</label>
                      <input
                        type="datetime-local"
                        className="form-control"
                        value={startedAtLocal}
                        onChange={(e) => setStartedAtLocal(e.target.value)}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">End date/time</label>
                      <input
                        type="datetime-local"
                        className="form-control"
                        value={endedAtLocal}
                        onChange={(e) => setEndedAtLocal(e.target.value)}
                      />
                      <div className="text-secondary small mt-1">Optional. Leave blank if ongoing.</div>
                    </div>

                    <div className="col-12">
                      <label className="form-label">Notes</label>
                      <textarea
                        className="form-control"
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Observations, parts used, test results, follow-ups…"
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setModalOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </button>

                  <button className={`btn ${isEditing ? "btn-warning" : "btn-primary"}`} onClick={submitModal}>
                    <i className={`bi ${isEditing ? "bi-save" : "bi-plus-circle"}`} aria-hidden="true" />{" "}
                    {isEditing ? "Save changes" : "Raise issue"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}