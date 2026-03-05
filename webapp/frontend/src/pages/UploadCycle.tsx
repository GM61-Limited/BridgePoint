// src/pages/UploadCycle.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getApiErrorMessage,
  listMachines,
  uploadWasherXml,
  type Machine,
} from "../lib/api";

export default function UploadCycle() {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineId, setMachineId] = useState<number | "">("");

  // Environment code is an internal concern – fixed value
  const environmentCode = "GM61";

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ------------------------------------
  // Load machines
  // ------------------------------------
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const items = await listMachines({ is_active: true });
        if (!mounted) return;

        setMachines(items);
        setStatus(
          items.length
            ? `Loaded ${items.length} machine(s).`
            : "No machines found."
        );
      } catch (err) {
        if (!mounted) return;
        setStatus(`Failed to load machines: ${getApiErrorMessage(err)}`);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedMachine = useMemo(() => {
    if (machineId === "") return null;
    return machines.find((m) => m.id === machineId) ?? null;
  }, [machineId, machines]);

  const canUpload =
    Boolean(file) &&
    machineId !== "" &&
    !busy;

  // ------------------------------------
  // Upload handler
  // ------------------------------------
  async function handleUpload() {
    if (!file) {
      setStatus("Please select or drop an XML file.");
      return;
    }
    if (machineId === "") {
      setStatus("Please select a machine.");
      return;
    }

    setBusy(true);
    setStatus("Uploading and parsing XML…");

    try {
      const uploadRes = await uploadWasherXml({
        environmentCode,
        machineId: Number(machineId),
        file,
      });

      setStatus(
        `Uploaded & parsed ✅ ${uploadRes.original_filename} (${Math.round(
          uploadRes.bytes / 1024
        )} KB)`
      );

      setFile(null);
    } catch (err) {
      setStatus(`Upload failed ❌ ${getApiErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------
  // Drag & drop handlers
  // ------------------------------------
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);

    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
    }
  }

  // ------------------------------------
  // Render
  // ------------------------------------
  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-0">Upload cycles</h1>
          <div className="text-secondary small">
            Upload machine cycle XML files. Files are parsed automatically.
          </div>
        </div>

        <div className="d-flex gap-2">
          <Link to="/wash-cycles" className="btn btn-outline-secondary btn-sm">
            Go to Cycles
          </Link>
          <Link to="/machines" className="btn btn-outline-secondary btn-sm">
            Go to Machines
          </Link>
        </div>
      </div>

      {/* Form */}
      <div className="card border-secondary">
        <div className="card-body">
          <div className="row g-3">
            {/* Machine select */}
            <div className="col-md-6">
              <label className="form-label">Machine</label>
              <select
                className="form-select"
                value={machineId}
                onChange={(e) =>
                  setMachineId(e.target.value ? Number(e.target.value) : "")
                }
              >
                <option value="">Select a machine…</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.machine_name} ({m.machine_code})
                  </option>
                ))}
              </select>

              {selectedMachine && (
                <div className="text-secondary small mt-1">
                  Manufacturer: {selectedMachine.manufacturer ?? "—"} | Model:{" "}
                  {selectedMachine.model ?? "—"}
                </div>
              )}
            </div>

            {/* Drag & drop upload */}
            <div className="col-md-6">
              <label className="form-label">Cycle XML file</label>

              <div
                className={`border rounded p-3 text-center ${
                  dragOver ? "border-primary bg-primary bg-opacity-10" : "border-secondary"
                }`}
                style={{ cursor: "pointer" }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() =>
                  document.getElementById("cycle-upload-input")?.click()
                }
              >
                <i className="bi bi-upload fs-4 mb-2 d-block" />
                <div className="fw-medium">
                  {file ? file.name : "Drag & drop XML file here"}
                </div>
                <div className="text-secondary small">
                  or click to browse
                </div>
              </div>

              <input
                id="cycle-upload-input"
                type="file"
                accept=".xml,application/xml,text/xml"
                className="d-none"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="d-flex justify-content-between align-items-center mt-3">
            <div className="text-secondary small">{status}</div>
            <div className="d-flex gap-2">
              <button
                className="btn btn-primary btn-sm"
                disabled={!canUpload}
                onClick={handleUpload}
              >
                {busy ? "Uploading…" : "Upload cycles"}
              </button>
              <button
                className="btn btn-outline-secondary btn-sm"
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  setMachineId("");
                  setStatus("");
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}