// src/pages/WashCycles.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, listWasherCycles, type WasherCycle } from "../lib/api";

type WashCycleRow = {
  id: number;
  cycleNo: number | null;
  program: string;
  machine: string;
  start: string; // ISO
};

function toRow(c: WasherCycle): WashCycleRow {
  return {
    id: c.id,
    cycleNo: c.cycle_number,
    program: c.program_name ?? "—",
    machine: c.machine_name,
    start: c.started_at,
  };
}

export default function WashCycles() {
  const [params, setParams] = useSearchParams();
  const deviceParam = params.get("device");
  const initialDevice = deviceParam ?? "ALL";

  const [rows, setRows] = useState<WashCycleRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMsg, setStatusMsg] = useState<string>("");

  // Filters
  const [filterDevice, setFilterDevice] = useState<string>(initialDevice);
  const [filterProgram, setFilterProgram] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  useEffect(() => {
    setFilterDevice(deviceParam ?? "ALL");
  }, [deviceParam]);

  // Load parsed washer cycles
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const cycles = await listWasherCycles();
        if (!mounted) return;

        const mapped = cycles.map(toRow);
        setRows(mapped);
        setStatusMsg(
          mapped.length
            ? `Loaded ${mapped.length} cycle(s).`
            : "No cycles yet. Upload cycles to begin."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const machineOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.machine))).sort(),
    [rows]
  );

  const programOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.program).filter((p) => p && p !== "—"))
      ).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterDevice !== "ALL" && r.machine !== filterDevice) return false;
      if (filterProgram !== "ALL" && r.program !== filterProgram) return false;

      if (fromDate && new Date(r.start) < new Date(fromDate)) return false;

      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        if (new Date(r.start) > to) return false;
      }

      return true;
    });
  }, [rows, filterDevice, filterProgram, fromDate, toDate]);

  function setDeviceFilter(next: string) {
    setFilterDevice(next);

    const newParams = new URLSearchParams(params);
    if (next === "ALL") newParams.delete("device");
    else newParams.set("device", next);
    setParams(newParams, { replace: true });
  }

  // ✅ AUTHENTICATED XML DOWNLOAD
  async function downloadXml(cycleId: number) {
    try {
      const response = await api.get(
        `/v1/washer-cycles/${cycleId}/download`,
        { responseType: "blob" }
      );

      const blob = new Blob([response.data], {
        type: "application/xml",
      });

      const url = window.URL.createObjectURL(blob);

      let filename = "cycle.xml";
      const disposition = response.headers["content-disposition"];
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) {
          filename = match[1];
        }
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

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-0">Cycles</h1>
          <div className="text-secondary small">
            Parsed cycles appear immediately (telemetry pending).
          </div>
          {statusMsg && (
            <div className="text-secondary small mt-1">{statusMsg}</div>
          )}
        </div>

        <Link
          to="/wash-cycles/upload"
          className="btn btn-primary btn-sm d-flex align-items-center gap-1"
        >
          <i className="bi bi-upload" />
          Upload cycles
        </Link>
      </div>

      {/* Filters */}
      <div className="d-flex flex-wrap gap-3 mb-3 align-items-end">
        <div>
          <label className="form-label small">Machine</label>
          <select
            value={filterDevice}
            onChange={(e) => setDeviceFilter(e.target.value)}
            className="form-select form-select-sm"
            style={{ minWidth: 200 }}
          >
            <option value="ALL">All machines</option>
            {machineOptions.map((m) => (
              <option key={m} value={m}>
                {m}
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
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{r.cycleNo ? `#${r.cycleNo}` : "—"}</td>
                  <td>{r.machine}</td>
                  <td>{r.program}</td>
                  <td>{new Date(r.start).toLocaleString()}</td>
                  <td className="text-end">
                    <div className="d-inline-flex gap-2">
                      <Link
                        to={`/wash-cycles/${r.id}`}
                        className="btn btn-primary btn-sm"
                      >
                        View details
                      </Link>
                      <button
                        className="btn btn-primary btn-sm"
                        title="Download XML"
                        onClick={() => downloadXml(r.id)}
                      >
                        <i className="bi bi-download" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-secondary py-4">
                    No cycles match the selected filters.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={5} className="text-center text-secondary py-4">
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