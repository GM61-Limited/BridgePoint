
// src/pages/UploadCycle.tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

/** Minimal cycle type used to validate uploads */
type UploadCycle = {
  id: string;
  deviceId: string;
  cycleNo: number;
  program: string;
  start: string;         // ISO
  durationMin: number;
  pass: boolean;
  failReasons?: string[];
  trace?: {
    temperatureC?: { t: string; value: number }[];
    pressureBar?: { t: string; value: number }[];
    conductivityUs?: { t: string; value: number }[];
  };
};

type ParseResult =
  | { ok: true; cycles: UploadCycle[] }
  | { ok: false; error: string };

function parseJsonText(text: string): ParseResult {
  try {
    const data = JSON.parse(text);
    const arr: UploadCycle[] = Array.isArray(data) ? data : [data];

    // Basic validation
    for (const c of arr) {
      if (
        typeof c.id !== "string" ||
        typeof c.deviceId !== "string" ||
        typeof c.cycleNo !== "number" ||
        typeof c.program !== "string" ||
        typeof c.start !== "string" ||
        typeof c.durationMin !== "number" ||
        typeof c.pass !== "boolean"
      ) {
        return { ok: false, error: "One or more required fields are missing or invalid." };
      }
    }
    return { ok: true, cycles: arr };
  } catch {
    return { ok: false, error: "Invalid JSON format." };
  }
}

export default function UploadCycle() {
  const [status, setStatus] = useState<string>("");
  const [preview, setPreview] = useState<UploadCycle[] | null>(null);
  const [paste, setPaste] = useState<string>("");

  async function handleFileChange(file?: File) {
    if (!file) return;
    const text = await file.text();
    const result = parseJsonText(text);
    if (result.ok) {
      setPreview(result.cycles);
      setStatus(`Loaded ${result.cycles.length} cycle(s).`);
    } else {
      setPreview(null);
      setStatus(result.error);
    }
  }

  function handlePasteParse() {
    const result = parseJsonText(paste);
    if (result.ok) {
      setPreview(result.cycles);
      setStatus(`Parsed ${result.cycles.length} cycle(s) from pasted JSON.`);
    } else {
      setPreview(null);
      setStatus(result.error);
    }
  }

  function handleDownloadTemplate() {
    const template: UploadCycle = {
      id: "c-demo-001",
      deviceId: "w-01",
      cycleNo: 125,
      program: "Instruments High",
      start: new Date().toISOString(),
      durationMin: 43,
      pass: true,
      trace: {
        temperatureC: [
          { t: "08:10", value: 25 },
          { t: "08:15", value: 55 },
          { t: "08:25", value: 65 },
          { t: "08:30", value: 88 },
          { t: "08:35", value: 92 },
          { t: "08:40", value: 90 }
        ]
      }
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "cycle-template.json"; a.click();
    URL.revokeObjectURL(url);
  }

  /** In production: POST preview to API, then redirect to cycles page */
  function handleSubmit() {
    if (!preview || preview.length === 0) {
      setStatus("Nothing to upload. Please select a file or paste JSON.");
      return;
    }
    // Demo: just show success message
    setStatus(`Uploaded ${preview.length} cycle(s). (demo)`);
  }

  const previewTable = useMemo(() => {
    if (!preview || preview.length === 0) return null;
    return (
      <div className="table-responsive mt-3">
        <table className="table table-sm align-middle">
          <thead className="table-light">
            <tr>
              <th>id</th><th>deviceId</th><th>#</th><th>program</th><th>start</th><th>duration</th><th>result</th>
            </tr>
          </thead>
          <tbody>
            {preview.map(p => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.deviceId}</td>
                <td>#{p.cycleNo}</td>
                <td>{p.program}</td>
                <td>{new Date(p.start).toLocaleString()}</td>
                <td>{p.durationMin} min</td>
                <td className={p.pass ? "text-success" : "text-danger"}>{p.pass ? "Pass" : "Fail"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [preview]);

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-0">Manual Cycle Upload</h1>
          <div className="text-secondary small">
            Upload JSON files or paste JSON to add cycles; preview validates required fields.
          </div>
        </div>
        <div className="d-flex gap-2">
          <Link to="/wash-cycles" className="btn btn-outline-secondary btn-sm">Go to Wash Cycles</Link>
          <button className="btn btn-outline-secondary btn-sm" onClick={handleDownloadTemplate}>Download template</button>
        </div>
      </div>

      {/* File upload */}
      <div className="card border-secondary mb-3">
        <div className="card-body">
          <h2 className="h6">Upload JSON file</h2>
          <input
            type="file"
            accept="application/json"
            className="form-control mt-2"
            onChange={e => handleFileChange(e.target.files?.[0])}
            aria-label="Upload JSON file of cycles"
          />
          <div className="text-secondary small mt-2">
            Accepts a single cycle object or an array of cycles. Use the template for the expected structure.
          </div>
        </div>
      </div>

      {/* Paste JSON */}
      <div className="card border-secondary mb-3">
        <div className="card-body">
          <h2 className="h6">Paste JSON</h2>
          <textarea
            className="form-control"
            rows={8}
            placeholder='[{ "id":"c-001", "deviceId":"w-01", "cycleNo":125, ... }]'
            value={paste}
            onChange={e => setPaste(e.target.value)}
          />
          <div className="mt-2 d-flex gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={handlePasteParse}>Parse</button>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setPaste("")}>Clear</button>
          </div>
        </div>
      </div>

      {/* Preview & submit */}
      {previewTable}
      <div className="d-flex justify-content-between align-items-center mt-3">
        <div className="text-secondary small">{status}</div>
        <div className="d-flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={handleSubmit}>Upload (demo)</button>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => { setPreview(null); setStatus(""); }}>Reset</button>
        </div>
      </div>

      {/* Schema help */}
      <div className="card border-secondary mt-4">
        <div className="card-body">
          <h2 className="h6">Expected JSON fields</h2>
          <ul className="text-secondary small mb-0">
            <li><code>id</code> (string) – unique identifier for the cycle</li>
            <li><code>deviceId</code> (string) – e.g., <code>w-01</code></li>
            <li><code>cycleNo</code> (number)</li>
            <li><code>program</code> (string) – e.g., “Instruments High”</li>
            <li><code>start</code> (ISO string) – e.g., <code>2026-01-13T08:10:00Z</code></li>
            <li><code>durationMin</code> (number)</li>
            <li><code>pass</code> (boolean)</li>
            <li><code>failReasons</code> (string[]) – optional</li>
            <li><code>trace.temperatureC</code> (array of {`{ t, value }`}) – optional</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
