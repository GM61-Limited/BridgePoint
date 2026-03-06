// src/pages/UploadCycle.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getApiErrorMessage,
  listMachines,
  uploadWasherXml,
  type Machine,
} from "../lib/api";

type UploadItem = {
  file: File;
  status: "PENDING" | "UPLOADING" | "SUCCESS" | "FAILED";
  message?: string;
};

export default function UploadCycle() {
  const [params, setParams] = useSearchParams();
  const machineIdParam = params.get("machineId");

  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineId, setMachineId] = useState<number | "">("");

  // When true, the page is scoped via URL param and we hide the dropdown.
  const [scopedToMachine, setScopedToMachine] = useState(false);

  // Environment code is an internal concern – fixed value
  const environmentCode = "GM61";

  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // ------------------------------------
  // Load machines + apply scope
  // ------------------------------------
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const list = await listMachines({ is_active: true });
        if (!mounted) return;

        setMachines(list);

        // Apply query param selection (scope)
        if (machineIdParam) {
          const idNum = Number(machineIdParam);
          const exists = Number.isFinite(idNum) && list.some((m) => m.id === idNum);

          if (exists) {
            setMachineId(idNum);
            setScopedToMachine(true);
          } else {
            // invalid param -> treat as normal page
            setScopedToMachine(false);
          }
        } else {
          setScopedToMachine(false);
        }

        setStatus(list.length ? `Loaded ${list.length} machine(s).` : "No machines found.");
      } catch (err) {
        if (!mounted) return;
        setStatus(`Failed to load machines: ${getApiErrorMessage(err)}`);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [machineIdParam]);

  const selectedMachine = useMemo(() => {
    if (machineId === "") return null;
    return machines.find((m) => m.id === machineId) ?? null;
  }, [machineId, machines]);

  const canUpload = items.length > 0 && machineId !== "" && !busy;

  // ------------------------------------
  // File helpers
  // ------------------------------------
  function addFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);

    const xmls = arr.filter((f) => {
      const n = f.name.toLowerCase();
      return n.endsWith(".xml") || f.type.includes("xml") || f.type === "";
    });

    if (xmls.length === 0) {
      setStatus("No XML files detected. Please drop/select .xml files.");
      return;
    }

    setItems((prev) => {
      const next = [...prev];
      for (const f of xmls) {
        const key = `${f.name}:${f.size}:${f.lastModified}`;
        const already = next.some(
          (x) => `${x.file.name}:${x.file.size}:${x.file.lastModified}` === key
        );
        if (!already) next.push({ file: f, status: "PENDING" });
      }
      return next;
    });
  }

  function removeFile(index: number) {
    if (busy) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function clearFiles() {
    if (busy) return;
    setItems([]);
  }

  // Allow user to switch machine even when scoped, by “unscoping” the URL.
  function changeMachine() {
    if (busy) return;
    const next = new URLSearchParams(params);
    next.delete("machineId");
    setParams(next, { replace: true });
    setScopedToMachine(false);
    // keep current machineId so dropdown is prefilled; user can change it
  }

  // ------------------------------------
  // Upload handler (sequential)
  // ------------------------------------
  async function handleUpload() {
    if (machineId === "") {
      setStatus("Please select a machine.");
      return;
    }
    if (items.length === 0) {
      setStatus("Please select or drop one or more XML files.");
      return;
    }

    setBusy(true);
    setStatus(`Uploading ${items.length} file(s)…`);

    try {
      for (let i = 0; i < items.length; i++) {
        const current = items[i];

        setItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, status: "UPLOADING", message: undefined } : it
          )
        );

        try {
          const uploadRes = await uploadWasherXml({
            environmentCode,
            machineId: Number(machineId),
            file: current.file,
          });

          setItems((prev) =>
            prev.map((it, idx) =>
              idx === i
                ? {
                    ...it,
                    status: "SUCCESS",
                    message: `Parsed ✅ ${uploadRes.original_filename} (${Math.round(
                      uploadRes.bytes / 1024
                    )} KB)`,
                  }
                : it
            )
          );
        } catch (err) {
          setItems((prev) =>
            prev.map((it, idx) =>
              idx === i
                ? {
                    ...it,
                    status: "FAILED",
                    message: `Failed ❌ ${getApiErrorMessage(err)}`,
                  }
                : it
            )
          );
        }
      }

      setStatus("Upload complete.");
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

    const dropped = e.dataTransfer.files;
    if (dropped && dropped.length) addFiles(dropped);
  }

  // ------------------------------------
  // Render
  // ------------------------------------
  const titleMachine = selectedMachine?.machine_name?.trim();
  const title = titleMachine ? `Upload cycles — ${titleMachine}` : "Upload cycles";

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-1">{title}</h1>
          <div className="text-secondary small">
            Drop cycle XML files below. Files are parsed automatically.
          </div>

          {/* Optional machine meta under title */}
          {selectedMachine && (
            <div className="text-secondary small mt-1">
              {selectedMachine.manufacturer ?? "—"}
              {selectedMachine.model ? ` • ${selectedMachine.model}` : ""}
              {selectedMachine.machine_code ? ` • ${selectedMachine.machine_code}` : ""}
              {scopedToMachine && (
                <>
                  {" "}
                  •{" "}
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 align-baseline"
                    onClick={changeMachine}
                    disabled={busy}
                  >
                    Change machine
                  </button>
                </>
              )}
            </div>
          )}
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

      <div className="card border-secondary">
        <div className="card-body">
          {/* Machine select (only show when NOT scoped) */}
          {!scopedToMachine && (
            <div className="mb-3">
              <label className="form-label">Machine</label>
              <select
                className="form-select"
                value={machineId}
                disabled={busy}
                onChange={(e) => setMachineId(e.target.value ? Number(e.target.value) : "")}
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
          )}

          {/* Big dropzone */}
          <label className="form-label">Cycle XML file(s)</label>
          <div
            className={`border rounded text-center ${
              dragOver ? "border-primary bg-primary bg-opacity-10" : "border-secondary"
            }`}
            style={{
              cursor: "pointer",
              minHeight: 220, // ✅ larger
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2rem",
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById("cycle-upload-input")?.click()}
          >
            <div>
              <i className="bi bi-upload fs-1 mb-2 d-block" />
              <div className="fw-semibold">
                {items.length ? `${items.length} file(s) ready to upload` : "Drag & drop XML files here"}
              </div>
              <div className="text-secondary small">or click to browse</div>

              {items.length > 0 && (
                <div className="text-secondary small mt-2">
                  Tip: drop more files to add to the queue.
                </div>
              )}
            </div>
          </div>

          <input
            id="cycle-upload-input"
            type="file"
            multiple
            accept=".xml,application/xml,text/xml"
            className="d-none"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />

          {/* Selected files list */}
          <div className="mt-3">
            {items.length > 0 ? (
              <div className="border rounded p-2">
                {items.map((it, idx) => (
                  <div
                    key={`${it.file.name}:${it.file.size}:${it.file.lastModified}`}
                    className="d-flex align-items-center justify-content-between py-1"
                  >
                    <div className="me-3">
                      <div className="fw-medium">{it.file.name}</div>
                      <div className="text-secondary small">
                        {Math.round(it.file.size / 1024)} KB{" "}
                        {it.status === "UPLOADING" ? "• Uploading…" : ""}
                      </div>
                      {it.message && <div className="text-secondary small">{it.message}</div>}
                    </div>

                    <div className="d-flex align-items-center gap-2">
                      <span
                        className={
                          it.status === "SUCCESS"
                            ? "badge bg-success"
                            : it.status === "FAILED"
                            ? "badge bg-danger"
                            : it.status === "UPLOADING"
                            ? "badge bg-primary"
                            : "badge bg-secondary"
                        }
                      >
                        {it.status}
                      </span>

                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => removeFile(idx)}
                        disabled={busy}
                        title="Remove file"
                      >
                        <i className="bi bi-x" />
                      </button>
                    </div>
                  </div>
                ))}

                <div className="d-flex justify-content-end mt-2">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={clearFiles}
                    disabled={busy}
                  >
                    Clear files
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-secondary small mt-2">No files selected yet.</div>
            )}
          </div>

          {/* Actions */}
          <div className="d-flex justify-content-between align-items-center mt-3">
            <div className="text-secondary small">{status}</div>
            <div className="d-flex gap-2">
              <button className="btn btn-primary btn-sm" disabled={!canUpload} onClick={handleUpload}>
                {busy ? "Uploading…" : "Upload cycles"}
              </button>

              <button
                className="btn btn-outline-secondary btn-sm"
                disabled={busy}
                onClick={() => {
                  setItems([]);
                  // keep machine selection if scoped; otherwise clear
                  if (!scopedToMachine) setMachineId("");
                  setStatus("");
                }}
              >
                Reset
              </button>
            </div>
          </div>

          {/* If user somehow scoped but machine not loaded/found */}
          {scopedToMachine && machineId !== "" && !selectedMachine && (
            <div className="alert alert-warning mt-3 mb-0">
              This upload link references a machine that is not available.{" "}
              <button type="button" className="btn btn-link btn-sm p-0" onClick={changeMachine}>
                Select a different machine
              </button>
              .
            </div>
          )}
        </div>
      </div>
    </div>
  );
}