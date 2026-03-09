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

function formatDateTime(value?: string) {
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

function normalizeTsMs(ts: number | string): number | null {
  // Accept ms epoch, sec epoch, numeric strings, ISO strings
  if (typeof ts === "number") {
    if (!Number.isFinite(ts)) return null;
    // seconds epoch?
    if (ts > 0 && ts < 1e11) return ts * 1000;
    return ts;
  }

  const s = String(ts).trim();
  if (!s) return null;

  // ISO date?
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return parsed;

  // numeric string
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n > 0 && n < 1e11) return n * 1000;
  return n;
}

function normalizeNumber(v: number | string): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).trim());
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

/* --------------------------------------------------
   Plugin: fill plot area background to match theme
-------------------------------------------------- */

const plotBackgroundPlugin = {
  id: "plotBackground",
  beforeDraw: (chart: any) => {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const dark = isDarkMode();
    const bg = dark ? "#111318" : "#ffffff";

    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
    ctx.restore();
  },
};

ChartJS.register(plotBackgroundPlugin);

export default function WashCycleDetails() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();

  const [cycle, setCycle] = useState<WasherCycle | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySeries[]>([]);
  const [validation, setValidation] = useState<"PASS" | "FAIL" | "UNKNOWN">("UNKNOWN");
  const [loading, setLoading] = useState(true);

  /**
   * ✅ Scope-preserving back link
   * Prefer returnTo; fallback to machineId/machine; else /wash-cycles.
   */
  const backToCyclesHref = useMemo(() => {
    const rt = (params.get("returnTo") || "").trim();

    // Prevent open redirects: only allow internal return to cycles.
    if (rt && rt.startsWith("/wash-cycles")) return rt;

    // Fallback: rebuild from machineId (+ optional machine label)
    const machineId = params.get("machineId") || params.get("device");
    const machineLabel = params.get("machine");

    const q = new URLSearchParams();
    if (machineId) q.set("machineId", machineId);
    if (machineLabel) q.set("machine", machineLabel);

    const qs = q.toString();
    return `/wash-cycles${qs ? `?${qs}` : ""}`;
  }, [params]);

  /* --------------------------------------------------
     Load data
  -------------------------------------------------- */

  useEffect(() => {
    if (!id) return;

    setLoading(true);

    Promise.all([getWasherCycle(Number(id)), getWasherCycleTelemetry(Number(id))])
      .then(([cycleData, telemetryData]) => {
        setCycle(cycleData);
        setTelemetry((telemetryData.points ?? []) as TelemetrySeries[]);
        setValidation(telemetryData.validation?.result ?? "UNKNOWN");
      })
      .finally(() => setLoading(false));
  }, [id]);

  /* --------------------------------------------------
     Compute X range from telemetry itself (NOT end time)
     This prevents “wrong end time” from hiding points.
  -------------------------------------------------- */

  const xRange = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const s of telemetry) {
      for (const [ts] of s.series ?? []) {
        const t = normalizeTsMs(ts);
        if (t === null) continue;
        min = Math.min(min, t);
        max = Math.max(max, t);
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      // fallback: 1 hour window starting “now”
      const now = Date.now();
      return { min: floorToMinute(now), max: ceilToMinute(now + 60 * 60 * 1000) };
    }

    // round to minute boundaries so ticks are “every minute from start minute”
    return { min: floorToMinute(min), max: ceilToMinute(max) };
  }, [telemetry]);

  /* --------------------------------------------------
     Telemetry chart
  -------------------------------------------------- */

  const datasets = useMemo(() => {
    return telemetry.map((s) => {
      const points = (s.series ?? [])
        .map(([ts, value]) => {
          const t = normalizeTsMs(ts);
          const v = normalizeNumber(value);
          if (t === null || v === null) return null;
          return { x: t, y: v };
        })
        .filter((p): p is { x: number; y: number } => !!p)
        .sort((a, b) => a.x - b.x);

      return {
        label: `${s.sensor} (${s.unit})`,
        data: points,
        borderColor: SENSOR_COLOURS[s.sensor] ?? "#999",
        backgroundColor: SENSOR_COLOURS[s.sensor] ?? "#999",
        stepped: true,
        pointRadius: 0,
        borderWidth: 2,
        parsing: false as const, // important with {x,y}
      };
    });
  }, [telemetry]);

  const chartData = useMemo(() => ({ datasets }), [datasets]);

  const hasAnyPoints = useMemo(
    () => datasets.some((d: any) => (d.data?.length ?? 0) > 1),
    [datasets]
  );

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
          title: { display: true, text: "Time", color: axisText },
          grid: { color: grid },
          ticks: {
            stepSize: 60_000, // every minute
            autoSkip: true,
            maxTicksLimit: 18,
            maxRotation: 65,
            minRotation: 65,
            color: axisText,
            callback: (value: string | number) => {
              const n = typeof value === "number" ? value : Number(value);
              if (!Number.isFinite(n)) return String(value);
              return new Date(n).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });
            },
          },
        },
        y: {
          beginAtZero: false,
          title: { display: true, text: "Value", color: axisText },
          grid: { color: grid },
          ticks: { color: axisText },
        },
      },
      plugins: {
        legend: {
          position: "top" as const,
          labels: { color: axisText, usePointStyle: true, boxWidth: 10 },
        },
      },
    }),
    [xRange.min, xRange.max, axisText, grid]
  );

  /* --------------------------------------------------
     Render guards (after hooks)
  -------------------------------------------------- */

  if (loading || !cycle) return <div className="container py-4">Loading…</div>;

  const stages = (cycle as any).extra?.stages ?? {};

  const startedAt = (cycle as any).started_at as string | undefined;
  const endedAt = (cycle as any).ended_at as string | undefined;
  const durationSeconds =
    (cycle as any)?.duration_seconds ??
    (startedAt && endedAt
      ? (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
      : null);

  const formatStartEnd = (stage?: any) => {
    if (!stage) return "—";
    const start = formatDateTime(stage.started_at);
    const end = formatDateTime(stage.ended_at);
    if (start === "—" && end === "—") return "—";
    return `${start} → ${end}`;
  };

  const formatTemp = (value?: number) => (value !== undefined ? `${value} °C` : "—");

  return (
    <div className="container py-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        {/* ✅ Back respects machine scope */}
        <Link to={backToCyclesHref} className="btn btn-link btn-sm">
          ← Back to cycles
        </Link>
      </div>

      {/* Header */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="d-flex align-items-center gap-2 mb-2">
            <h1 className="h4 mb-0">Cycle {cycle.cycle_number ? `#${cycle.cycle_number}` : ""}</h1>
            <span className={`badge ${badgeClass(validation)}`}>
              {validation === "PASS" ? "Cycle OK" : validation === "FAIL" ? "Cycle FAIL" : "Unknown"}
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
              <strong>Duration:</strong> {formatDurationSeconds(durationSeconds)}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card mb-3">
        <div className="card-body">
          <h2 className="h6 mb-3">Cycle telemetry</h2>

          <div style={{ height: 580 }}>
            {!hasAnyPoints ? (
              <div className="text-secondary">
                No telemetry plotted — telemetry points may be empty or not parseable.
              </div>
            ) : (
              <Line data={chartData} options={chartOptions as any} />
            )}
          </div>

          {/* Quick debug you can remove later */}
          <div className="text-secondary small mt-2">
            Debug: datasets={datasets.length} • points=
            {datasets.reduce((a: number, d: any) => a + (d.data?.length ?? 0), 0)}
            {" • xRange="}
            {new Date(xRange.min).toLocaleTimeString()} → {new Date(xRange.max).toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Params */}
      <div className="card">
        <div className="card-body">
          <h2 className="h6 mb-3">Wash Cycle Critical Parameters</h2>
          <table className="table table-sm mb-0">
            <tbody>
              <tr>
                <td>Pre Wash Start / End</td>
                <td className="text-end">{formatStartEnd(stages.pre_wash)}</td>
              </tr>
              <tr>
                <td>Pre Wash Temp</td>
                <td className="text-end">{formatTemp(stages.pre_wash?.temperature_c)}</td>
              </tr>

              <tr>
                <td>Wash Start / End</td>
                <td className="text-end">{formatStartEnd(stages.wash)}</td>
              </tr>
              <tr>
                <td>Wash Temp</td>
                <td className="text-end">{formatTemp(stages.wash?.temperature_c)}</td>
              </tr>

              <tr>
                <td>Rinse Start / End</td>
                <td className="text-end">{formatStartEnd(stages.rinse)}</td>
              </tr>
              <tr>
                <td>Rinse Temp</td>
                <td className="text-end">{formatTemp(stages.rinse?.temperature_c)}</td>
              </tr>

              <tr>
                <td>Disinfection Start / End</td>
                <td className="text-end">{formatStartEnd(stages.disinfection)}</td>
              </tr>
              <tr>
                <td>Disinfection Temp</td>
                <td className="text-end">{formatTemp(stages.disinfection?.temperature_c)}</td>
              </tr>

              <tr>
                <td>Drying Start / End</td>
                <td className="text-end">{formatStartEnd(stages.drying)}</td>
              </tr>
              <tr>
                <td>Drying Temp</td>
                <td className="text-end">{formatTemp(stages.drying?.temperature_c)}</td>
              </tr>

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