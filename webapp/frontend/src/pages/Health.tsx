// src/pages/Health.tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

/**
 * Health (Preview)
 * ----------------
 * MVP placeholder page for future predictive maintenance / ML.
 * This intentionally uses mocked values + simple visuals, so we can
 * ship a credible UI now and wire in real signals later.
 */

type HealthLevel = "NORMAL" | "WATCH" | "ATTENTION";

type HealthSignal = {
  key: string;
  title: string;
  description: string;
  valueLabel: string;
  deltaLabel?: string;
  deltaDirection?: "up" | "down" | "flat";
  severity: HealthLevel;
  progress: number; // 0..100 for visual meter
  hint: string;
};

type RiskRow = {
  machineName: string;
  level: HealthLevel;
  notes: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  lastSeen?: string;
};

function badgeForLevel(level: HealthLevel) {
  switch (level) {
    case "NORMAL":
      return "badge bg-success";
    case "WATCH":
      return "badge bg-warning text-dark";
    case "ATTENTION":
      return "badge bg-danger";
  }
}

function labelForLevel(level: HealthLevel) {
  switch (level) {
    case "NORMAL":
      return "Normal";
    case "WATCH":
      return "Watch";
    case "ATTENTION":
      return "Attention";
  }
}

function progressColor(level: HealthLevel) {
  switch (level) {
    case "NORMAL":
      return "bg-success";
    case "WATCH":
      return "bg-warning";
    case "ATTENTION":
      return "bg-danger";
  }
}

function deltaIcon(dir?: "up" | "down" | "flat") {
  if (!dir) return null;
  if (dir === "up") return <i className="bi bi-arrow-up-right" aria-hidden="true" />;
  if (dir === "down") return <i className="bi bi-arrow-down-right" aria-hidden="true" />;
  return <i className="bi bi-dash" aria-hidden="true" />;
}

function deltaClass(dir?: "up" | "down" | "flat") {
  if (!dir) return "text-secondary";
  if (dir === "up") return "text-warning";
  if (dir === "down") return "text-success";
  return "text-secondary";
}

/** Small helper to clamp progress nicely */
function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export default function Health() {
  // For now, this is a UI placeholder. Later, this can become:
  // - date range selector (7/30/90)
  // - machine selector
  // - "baseline period" selection
  const [rangeDays, setRangeDays] = useState<number>(30);

  // Mock "signals" that look and feel real. Replace with computed values later.
  const signals: HealthSignal[] = useMemo(
    () => [
      {
        key: "temp_ramp",
        title: "Temperature ramp time",
        description: "Average time to reach target temperature",
        valueLabel: "07m 12s",
        deltaLabel: "+12% vs baseline",
        deltaDirection: "up",
        severity: "WATCH",
        progress: 62,
        hint:
          "Longer ramp times may indicate heater degradation, scale build-up, or reduced water flow.",
      },
      {
        key: "cycle_duration",
        title: "Cycle duration drift",
        description: "Average cycle duration compared to baseline",
        valueLabel: "+08m",
        deltaLabel: "+9% vs baseline",
        deltaDirection: "up",
        severity: "WATCH",
        progress: 58,
        hint:
          "Increasing durations can reflect mechanical wear, dosing issues, or program changes.",
      },
      {
        key: "pressure_stability",
        title: "Pressure stability",
        description: "Pressure variance during critical phases",
        valueLabel: "Stable",
        deltaLabel: "No change",
        deltaDirection: "flat",
        severity: "NORMAL",
        progress: 22,
        hint:
          "High variance can indicate leaks, pump wear, or sensor drift. Stable signals are a good sign.",
      },
      {
        key: "fail_freq",
        title: "Failure frequency",
        description: "Failed cycles in recent period",
        valueLabel: "1 fail",
        deltaLabel: "Last 14 days",
        deltaDirection: "flat",
        severity: "ATTENTION",
        progress: 78,
        hint:
          "Repeated failures typically correlate with increased breakdown risk. Investigate recent failed cycles.",
      },
    ],
    []
  );

  // Mock “risk ranking”. Later this becomes computed scores per machine.
  const riskTable: RiskRow[] = useMemo(
    () => [
      {
        machineName: "Washer 3",
        level: "WATCH",
        notes: "Cycle durations trending longer; temperature ramp slightly slower.",
        confidence: "MEDIUM",
        lastSeen: "2 days ago",
      },
      {
        machineName: "Washer 1",
        level: "NORMAL",
        notes: "No meaningful drift detected. Stable temperature and pressure behaviour.",
        confidence: "HIGH",
        lastSeen: "Today",
      },
      {
        machineName: "Washer 2",
        level: "ATTENTION",
        notes: "Recent failures detected. Review failed cycles and verify sensors/consumables.",
        confidence: "MEDIUM",
        lastSeen: "6 days ago",
      },
    ],
    []
  );

  // A mock "overall health" meter (derived for UI feel)
  const overall = useMemo(() => {
    // simple heuristic: NORMAL=0, WATCH=1, ATTENTION=2
    const score =
      signals.reduce((acc, s) => {
        if (s.severity === "NORMAL") return acc + 0;
        if (s.severity === "WATCH") return acc + 1;
        return acc + 2;
      }, 0) / (signals.length * 2);

    // Convert to "health %" where 100 is good.
    const healthPct = Math.round((1 - score) * 100);
    const level: HealthLevel =
      healthPct >= 75 ? "NORMAL" : healthPct >= 45 ? "WATCH" : "ATTENTION";

    return { healthPct, level };
  }, [signals]);

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-1">
            Health <span className="badge bg-secondary ms-2">Preview</span>
          </h1>
          <div className="text-secondary small">
            Early indicators and predictive insights based on historical cycle data. Models are not active yet.
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          <label className="text-secondary small mb-0">Range</label>
          <select
            className="form-select form-select-sm"
            style={{ width: 140 }}
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Overall health strip */}
      <div className="card border-secondary mb-3">
        <div className="card-body d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div>
            <div className="text-secondary small">Overall health (preview)</div>
            <div className="d-flex align-items-center gap-2">
              <div className="h4 mb-0">{overall.healthPct}%</div>
              <span className={badgeForLevel(overall.level)}>{labelForLevel(overall.level)}</span>
            </div>
            <div className="text-secondary small mt-1">
              This score is indicative only. It will become model-driven once predictive logic is implemented.
            </div>
          </div>

          <div style={{ minWidth: 260, flex: 1 }}>
            <div className="progress" style={{ height: 10 }}>
              <div
                className={`progress-bar ${progressColor(overall.level)}`}
                role="progressbar"
                style={{ width: `${clamp(overall.healthPct)}%` }}
                aria-valuenow={overall.healthPct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <div className="d-flex justify-content-between text-secondary small mt-1">
              <span>Needs attention</span>
              <span>Healthy</span>
            </div>
          </div>

          <div className="d-flex gap-2">
            <Link to="/machines" className="btn btn-outline-secondary btn-sm">
              View machines
            </Link>
            <Link to="/wash-cycles" className="btn btn-outline-secondary btn-sm">
              View cycles
            </Link>
          </div>
        </div>
      </div>

      {/* Health signals */}
      <div className="row g-3 mb-3">
        {signals.map((s) => (
          <div key={s.key} className="col-12 col-md-6 col-xl-3 d-flex">
            <div className="card border-secondary flex-fill">
              <div className="card-body">
                <div className="d-flex align-items-start justify-content-between gap-2">
                  <div>
                    <div className="fw-semibold">{s.title}</div>
                    <div className="text-secondary small">{s.description}</div>
                  </div>
                  <span className={badgeForLevel(s.severity)} title="Indicative only (preview)">
                    {labelForLevel(s.severity)}
                  </span>
                </div>

                <div className="mt-3 d-flex align-items-end justify-content-between">
                  <div className="h5 mb-0">{s.valueLabel}</div>
                  {s.deltaLabel && (
                    <div className={`small ${deltaClass(s.deltaDirection)} d-flex align-items-center gap-1`}>
                      {deltaIcon(s.deltaDirection)}
                      <span>{s.deltaLabel}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <div className="progress" style={{ height: 8 }}>
                    <div
                      className={`progress-bar ${progressColor(s.severity)}`}
                      role="progressbar"
                      style={{ width: `${clamp(s.progress)}%` }}
                      aria-valuenow={s.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                  <div className="text-secondary small mt-2">{s.hint}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Risk ranking + explanation */}
      <div className="row g-3">
        {/* Risk ranking */}
        <div className="col-12 col-lg-7">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <div>
                  <div className="fw-semibold">Machine risk ranking</div>
                  <div className="text-secondary small">
                    Prioritisation based on signal drift and recent failures (preview).
                  </div>
                </div>
                <span className="text-secondary small">Range: {rangeDays} days</span>
              </div>

              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Machine</th>
                      <th>Status</th>
                      <th>Confidence</th>
                      <th>Last seen</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riskTable.map((r) => (
                      <tr key={r.machineName}>
                        <td className="fw-semibold">{r.machineName}</td>
                        <td>
                          <span className={badgeForLevel(r.level)}>{labelForLevel(r.level)}</span>
                        </td>
                        <td>
                          <span
                            className={
                              r.confidence === "HIGH"
                                ? "badge bg-success"
                                : r.confidence === "MEDIUM"
                                ? "badge bg-warning text-dark"
                                : "badge bg-secondary"
                            }
                            title="Confidence is indicative only in preview"
                          >
                            {r.confidence}
                          </span>
                        </td>
                        <td className="text-secondary">{r.lastSeen ?? "—"}</td>
                        <td className="text-secondary">{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-secondary small mt-2">
                Health status is indicative only. Future versions will calculate per-machine baselines and trend deviations.
              </div>
            </div>
          </div>
        </div>

        {/* How it will work */}
        <div className="col-12 col-lg-5">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <div className="fw-semibold mb-2">How Health will work (coming soon)</div>

              <div className="text-secondary small mb-3">
                The Health module will analyse long-term trends across cycle telemetry and outcomes to detect drift and
                estimate breakdown risk.
              </div>

              <ul className="small mb-3">
                <li className="mb-2">
                  <span className="fw-semibold">Baseline per machine &amp; program:</span>{" "}
                  establish “normal” behaviour (cycle duration, ramp time, stability).
                </li>
                <li className="mb-2">
                  <span className="fw-semibold">Drift detection:</span>{" "}
                  highlight gradual changes like slower heating or longer cycles.
                </li>
                <li className="mb-2">
                  <span className="fw-semibold">Failure correlation:</span>{" "}
                  incorporate repeated failures to raise risk and prioritise action.
                </li>
                <li className="mb-2">
                  <span className="fw-semibold">Predictive scoring:</span>{" "}
                  provide a probability-style risk score and recommended next steps.
                </li>
              </ul>

              <div className="alert alert-info py-2 mb-3">
                <div className="small">
                  <span className="fw-semibold">Preview mode:</span> visuals are representative. We’ll wire real signals
                  once telemetry baselines and rules are finalised.
                </div>
              </div>

              <div className="d-flex gap-2">
                <Link to="/machines/dashboard" className="btn btn-outline-primary btn-sm">
                  View dashboard
                </Link>
                <Link to="/wash-cycles" className="btn btn-outline-secondary btn-sm">
                  Inspect cycles
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footnote */}
      <div className="text-secondary small mt-3">
        Tip: Once implemented, Health will support machine-level drill-down with trends for ramp time, hold stability,
        and cycle duration by program.
      </div>
    </div>
  );
}