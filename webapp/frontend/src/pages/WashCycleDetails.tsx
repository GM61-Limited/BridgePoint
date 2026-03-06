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

      <dl className="row mt-3">
        <dt className="col-sm-3">Machine</dt>
        <dd className="col-sm-9">{cycle.machine_name}</dd>

        <dt className="col-sm-3">Program</dt>
        <dd className="col-sm-9">{cycle.program_name ?? "—"}</dd>

        <dt className="col-sm-3">Started</dt>
        <dd className="col-sm-9">
          {new Date(cycle.started_at).toLocaleString()}
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

      <div className="card mt-4">
        <div className="card-body">
          <h2 className="h6 mb-3">Cycle telemetry</h2>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}