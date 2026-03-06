// src/pages/Maintenance.tsx
import { useEffect, useMemo, useState } from "react";
import { listMachines, type Machine } from "../lib/api";

/**
 * Maintenance (MVP placeholder)
 * - Lets engineers log maintenance against a machine
 * - Stores logs in localStorage for now (no backend dependency)
 * - Designed so it can be swapped to API later
 */

type MaintenanceLog = {
  id: string;
  machine_id: number;
  machine_name: string;
  reason: string;
  started_at: string; // ISO
  ended_at?: string | null; // ISO
  notes?: string | null;
  created_at: string; // ISO
  created_by?: string | null; // future
};

const STORAGE_KEY = "bridgepoint:maintenance_logs:v1";

function uuidLike() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toIsoFromDatetimeLocal(value: string): string {
  // datetime-local -> local time; convert to ISO
  // new Date("YYYY-MM-DDTHH:mm") is treated as local time by browser
  const d = new Date(value);
  return d.toISOString();
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

function loadLogs(): MaintenanceLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MaintenanceLog[]) : [];
  } catch {
    return [];
  }
}

function saveLogs(logs: MaintenanceLog[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // ignore storage failures
  }
}

export default function Maintenance() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(true);

  const [logs, setLogs] = useState<MaintenanceLog[]>(() => loadLogs());
  const [status, setStatus] = useState<string>("");

  // Form state
  const [machineId, setMachineId] = useState<number | "">("");
  const [reason, setReason] = useState<string>("");
  const [startedAtLocal, setStartedAtLocal] = useState<string>("");
  const [endedAtLocal, setEndedAtLocal] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Filters
  const [filterMachineId, setFilterMachineId] = useState<number | "ALL">("ALL");
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingMachines(true);
      try {
        const m = await listMachines({ is_active: true });
        if (!alive) return;
        setMachines(m);
      } catch (e: any) {
        if (!alive) return;
        setStatus(e?.message || "Failed to load machines.");
      } finally {
        if (alive) setLoadingMachines(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Persist logs whenever they change
  useEffect(() => {
    saveLogs(logs);
  }, [logs]);

  const selectedMachine = useMemo(() => {
    if (machineId === "") return null;
    return machines.find((m) => m.id === machineId) ?? null;
  }, [machineId, machines]);

  const filterMachine = useMemo(() => {
    if (filterMachineId === "ALL") return null;
    return machines.find((m) => m.id === filterMachineId) ?? null;
  }, [filterMachineId, machines]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs
      .filter((l) => {
        if (filterMachineId !== "ALL" && l.machine_id !== filterMachineId) return false;
        if (!q) return true;

        const hay = [
          l.machine_name,
          l.reason,
          l.notes ?? "",
          l.started_at,
          l.ended_at ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return hay.includes(q);
      })
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  }, [logs, filterMachineId, query]);

  function resetForm(keepMachine = true) {
    if (!keepMachine) setMachineId("");
    setReason("");
    setStartedAtLocal("");
    setEndedAtLocal("");
    setNotes("");
  }

  function validate(): string | null {
    if (machineId === "") return "Please select a machine.";
    if (!reason.trim()) return "Please enter a reason.";
    if (!startedAtLocal) return "Please enter a start date/time.";
    // End is optional, but if supplied it must be after start
    if (endedAtLocal) {
      const start = new Date(startedAtLocal).getTime();
      const end = new Date(endedAtLocal).getTime();
      if (end < start) return "End time cannot be before start time.";
    }
    return null;
  }

  function addLog() {
    setStatus("");

    const err = validate();
    if (err) {
      setStatus(err);
      return;
    }

    const m = machines.find((x) => x.id === Number(machineId));
    if (!m) {
      setStatus("Selected machine not found.");
      return;
    }

    const log: MaintenanceLog = {
      id: uuidLike(),
      machine_id: m.id,
      machine_name: m.machine_name,
      reason: reason.trim(),
      started_at: toIsoFromDatetimeLocal(startedAtLocal),
      ended_at: endedAtLocal ? toIsoFromDatetimeLocal(endedAtLocal) : null,
      notes: notes.trim() ? notes.trim() : null,
      created_at: new Date().toISOString(),
      created_by: null, // future
    };

    setLogs((prev) => [log, ...prev]);
    setStatus("Maintenance log added ✅");
    resetForm(true);
    setTimeout(() => setStatus(""), 1200);
  }

  function deleteLog(id: string) {
    if (!confirm("Delete this maintenance entry? This cannot be undone.")) return;
    setLogs((prev) => prev.filter((x) => x.id !== id));
    setStatus("Deleted ✅");
    setTimeout(() => setStatus(""), 1200);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maintenance_logs_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function clearAll() {
    if (!confirm("Clear ALL maintenance logs stored locally? This cannot be undone.")) return;
    setLogs([]);
    setStatus("All logs cleared ✅");
    setTimeout(() => setStatus(""), 1200);
  }

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-1">Maintenance</h1>
          <div className="text-secondary small">
            Log maintenance work performed on machines. This creates an audit trail and can feed into Health later.
          </div>
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary btn-sm" onClick={exportJson} disabled={!logs.length}>
            <i className="bi bi-download" aria-hidden="true" /> Export JSON
          </button>
          <button className="btn btn-outline-danger btn-sm" onClick={clearAll} disabled={!logs.length}>
            <i className="bi bi-trash" aria-hidden="true" /> Clear all
          </button>
        </div>
      </div>

      {status && (
        <div className="alert alert-info py-2" role="alert">
          {status}
        </div>
      )}

      {/* Create log */}
      <div className="card border-secondary mb-3">
        <div className="card-header d-flex align-items-center gap-2">
          <i className="bi bi-wrench-adjustable" aria-hidden="true" />
          <strong>Log maintenance</strong>
        </div>

        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Machine *</label>
              <select
                className="form-select"
                value={machineId}
                disabled={loadingMachines}
                onChange={(e) => setMachineId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">{loadingMachines ? "Loading machines…" : "Select a machine…"}</option>
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

          <div className="d-flex justify-content-between align-items-center mt-3">
            <div className="text-secondary small">
              Stored locally for now (MVP). We can wire this to the backend later.
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={addLog}>
                <i className="bi bi-plus-circle" aria-hidden="true" /> Add entry
              </button>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => resetForm(false)}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Audit log */}
      <div className="card border-secondary">
        <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-journal-text" aria-hidden="true" />
            <strong>Maintenance audit log</strong>
            <span className="text-secondary small">({filteredLogs.length})</span>
          </div>

          <div className="d-flex gap-2 align-items-center">
            <select
              className="form-select form-select-sm"
              style={{ width: 220 }}
              value={filterMachineId === "ALL" ? "ALL" : String(filterMachineId)}
              onChange={(e) => setFilterMachineId(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
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
              Filtered to: <span className="fw-semibold text-body">{filterMachine.machine_name}</span>
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
                  <th className="text-end" style={{ width: "8%" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="fw-semibold">{l.machine_name}</td>
                    <td>{l.reason}</td>
                    <td>{formatDateTime(l.started_at)}</td>
                    <td>{l.ended_at ? formatDateTime(l.ended_at) : <span className="badge bg-secondary">Ongoing</span>}</td>
                    <td className="text-secondary">{l.notes ?? "—"}</td>
                    <td className="text-end">
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => deleteLog(l.id)}
                        title="Delete"
                      >
                        <i className="bi bi-trash" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-secondary py-4">
                      No maintenance entries yet. Add one above to start the audit log.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-3 py-2 border-top text-secondary small">
            Future: link entries directly from a machine’s Details page and include “parts used” and “engineer”.
          </div>
        </div>
      </div>
    </div>
  );
}