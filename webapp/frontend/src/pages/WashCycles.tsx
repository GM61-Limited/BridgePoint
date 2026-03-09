// src/pages/WashCycles.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, listWasherCycles, type WasherCycle } from "../lib/api";

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

type ResultBadge = "PASS" | "FAIL" | "UNKNOWN";

/* --------------------------------------------------
   Table row model (UI-safe)
-------------------------------------------------- */

type WashCycleRow = {
  id: number;
  cycleNo: number | null;
  program: string;

  machineId: number;
  machineName: string;

  start?: string | null;
  end?: string | null;
  result: ResultBadge;
};

function toRow(c: WasherCycle): WashCycleRow {
  let result: ResultBadge = "UNKNOWN";
  if (c.result === true) result = "PASS";
  else if (c.result === false) result = "FAIL";

  return {
    id: c.id,
    cycleNo: c.cycle_number,
    program: c.program_name ?? "—",
    machineId: c.machine_id,
    machineName: c.machine_name,
    start: c.started_at ?? null,
    end: c.ended_at ?? null,
    result,
  };
}

export default function WashCycles() {
  const [params, setParams] = useSearchParams();

  // Preferred param + legacy compatibility
  const machineIdParam = params.get("machineId") || params.get("device");
  const machineNameParam = params.get("machine"); // legacy/friendly-only

  const [rows, setRows] = useState<WashCycleRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMsg, setStatusMsg] = useState<string>("");

  // Filters
  const [filterMachineId, setFilterMachineId] = useState<number | "ALL">("ALL");
  const [filterProgram, setFilterProgram] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // ✅ New: cycle number search (string so we can allow partial)
  const [cycleSearch, setCycleSearch] = useState<string>("");

  // ✅ New: pagination state
  const [pageSize, setPageSize] = useState<number>(50); // default
  const [pageIndex, setPageIndex] = useState<number>(0); // 0-based

  const [machineLocked, setMachineLocked] = useState(false);
  const [lockedMachineLabel, setLockedMachineLabel] = useState<string>("");

  // Load parsed washer cycles
  async function loadCycles() {
    setLoading(true);
    try {
      const cycles = await listWasherCycles();
      const mapped = cycles.map(toRow);
      setRows(mapped);
      setStatusMsg(
        mapped.length ? `Loaded ${mapped.length} cycle(s).` : "No cycles yet. Upload cycles to begin."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCycles();
  }, []);

  // Build machine options from the loaded rows (id->name)
  const machineOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) {
      if (!map.has(r.machineId)) map.set(r.machineId, r.machineName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const programOptions = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.program).filter((p) => p && p !== "—"))).sort();
  }, [rows]);

  // ✅ Resolve machine scope from query params
  useEffect(() => {
    // If machineId is provided and valid -> lock to it
    if (machineIdParam) {
      const idNum = Number(machineIdParam);
      if (Number.isFinite(idNum)) {
        setMachineLocked(true);
        setFilterMachineId(idNum);

        // Try to set label from existing machine options (if cycles already loaded)
        const label = machineOptions.find((m) => m.id === idNum)?.name;
        if (label) setLockedMachineLabel(label);
      } else {
        setMachineLocked(false);
        setLockedMachineLabel("");
        setFilterMachineId("ALL");
      }
      return;
    }

    // Legacy: if machine name is provided, map it to an id using loaded cycles
    if (machineNameParam) {
      const match = machineOptions.find((m) => m.name === machineNameParam);
      if (match) {
        setMachineLocked(true);
        setFilterMachineId(match.id);
        setLockedMachineLabel(match.name);

        // Normalize URL to machineId form
        const newParams = new URLSearchParams(params);
        newParams.set("machineId", String(match.id));
        newParams.delete("device");
        // keep "machine" for readability if you want:
        newParams.set("machine", match.name);
        setParams(newParams, { replace: true });
      } else {
        // name didn't match any loaded cycles; leave unlocked
        setMachineLocked(false);
        setLockedMachineLabel("");
        setFilterMachineId("ALL");
      }
      return;
    }

    // No scope parameters => normal view
    setMachineLocked(false);
    setLockedMachineLabel("");
    setFilterMachineId("ALL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineIdParam, machineNameParam, machineOptions.length]);

  const filtered = useMemo(() => {
    const q = cycleSearch.trim();

    return rows.filter((r) => {
      if (filterMachineId !== "ALL" && r.machineId !== filterMachineId) return false;
      if (filterProgram !== "ALL" && r.program !== filterProgram) return false;

      if (fromDate && r.start) {
        if (new Date(r.start) < new Date(fromDate)) return false;
      }

      if (toDate && r.start) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        if (new Date(r.start) > to) return false;
      }

      // ✅ Cycle number search (partial match)
      if (q) {
        const cycleNoStr = r.cycleNo === null || r.cycleNo === undefined ? "" : String(r.cycleNo);
        if (!cycleNoStr.includes(q)) return false;
      }

      return true;
    });
  }, [rows, filterMachineId, filterProgram, fromDate, toDate, cycleSearch]);

  // ✅ Reset to page 1 when filters/search/page size change (avoids empty pages)
  useEffect(() => {
    setPageIndex(0);
  }, [filterMachineId, filterProgram, fromDate, toDate, cycleSearch, pageSize]);

  // ✅ Pagination derived values
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);

  const paged = useMemo(() => {
    const start = safePageIndex * pageSize;
    const end = start + pageSize;
    return filtered.slice(start, end);
  }, [filtered, safePageIndex, pageSize]);

  function setMachineFilter(next: number | "ALL") {
    // If locked, don't allow changing via UI
    if (machineLocked) return;

    setFilterMachineId(next);

    const newParams = new URLSearchParams(params);

    if (next === "ALL") {
      newParams.delete("machineId");
      newParams.delete("device");
      newParams.delete("machine");
    } else {
      const label = machineOptions.find((m) => m.id === next)?.name;
      newParams.set("machineId", String(next));
      newParams.delete("device");
      if (label) newParams.set("machine", label);
      else newParams.delete("machine");
    }

    setParams(newParams, { replace: true });
  }

  // ✅ AUTHENTICATED XML DOWNLOAD
  async function downloadXml(cycleId: number) {
    try {
      const response = await api.get(`/v1/washer-cycles/${cycleId}/download`, {
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "application/xml" });
      const url = window.URL.createObjectURL(blob);

      let filename = "cycle.xml";
      const disposition = (response.headers as any)["content-disposition"];
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = match[1];
      }

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed", err);
      alert("Failed to download XML file.");
    }
  }

  // ✅ DELETE CYCLE
  async function deleteCycle(cycleId: number) {
    if (!confirm("Delete this cycle? This cannot be undone.")) return;

    try {
      await api.delete(`/v1/washer-cycles/${cycleId}`);
      await loadCycles();
    } catch (err) {
      console.error("Delete failed", err);
      alert("Failed to delete cycle.");
    }
  }

  const displayMachineLabel =
    lockedMachineLabel ||
    (filterMachineId !== "ALL"
      ? machineOptions.find((m) => m.id === filterMachineId)?.name ?? ""
      : "");

  const titleSuffix =
    machineLocked && displayMachineLabel ? ` – ${displayMachineLabel.trim()}` : "";

  const canPrev = safePageIndex > 0;
  const canNext = safePageIndex < totalPages - 1;

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-0">Cycles{titleSuffix}</h1>
          <div className="text-secondary small">
            {statusMsg || " "}
          </div>
        </div>

        <Link
          to={
            filterMachineId !== "ALL"
              ? `/wash-cycles/upload?machineId=${encodeURIComponent(String(filterMachineId))}`
              : "/wash-cycles/upload"
          }
          className="btn btn-primary btn-sm d-flex align-items-center gap-1"
        >
          <i className="bi bi-upload" />
          Upload cycles
        </Link>
      </div>

      {/* Filters */}
      <div className="d-flex flex-wrap gap-3 mb-3 align-items-end">
        <div>
          <label className="form-label small">
            Machine{" "}
            {machineLocked ? <span className="text-secondary">(locked)</span> : null}
          </label>
          <select
            value={filterMachineId === "ALL" ? "ALL" : String(filterMachineId)}
            onChange={(e) => {
              const v = e.target.value;
              setMachineFilter(v === "ALL" ? "ALL" : Number(v));
            }}
            className="form-select form-select-sm"
            style={{ minWidth: 240 }}
            disabled={machineLocked}
          >
            <option value="ALL">All machines</option>
            {machineOptions.map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label small">Program</label>
          <select
            value={filterProgram}
            onChange={(e) => setFilterProgram(e.target.value)}
            className="form-select form-select-sm"
            style={{ minWidth: 200 }}
          >
            <option value="ALL">All programs</option>
            {programOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label small">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="form-control form-control-sm"
          />
        </div>

        <div>
          <label className="form-label small">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="form-control form-control-sm"
          />
        </div>

        {/* ✅ New: cycle number search */}
        <div>
          <label className="form-label small">Cycle #</label>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            className="form-control form-control-sm"
            style={{ width: 140 }}
            placeholder="e.g. 123"
            value={cycleSearch}
            onChange={(e) => setCycleSearch(e.target.value)}
            aria-label="Search by cycle number"
          />
        </div>

        {/* ✅ New: page size selector */}
        <div>
          <label className="form-label small">Rows</label>
          <select
            className="form-select form-select-sm"
            style={{ width: 120 }}
            value={String(pageSize)}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Rows per page"
          >
            <option value="10">10</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>

        {machineLocked && (
          <div className="ms-auto">
            <Link to="/wash-cycles" className="btn btn-outline-secondary btn-sm">
              Exit machine view
            </Link>
          </div>
        )}
      </div>

      {/* Pagination bar */}
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div className="text-secondary small">
          Showing{" "}
          {totalFiltered === 0
            ? "0"
            : `${safePageIndex * pageSize + 1}–${Math.min(
                (safePageIndex + 1) * pageSize,
                totalFiltered
              )}`}{" "}
          of {totalFiltered} filtered (total loaded: {rows.length})
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={!canPrev || loading}
            aria-label="Previous page"
          >
            Prev
          </button>

          <span className="text-secondary small">
            Page {safePageIndex + 1} / {totalPages}
          </span>

          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
            disabled={!canNext || loading}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card border-secondary">
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Cycle #</th>
                <th>Machine</th>
                <th>Program</th>
                <th>Start</th>
                <th>End</th>
                <th>Result</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>

            <tbody>
              {paged.map((r) => (
                <tr key={r.id}>
                  <td>{r.cycleNo ? `#${r.cycleNo}` : "—"}</td>
                  <td>{r.machineName}</td>
                  <td>{r.program}</td>
                  <td>{formatDateTime(r.start)}</td>
                  <td>{formatDateTime(r.end)}</td>
                  <td>
                    <span
                      className={
                        r.result === "PASS"
                          ? "badge bg-success"
                          : r.result === "FAIL"
                          ? "badge bg-danger"
                          : "badge bg-secondary"
                      }
                    >
                      {r.result}
                    </span>
                  </td>
                  <td className="text-end">
                    <div className="d-inline-flex gap-2">
                      <Link to={`/wash-cycles/${r.id}`} className="btn btn-primary btn-sm">
                        View details
                      </Link>
                      <button
                        className="btn btn-primary btn-sm"
                        title="Download XML"
                        onClick={() => downloadXml(r.id)}
                      >
                        <i className="bi bi-download" />
                      </button>
                      <button
                        className="btn btn-outline-danger btn-sm"
                        title="Delete cycle"
                        onClick={() => deleteCycle(r.id)}
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-secondary py-4">
                    No cycles match the selected filters.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={7} className="text-center text-secondary py-4">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}