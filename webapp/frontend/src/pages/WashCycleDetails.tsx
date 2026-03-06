import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  series: [number, number][]; // [timestamp_ms, value]
};

/* --------------------------------------------------
   Sensor colours
-------------------------------------------------- */

const SENSOR_COLOURS: Record<string, string> = {
  temperature_1: "#e63946",
  temperature_2: "#f4a261",
  pressure: "#2a9d8f",
  conductivity: "#6f42c1",
  a0: "#0d6efd",
};

export default function WashCycleDetails() {
  const { id } = useParams<{ id: string }>();

  const [cycle, setCycle] = useState<WasherCycle | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySeries[]>([]);
  const [validation, setValidation] = useState<
    "PASS" | "FAIL" | "UNKNOWN"
  >("UNKNOWN");
  const [loading, setLoading] = useState(true);

  /* --------------------------------------------------
     Load data
  -------------------------------------------------- */

  useEffect(() => {
    if (!id) return;

    Promise.all([
      getWasherCycle(Number(id)),
      getWasherCycleTelemetry(Number(id)),
    ]).then(([cycleData, telemetryData]) => {
      setCycle(cycleData);
      setTelemetry(telemetryData.points ?? []);
      setValidation(telemetryData.validation?.result ?? "UNKNOWN");
      setLoading(false);
    });
  }, [id]);

  if (!cycle || loading) {
    return <div className="container py-4">Loading…</div>;
  }

  /* --------------------------------------------------
     Helpers
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

  const datasets = telemetry.map((s) => ({
    label: `${s.sensor} (${s.unit})`,
    data: s.series.map(([ts, value]) => ({
      x: ts,
      y: value,
    })),
    borderColor: SENSOR_COLOURS[s.sensor] ?? "#999",
    backgroundColor: SENSOR_COLOURS[s.sensor] ?? "#999",
    stepped: true,
    pointRadius: 0,
    borderWidth: 2,
  }));

  const chartData = { datasets };

  const chartOptions = {
  responsive: true,
  interaction: { mode: "index" as const, intersect: false },
  scales: {
    x: {
      type: "linear" as const,
      title: { display: true, text: "Time" },
      ticks: {
        callback: (value: string | number) => {
          if (typeof value === "number") {
            return new Date(value).toLocaleTimeString();
          }
          return value;
        },
      },
    },
    y: {
      beginAtZero: true,
      title: { display: true, text: "Value" },
    },
  },
  plugins: {
    legend: { position: "bottom" as const },
  },
};

  return (
    <div className="container py-4">
      <Link to="/wash-cycles" className="btn btn-link btn-sm mb-3">
        ← Back to cycles
      </Link>

      <h1 className="h4 mb-3">
        Cycle {cycle.cycle_number ? `#${cycle.cycle_number}` : ""}
      </h1>

      {/* ===============================
          Cycle Summary (2-column grid)
         =============================== */}
      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h6 mb-3">Cycle Details</h2>
              <dl className="row mb-0">
                <dt className="col-5">Machine</dt>
                <dd className="col-7">{cycle.machine_name}</dd>

                <dt className="col-5">Program</dt>
                <dd className="col-7">
                  {cycle.program_name ?? "—"}
                </dd>

                <dt className="col-5">Started</dt>
                <dd className="col-7">
                  {formatDateTime(cycle.started_at)}
                </dd>

                <dt className="col-5">Result</dt>
                <dd
                  className={`col-7 fw-bold ${
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
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h6 mb-3">
                Wash Cycle Critical Parameters
              </h2>

              <table className="table table-sm mb-0">
                <tbody>
                  <tr>
                    <td>Pre Wash Start / End</td>
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
                    <td>Wash Start / End</td>
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
                    <td>Rinse Start / End</td>
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
                    <td>Disinfection Start / End</td>
                    <td className="text-end">
                      {formatStartEnd(stages.disinfection)}
                    </td>
                  </tr>
                  <tr>
                    <td>Disinfection Temp</td>
                    <td className="text-end">
                      {formatTemp(
                        stages.disinfection?.temperature_c
                      )}
                    </td>
                  </tr>

                  <tr>
                    <td>Drying Start / End</td>
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
        </div>
      </div>

      {/* ===============================
          Telemetry Chart
         =============================== */}
      <div className="card">
        <div className="card-body">
          <h2 className="h6 mb-3">Cycle telemetry</h2>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}