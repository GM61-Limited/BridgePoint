import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    getWasherCycle,
    getWasherCycleTelemetry,
    type WasherCycle,
    type WasherTelemetryPoint,
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

export default function WashCycleDetails() {
  const { id } = useParams<{ id: string }>();
  const [cycle, setCycle] = useState<WasherCycle | null>(null);
  const [points, setPoints] = useState<WasherTelemetryPoint[]>([]);
  const [validation, setValidation] = useState<
    "PASS" | "FAIL" | "UNKNOWN"
  >("UNKNOWN");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    Promise.all([
      getWasherCycle(Number(id)),
      getWasherCycleTelemetry(Number(id)),
    ]).then(([cycleData, telemetry]) => {
      setCycle(cycleData);
      setPoints(telemetry.points);
      setValidation(telemetry.validation.result);
      setLoading(false);
    });
  }, [id]);

  if (!cycle || loading) {
    return <div className="container py-4">Loading…</div>;
  }

  /* --------------------------------------------------
     Helpers for critical params
  -------------------------------------------------- */

  const stages = cycle.extra?.stages ?? {};

  const formatDateTime = (value?: string) =>
    value ? new Date(value).toLocaleString() : "—";

  const formatTemp = (value?: number) =>
    value !== undefined ? `${value} °C` : "—";

  const formatStartEnd = (stage?: any) => {
    if (!stage) return "—";
    const start = formatDateTime(stage.started_at);
    const end = formatDateTime(stage.ended_at);
    if (start === "—" && end === "—") return "—";
    return `${start} → ${end}`;
  };

  /* --------------------------------------------------
     Telemetry chart
  -------------------------------------------------- */

  const labels = points.map((p) =>
    new Date(p.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  );

  const chartData = {
    labels,
    datasets: [
      {
        label: "Temperature (°C)",
        data: points.map((p) => p.temperature),
        borderColor: "#ff8c00",
        yAxisID: "yTemp",
        stepped: true,
        pointRadius: 0,
      },
      {
        label: "A0",
        data: points.map((p) => p.a0),
        borderColor: "#0d6efd",
        yAxisID: "yA0",
        stepped: true,
        pointRadius: 0,
      },
      {
        label: "Conductivity (µS/cm)",
        data: points.map((p) => p.conductivity),
        borderColor: "#6f42c1",
        yAxisID: "yCond",
        stepped: true,
        pointRadius: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    interaction: { mode: "index" as const, intersect: false },
    scales: {
      x: {
        title: { display: true, text: "Time" },
      },
      yTemp: {
        min: 0,
        max: 120,
        position: "left" as const,
        title: { display: true, text: "Temperature (°C)" },
      },
      yA0: {
        min: 0,
        max: 1800,
        position: "right" as const,
        grid: { drawOnChartArea: false },
        title: { display: true, text: "A0" },
      },
      yCond: {
        min: 0,
        max: 900,
        position: "right" as const,
        grid: { drawOnChartArea: false },
        title: { display: true, text: "Conductivity (µS/cm)" },
      },
    },
  };

  return (
    <div className="container py-4">
      <Link to="/wash-cycles" className="btn btn-link btn-sm mb-3">
        ← Back to cycles
      </Link>

      <h1 className="h4">
        Cycle {cycle.cycle_number ? `#${cycle.cycle_number}` : ""}
      </h1>

      {/* ===============================
          Cycle Summary
         =============================== */}
      <dl className="row mt-3">
        <dt className="col-sm-3">Machine</dt>
        <dd className="col-sm-9">{cycle.machine_name}</dd>

        <dt className="col-sm-3">Program</dt>
        <dd className="col-sm-9">{cycle.program_name ?? "—"}</dd>

        <dt className="col-sm-3">Started</dt>
        <dd className="col-sm-9">
          {formatDateTime(cycle.started_at)}
        </dd>

        <dt className="col-sm-3">Result</dt>
        <dd
          className={`col-sm-9 fw-bold ${
            validation === "PASS"
              ? "text-success"
              : validation === "FAIL"
              ? "text-danger"
              : "text-secondary"
          }`}
        >
          {validation}
        </dd>
      </dl>

      {/* ===============================
          Critical Parameters
         =============================== */}
      <div className="card mt-4">
        <div className="card-body">
          <h2 className="h6 mb-3">Wash Cycle Critical Parameters</h2>

          <table className="table table-sm mb-0">
            <tbody>
              <tr>
                <td>Pre Wash Start / End time</td>
                <td className="text-end">
                  {formatStartEnd(stages.pre_wash)}
                </td>
              </tr>
              <tr>
                <td>Pre Wash Temp</td>
                <td className="text-end">
                  {formatTemp(stages.pre_wash?.temperature_c)}
                </td>
              </tr>

              <tr>
                <td>Wash Start / End time</td>
                <td className="text-end">
                  {formatStartEnd(stages.wash)}
                </td>
              </tr>
              <tr>
                <td>Wash Temp</td>
                <td className="text-end">
                  {formatTemp(stages.wash?.temperature_c)}
                </td>
              </tr>

              <tr>
                <td>Rinse Start / End time</td>
                <td className="text-end">
                  {formatStartEnd(stages.rinse)}
                </td>
              </tr>
              <tr>
                <td>Rinse Temp</td>
                <td className="text-end">
                  {formatTemp(stages.rinse?.temperature_c)}
                </td>
              </tr>

              <tr>
                <td>Disinfection Start / End time</td>
                <td className="text-end">
                  {formatStartEnd(stages.disinfection)}
                </td>
              </tr>
              <tr>
                <td>Disinfection Temp</td>
                <td className="text-end">
                  {formatTemp(stages.disinfection?.temperature_c)}
                </td>
              </tr>

              <tr>
                <td>Drying Start / End time</td>
                <td className="text-end">
                  {formatStartEnd(stages.drying)}
                </td>
              </tr>
              <tr>
                <td>Drying Temp</td>
                <td className="text-end">
                  {formatTemp(stages.drying?.temperature_c)}
                </td>
              </tr>

              <tr>
                <td>Pass / Fail</td>
                <td className="text-end fw-bold">
                  {validation}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ===============================
          Telemetry Chart
         =============================== */}
      <div className="card mt-4">
        <div className="card-body">
          <h2 className="h6 mb-3">Cycle telemetry</h2>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}