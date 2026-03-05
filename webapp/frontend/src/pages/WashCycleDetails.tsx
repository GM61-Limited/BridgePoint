import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getWasherCycle, type WasherCycle } from "../lib/api";

export default function WashCycleDetails() {
  const { id } = useParams<{ id: string }>();
  const [cycle, setCycle] = useState<WasherCycle | null>(null);

  useEffect(() => {
    if (!id) return;
    getWasherCycle(Number(id)).then(setCycle);
  }, [id]);

  if (!cycle) {
    return <div className="container py-4">Loading…</div>;
  }

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

        <dt className="col-sm-3">Source file</dt>
        <dd className="col-sm-9">{cycle.original_filename ?? "—"}</dd>

        <dt className="col-sm-3">Status</dt>
        <dd className="col-sm-9 text-secondary">
          Parsed (telemetry pending)
        </dd>
      </dl>
    </div>
  );
}