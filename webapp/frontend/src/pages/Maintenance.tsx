// src/pages/Maintenance.tsx
import { useEffect, useMemo, useState } from "react";
import {
  createMaintenanceLog,
  deleteMaintenanceLog,
  getApiErrorMessage,
  listMachines,
  listMaintenanceLogs,
  updateMaintenanceLog,
  type Machine,
  type MaintenanceLog,
} from "../lib/api";

/**
 * Maintenance
 * - Audit log table always visible
 * - "Raise maintenance issue" opens modal
 * - "Edit" opens modal with populated details
 */

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

export default function Maintenance() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(true);

  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [status, setStatus] = useState<string>("");

  // Filters
  const [filterMachineId, setFilterMachineId] = useState<number | "ALL">("ALL");
  const [query, setQuery] = useState<string>("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state (lives in parent for simplicity)
  const [machineId, setMachineId] = useState<number | "">("");
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

  // Load machines once
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingMachines(true);
      try {
        const m = await listMachines({ is_active: true });
        if (!alive) return;
        setMachines(m);
      } catch (err) {
        if (!alive) return;
        setStatus(getApiErrorMessage(err) || "Failed to load machines.");
      } finally {
        if (alive) setLoadingMachines(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Load logs whenever filters/search change (debounced)
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      (async () => {
        setLoadingLogs(true);
        setStatus("");

        try {
          const machine_id =
            filterMachineId === "ALL" ? undefined : Number(filterMachineId);
          const q = query.trim() ? query.trim() : undefined;

          const data = await listMaintenanceLogs({
            machine_id,
            q,
            limit: 200,
            offset: 0,
          });

          if (!alive) return;
          setLogs(data);
        } catch (err) {
          if (!alive) return;
          setStatus(getApiErrorMessage(err) || "Failed to load maintenance logs.");
        } finally {
          if (alive) setLoadingLogs(false);
        }
      })();
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [filterMachineId, query]);

  const filterMachine = useMemo(() => {
    if (filterMachineId === "ALL") return null;
    return machines.find((m) => m.id === filterMachineId) ?? null;
  }, [filterMachineId, machines]);

  const selectedMachine = useMemo(() => {
    if (machineId === "") return null;
    return machines.find((m) => m.id === machineId) ?? null;
  }, [machineId, machines]);

  const filteredLogs = useMemo(() => {
    return [...logs].sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
  }, [logs]);

  function resetForm(keepMachine = false) {
    if (!keepMachine) setMachineId("");
    setReason("");
    setStartedAtLocal("");
    setEndedAtLocal("");
    setNotes("");
    setEditingId(null);
    setModalMode("create");
  }

  function openCreateModal() {
    resetForm(false);
    setModalMode("create");
    setEditingId(null);
    setModalOpen(true);
    setStatus("");
  }

  function openEditModal(log: MaintenanceLog) {
    setModalMode("edit");
    setEditingId(log.id);

    // Prefer machine_id if present on your MaintenanceLog; fallback to matching name
    // @ts-ignore
    const mid: number | undefined = (log as any).machine_id;
    if (typeof mid === "number") {
      setMachineId(mid);
    } else {
      const m = machines.find((x) => x.machine_name === log.machine_name);
      setMachineId(m?.id ?? "");
    }

    setReason(log.reason ?? "");
    setStartedAtLocal(toDatetimeLocalFromIso(log.started_at));
    setEndedAtLocal(toDatetimeLocalFromIso(log.ended_at));
    setNotes(log.notes ?? "");

    setModalOpen(true);
    setStatus("");
  }

  function closeModal() {
    setModalOpen(false);
    // do not auto-reset here so user doesn't lose input if they accidentally click backdrop
    // but you can choose to reset on close if you prefer
  }

  function validate(): string | null {
    if (machineId === "") return "Please select a machine.";
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
    setStatus("");
    setLoadingLogs(true);
    try {
      const machine_id =
        filterMachineId === "ALL" ? undefined : Number(filterMachineId);
      const q = query.trim() ? query.trim() : undefined;

      const data = await listMaintenanceLogs({
        machine_id,
        q,
        limit: 200,
        offset: 0,
      });
      setLogs(data);

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

    const payload = {
      machine_id: Number(machineId),
      reason: reason.trim(),
      started_at: toIsoFromDatetimeLocal(startedAtLocal),
      ended_at: endedAtLocal ? toIsoFromDatetimeLocal(endedAtLocal) : null,
      notes: notes.trim() ? notes.trim() : null,
    };

    try {
      if (!isEditing) {
        const created = await createMaintenanceLog(payload);
        setLogs((prev) => [created, ...prev]);

        setStatus("Maintenance issue raised ✅");
        setModalOpen(false);
        resetForm(false);
        setTimeout(() => setStatus(""), 1200);
      } else {
        const updated = await updateMaintenanceLog(editingId!, payload);
        setLogs((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));

        setStatus("Maintenance entry updated ✅");
        setModalOpen(false);
        resetForm(false);
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

      // If it was open in the modal, close
      if (editingId === id) {
        setModalOpen(false);
        resetForm(false);
      }

      setStatus("Deleted ✅");
      setTimeout(() => setStatus(""), 1200);
    } catch (err) {
      setStatus(getApiErrorMessage(err) || "Failed to delete maintenance log.");
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maintenance_logs_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-1">Maintenance</h1>
          <div className="text-secondary small">
            Raise and track maintenance work performed on machines (audit trail).
          </div>
        </div>

        <div className="d-flex gap-2">
          <button
            className="btn btn-primary btn-sm"
            onClick={openCreateModal}
            disabled={loadingMachines}
          >
            <i className="bi bi-plus-circle" aria-hidden="true" /> Raise maintenance issue
          </button>

          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={exportJson}
            disabled={!filteredLogs.length}
          >
            <i className="bi bi-download" aria-hidden="true" /> Export JSON
          </button>

          <button
            className="btn btn-outline-primary btn-sm"
            onClick={refreshLogs}
            disabled={loadingLogs}
          >
            <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {status && (
        <div className="alert alert-info py-2" role="alert">
          {status}
        </div>
      )}

      {/* Audit log */}
      <div className="card border-secondary">
        <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-journal-text" aria-hidden="true" />
            <strong>Maintenance audit log</strong>
            <span className="text-secondary small">({filteredLogs.length})</span>
            {loadingLogs && <span className="text-secondary small ms-2">Loading…</span>}
          </div>

          <div className="d-flex gap-2 align-items-center">
            <select
              className="form-select form-select-sm"
              style={{ width: 220 }}
              value={filterMachineId === "ALL" ? "ALL" : String(filterMachineId)}
              onChange={(e) =>
                setFilterMachineId(e.target.value === "ALL" ? "ALL" : Number(e.target.value))
              }
              disabled={loadingMachines}
            >
              <option value="ALL">All machines</option>
              {machines.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.machine_name}
                </option>
              ))}
            </select>

            <input
              className="form-control form-control-sm"
              style={{ width: 240 }}
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="card-body p-0">
          {filterMachine && (
            <div className="px-3 py-2 border-bottom text-secondary small">
              Filtered to:{" "}
              <span className="fw-semibold text-body">{filterMachine.machine_name}</span>
            </div>
          )}

          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th style={{ width: "18%" }}>Machine</th>
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
                {filteredLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="fw-semibold">{l.machine_name}</td>
                    <td>{l.reason}</td>
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

                {!loadingLogs && filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-secondary py-4">
                      No maintenance entries yet. Click “Raise maintenance issue” to add one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-3 py-2 border-top text-secondary small">
            Tip: You can see the maintenance entried assigned to a machine from within the machines details.
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="modal-backdrop fade show"
            onClick={closeModal}
          />

          {/* Modal dialog */}
          <div
            className="modal fade show"
            style={{ display: "block" }}
            role="dialog"
            aria-modal="true"
          >
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

                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={closeModal}
                  />
                </div>

                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Machine *</label>
                      <select
                        className="form-select"
                        value={machineId}
                        disabled={loadingMachines}
                        onChange={(e) => setMachineId(e.target.value ? Number(e.target.value) : "")}
                      >
                        <option value="">
                          {loadingMachines ? "Loading machines…" : "Select a machine…"}
                        </option>
                        {machines.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.machine_name} ({m.machine_code})
                          </option>
                        ))}
                      </select>

                      {selectedMachine && (
                        <div className="text-secondary small mt-1">
                          {selectedMachine.manufacturer ?? "—"}
                          {selectedMachine.model ? ` • ${selectedMachine.model}` : ""}
                          {selectedMachine.location ? ` • ${selectedMachine.location}` : ""}
                        </div>
                      )}
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
                      <div className="text-secondary small mt-1">
                        Optional. Leave blank if the work is ongoing.
                      </div>
                    </div>

                    <div className="col-12">
                      <label className="form-label">Notes</label>
                      <textarea
                        className="form-control"
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any observations, parts used, test results, follow-ups…"
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      // On cancel, close and reset to avoid stale values next time
                      setModalOpen(false);
                      resetForm(false);
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    className={`btn ${isEditing ? "btn-warning" : "btn-primary"}`}
                    onClick={submitModal}
                  >
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
