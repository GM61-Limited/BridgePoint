// src/pages/MachinesDashboard.tsx
import { useEffect, useMemo, useState } from "react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { listMachines, listWasherCycles, type Machine, type WasherCycle } from "../lib/api";

type ResultBucket = "PASS" | "FAIL" | "UNKNOWN";

function resultBucket(c: WasherCycle): ResultBucket {
  if (c.result === true) return "PASS";
  if (c.result === false) return "FAIL";
  return "UNKNOWN";
}

function startOfDayISO(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function formatPct(n: number) {
  return `${Math.round(n * 100)}%`;
}

const COLORS: Record<ResultBucket, string> = {
  PASS: "#198754", // bootstrap success
  FAIL: "#dc3545", // bootstrap danger
  UNKNOWN: "#6c757d", // bootstrap secondary
};

export default function MachinesDashboard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [machines, setMachines] = useState<Machine[]>([]);
  const [cycles, setCycles] = useState<WasherCycle[]>([]);

  // Date range (simple + useful). Default last 30 days.
  const [days, setDays] = useState<number>(30);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr("");
      try {
        const [m, c] = await Promise.all([listMachines(), listWasherCycles()]);
        if (!alive) return;
        setMachines(m);
        setCycles(c);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load dashboard data");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }, [days]);

  const cyclesInRange = useMemo(() => {
    return cycles.filter((c) => {
      if (!c.started_at) return false;
      const t = new Date(c.started_at).getTime();
      return t >= range.from.getTime() && t <= range.to.getTime();
    });
  }, [cycles, range]);

  // --- KPI calculations ---
  const kpis = useMemo(() => {
    const total = cyclesInRange.length;
    let pass = 0;
    let fail = 0;
    let unknown = 0;

    const activeMachineIds = new Set<number>();

    for (const c of cyclesInRange) {
      activeMachineIds.add(c.machine_id);
      const r = resultBucket(c);
      if (r === "PASS") pass++;
      else if (r === "FAIL") fail++;
      else unknown++;
    }

    const passRate = total ? pass / total : 0;

    return {
      total,
      pass,
      fail,
      unknown,
      passRate,
      activeMachines: activeMachineIds.size,
    };
  }, [cyclesInRange]);

  // --- Pie: result distribution ---
  const pieData = useMemo(
    () => [
      { name: "PASS", value: kpis.pass },
      { name: "FAIL", value: kpis.fail },
      { name: "UNKNOWN", value: kpis.unknown },
    ],
    [kpis]
  );

  // --- Bar: cycles per machine (top 10) ---
  const cyclesPerMachine = useMemo(() => {
    const map = new Map<number, { machineId: number; machineName: string; count: number }>();

    for (const c of cyclesInRange) {
      const existing = map.get(c.machine_id);
      if (existing) existing.count++;
      else map.set(c.machine_id, { machineId: c.machine_id, machineName: c.machine_name, count: 1 });
    }

    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [cyclesInRange]);

  // --- Line: cycles per day ---
  const cyclesPerDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cyclesInRange) {
      if (!c.started_at) continue;
      const dayKey = c.started_at.slice(0, 10); // YYYY-MM-DD
      map.set(dayKey, (map.get(dayKey) || 0) + 1);
    }

    // Ensure all days in range are present
    const out: { day: string; count: number }[] = [];
    const d = new Date(range.from);
    while (d <= range.to) {
      const key = startOfDayISO(d);
      out.push({ day: key, count: map.get(key) || 0 });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [cyclesInRange, range]);

  // --- Most common program ---
  const topProgram = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cyclesInRange) {
      const p = c.program_name || "—";
      map.set(p, (map.get(p) || 0) + 1);
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return { program: "—", count: 0 };
    return { program: sorted[0][0], count: sorted[0][1] };
  }, [cyclesInRange]);

  // --- Most active machine ---
  const topMachine = useMemo(() => {
    if (!cyclesPerMachine.length) return { machine: "—", count: 0 };
    return { machine: cyclesPerMachine[0].machineName, count: cyclesPerMachine[0].count };
  }, [cyclesPerMachine]);

  // --- Latest cycle per machine (table) ---
  const latestByMachine = useMemo(() => {
    // cycles are already ordered by started_at DESC from backend,
    // but we won't rely on that 100% — we'll compute.
    const map = new Map<number, WasherCycle>();
    for (const c of cyclesInRange) {
      const existing = map.get(c.machine_id);
      if (!existing) {
        map.set(c.machine_id, c);
      } else {
        const a = existing.started_at ? new Date(existing.started_at).getTime() : 0;
        const b = c.started_at ? new Date(c.started_at).getTime() : 0;
        if (b > a) map.set(c.machine_id, c);
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const at = a.started_at ? new Date(a.started_at).getTime() : 0;
      const bt = b.started_at ? new Date(b.started_at).getTime() : 0;
      return bt - at;
    });
  }, [cyclesInRange]);

  return (
    <div className="container py-4">
      <div className="d-flex align-items-start justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-1">Machines Dashboard</h1>
          <div className="text-secondary small">
            Overview of cycle activity across machines.
          </div>
        </div>

        <div className="d-flex gap-2 align-items-center">
          <label className="text-secondary small mb-0">Range</label>
          <select
            className="form-select form-select-sm"
            style={{ width: 140 }}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            disabled={loading}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {err && <div className="alert alert-danger py-2">{err}</div>}

      {/* KPI tiles */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-md-3">
          <div className="card border-secondary">
            <div className="card-body">
              <div className="text-secondary small">Total cycles</div>
              <div className="h4 mb-0">{loading ? "…" : kpis.total}</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-3">
          <div className="card border-secondary">
            <div className="card-body">
              <div className="text-secondary small">Pass rate</div>
              <div className="h4 mb-0">{loading ? "…" : formatPct(kpis.passRate)}</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-3">
          <div className="card border-secondary">
            <div className="card-body">
              <div className="text-secondary small">Fail cycles</div>
              <div className="h4 mb-0">{loading ? "…" : kpis.fail}</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-3">
          <div className="card border-secondary">
            <div className="card-body">
              <div className="text-secondary small">Active machines</div>
              <div className="h4 mb-0">{loading ? "…" : kpis.activeMachines}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary chips */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-lg-6">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <div className="text-secondary small mb-1">Most active machine</div>
              <div className="fw-semibold">{topMachine.machine}</div>
              <div className="text-secondary small">{topMachine.count} cycles in range</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <div className="text-secondary small mb-1">Most common program</div>
              <div className="fw-semibold">{topProgram.program}</div>
              <div className="text-secondary small">{topProgram.count} cycles in range</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-lg-4">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <div className="fw-semibold mb-2">Cycle results</div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={COLORS[entry.name as ResultBucket]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-8">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <div className="fw-semibold mb-2">Cycles per machine (Top 10)</div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={cyclesPerMachine}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="machineName" tick={{ fontSize: 12 }} interval={0} angle={-15} height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0d6efd" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Line chart */}
      <div className="card border-secondary mb-3">
        <div className="card-body">
          <div className="fw-semibold mb-2">Cycles over time</div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={cyclesPerDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#0d6efd" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Latest cycles table */}
      <div className="card border-secondary">
        <div className="card-body">
          <div className="fw-semibold mb-2">Latest cycle per machine</div>
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Cycle #</th>
                  <th>Program</th>
                  <th>Started</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {!loading && latestByMachine.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-secondary text-center py-4">
                      No cycles in this range.
                    </td>
                  </tr>
                )}

                {latestByMachine.map((c) => {
                  const r = resultBucket(c);
                  return (
                    <tr key={c.machine_id}>
                      <td>{c.machine_name}</td>
                      <td>{c.cycle_number ?? "—"}</td>
                      <td>{c.program_name ?? "—"}</td>
                      <td>{c.started_at ? new Date(c.started_at).toLocaleString() : "—"}</td>
                      <td>
                        <span
                          className={
                            r === "PASS"
                              ? "badge bg-success"
                              : r === "FAIL"
                              ? "badge bg-danger"
                              : "badge bg-secondary"
                          }
                        >
                          {r}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-secondary small mt-2">
            Machines loaded: {machines.length}. Cycles considered: {cyclesInRange.length}.
          </div>
        </div>
      </div>
    </div>
  );
}
