import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  getWasherCycle,
  getWasherCycleTelemetry,
  type WasherCycle,
} from "../lib/api";

import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip
);

/* --------------------------------------------------
   Types
-------------------------------------------------- */

type TelemetrySeries = {
  sensor: string;
  unit: string;
  series: [number | string, number | string][];
};

/* --------------------------------------------------
   Colours
-------------------------------------------------- */

const SENSOR_COLOURS: Record<string, string> = {
  temperature_1: "#ff7a00",
  temperature_2: "#ff3b3b",
  pressure: "#2ecc71",
  conductivity: "#6f42c1",
  a0: "#00bcd4",
};

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function formatDurationSeconds(seconds?: number | null) {
  if (seconds === undefined || seconds === null) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return hh > 0 ? `${hh}h ${mm}m ${ss}s` : `${mm}m ${ss}s`;
}

function badgeClass(result: "PASS" | "FAIL" | "UNKNOWN") {
  if (result === "PASS") return "bg-success";
  if (result === "FAIL") return "bg-danger";
  return "bg-secondary";
}

/* --------------------------------------------------
   Timestamp normalisation (cycle-aware)
-------------------------------------------------- */

function normalizeTsMsWithAnchor(
  ts: number | string,
  cycleStartMs: number | null
): number | null {
  const n = typeof ts === "number" ? ts : Number(ts);
  if (!Number.isFinite(n)) return null;

  if (n > 1e11) return n;
  if (n > 1e9) return n * 1000;

  if (cycleStartMs !== null) {
    return cycleStartMs + n * 1000;
  }

  return null;
}

function normalizeNumber(v: number | string): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function floorToMinute(ms: number) {
  return Math.floor(ms / 60000) * 60000;
}

function ceilToMinute(ms: number) {
  return Math.ceil(ms / 60000) * 60000;
}

function isDarkMode() {
  const attr = document.documentElement.getAttribute("data-bs-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

function sensorToYAxis(sensor: string) {
  switch (sensor) {
    case "temperature_1":
    case "temperature_2":
      return "yTemp";
    case "a0":
      return "yA0";
    case "pressure":
      return "yPressure";
    case "conductivity":
      return "yConductivity";
    default:
      return "yTemp";
  }
}

/* --------------------------------------------------
   Plugins
-------------------------------------------------- */

const plotBackgroundPlugin = {
  id: "plotBackground",
  beforeDraw: (chart: any) => {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const bg = isDarkMode() ? "#212529" : "#ffffff";
    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(
      chartArea.left,
      chartArea.top,
      chartArea.width,
      chartArea.height
    );
    ctx.restore();
  },
};

const hoverLinePlugin = {
  id: "hoverLine",
  afterDraw: (chart: any) => {
    const tooltip = chart.tooltip;
    if (!tooltip || !tooltip.getActiveElements().length) return;

    const { ctx, chartArea } = chart;
    const x = tooltip.getActiveElements()[0].element.x;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = isDarkMode()
      ? "rgba(255,255,255,0.25)"
      : "rgba(0,0,0,0.25)";
    ctx.stroke();
    ctx.restore();
  },
};

ChartJS.register(plotBackgroundPlugin, hoverLinePlugin);

/* --------------------------------------------------
   Component
-------------------------------------------------- */

export default function WashCycleDetails() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();

  const [cycle, setCycle] = useState<WasherCycle | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySeries[]>([]);
  const [validation, setValidation] = useState<"PASS" | "FAIL" | "UNKNOWN">(
    "UNKNOWN"
  );
  const [loading, setLoading] = useState(true);

  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeKey((k) => k + 1);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-bs-theme"],
    });

    return () => observer.disconnect();
  }, []);

  const backToCyclesHref = useMemo(() => {
    const rt = (params.get("returnTo") || "").trim();
    if (rt && rt.startsWith("/wash-cycles")) return rt;
    return "/wash-cycles";
  }, [params]);

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    Promise.all([
      getWasherCycle(Number(id)),
      getWasherCycleTelemetry(Number(id)),
    ])
      .then(([cycleData, telemetryData]) => {
        setCycle(cycleData);
        setTelemetry((telemetryData.points ?? []) as TelemetrySeries[]);
        setValidation(telemetryData.validation?.result ?? "UNKNOWN");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const cycleStartMs = cycle?.started_at
    ? new Date(cycle.started_at).getTime()
    : null;

  const xRange = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;

    for (const s of telemetry) {
      for (const [ts] of s.series ?? []) {
        const t = normalizeTsMsWithAnchor(ts, cycleStartMs);
        if (t === null) continue;
        min = Math.min(min, t);
        max = Math.max(max, t);
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      const now = Date.now();
      return { min: floorToMinute(now), max: ceilToMinute(now + 3600000) };
    }

    return { min: floorToMinute(min), max: ceilToMinute(max) };
  }, [telemetry, cycleStartMs]);

  const datasets = useMemo(() => {
    return telemetry.map((s) => {
      const data = (s.series ?? [])
        .map(([ts, value]) => {
          const x = normalizeTsMsWithAnchor(ts, cycleStartMs);
          const y = normalizeNumber(value);
          if (x === null || y === null) return null;
          return { x, y };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.x - b.x);

      return {
        label: `${s.sensor} (${s.unit})`,
        data,
        borderColor: SENSOR_COLOURS[s.sensor] ?? "#999",
        backgroundColor: SENSOR_COLOURS[s.sensor] ?? "#999",
        stepped: true,
        pointRadius: 0,
        borderWidth: 2,
        parsing: false as const,
        yAxisID: sensorToYAxis(s.sensor),
      };
    });
  }, [telemetry, cycleStartMs]);

  const dark = isDarkMode();
  const axisText = dark ? "#e5e7eb" : "#111827";
  const grid = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index" as const, intersect: false },
      scales: {
        x: {
          type: "linear" as const,
          min: xRange.min,
          max: xRange.max,
          ticks: {
            color: axisText,
            callback: (v: number | string) =>
              new Date(Number(v)).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              }),
          },
          grid: { color: grid },
        },
        yTemp: {
          position: "left" as const,
          title: { display: true, text: "Temperature (°C)", color: axisText },
          ticks: { color: axisText },
          grid: { color: grid },
        },
        yA0: {
          position: "left" as const,
          offset: true,
          title: { display: true, text: "A₀", color: axisText },
          ticks: { color: axisText },
          grid: { drawOnChartArea: false },
        },
        yPressure: {
          position: "right" as const,
          title: { display: true, text: "Pressure (bar)", color: axisText },
          ticks: { color: axisText },
          grid: { drawOnChartArea: false },
        },
        yConductivity: {
          position: "right" as const,
          offset: true,
          title: {
            display: true,
            text: "Conductivity (µS/cm)",
            color: axisText,
          },
          ticks: { color: axisText },
          grid: { drawOnChartArea: false },
        },
      },
      plugins: {
        legend: {
          position: "top" as const,
          labels: { color: axisText, usePointStyle: true, boxWidth: 10 },
        },
      },
    }),
    [xRange, axisText, grid]
  );

  if (loading || !cycle) {
    return <div className="container py-4">Loading…</div>;
  }

  const startedAt = cycle.started_at;
  const endedAt = cycle.ended_at;

  const durationSeconds =
    startedAt && endedAt
      ? (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
      : null;

  const stages = (cycle as any).extra?.stages ?? {};

  return (
    <div className="container py-4">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <Link to={backToCyclesHref} className="btn btn-link btn-sm">
          ← Back to cycles
        </Link>

        {/* ✅ NEW: Export PDF */}
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={() =>
            window.open(`/api/v1/cycles/${cycle.id}/export-pdf`, "_blank")
          }
        >
          Export PDF
        </button>
      </div>

      <div className="card mb-3">
        <div className="card-body">
          <div className="d-flex align-items-center gap-2 mb-2">
            <h1 className="h4 mb-0">
              Cycle {cycle.cycle_number ? `#${cycle.cycle_number}` : ""}
            </h1>
            <span className={`badge ${badgeClass(validation)}`}>
              {validation === "PASS"
                ? "Cycle OK"
                : validation === "FAIL"
                ? "Cycle FAIL"
                : "Unknown"}
            </span>
          </div>

          <div className="text-secondary small">
            <div>
              <strong>Machine:</strong> {(cycle as any).machine_name}
            </div>
            <div>
              <strong>Program:</strong> {(cycle as any).program_name ?? "—"}
            </div>
            <div>
              <strong>Start:</strong> {formatDateTime(startedAt)}
              <span className="mx-2">•</span>
              <strong>End:</strong> {formatDateTime(endedAt)}
              <span className="mx-2">•</span>
              <strong>Duration:</strong>{" "}
              {formatDurationSeconds(durationSeconds)}
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-body">
          <h2 className="h6 mb-3">Cycle telemetry</h2>
          <div style={{ height: 580 }}>
            <Line
              key={themeKey}
              data={{ datasets }}
              options={chartOptions as any}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="h6 mb-3">Wash Cycle Critical Parameters</h2>
          <table className="table table-sm mb-0">
            <tbody>
              {[
                ["Pre Wash", stages.pre_wash],
                ["Wash", stages.wash],
                ["Rinse", stages.rinse],
                ["Disinfection", stages.disinfection],
                ["Drying", stages.drying],
              ].map(([label, stage]: any) => (
                <>
                  <tr>
                    <td>{label} Start / End</td>
                    <td className="text-end">
                      {formatDateTime(stage?.started_at)} →{" "}
                      {formatDateTime(stage?.ended_at)}
                    </td>
                  </tr>
                  <tr>
                    <td>{label} Temp</td>
                    <td className="text-end">
                      {stage?.temperature_c !== undefined
                        ? `${stage.temperature_c} °C`
                        : "—"}
                    </td>
                  </tr>
                </>
              ))}
              <tr>
                <td className="fw-semibold">Pass / Fail</td>
                <td className="text-end fw-bold">{validation}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}