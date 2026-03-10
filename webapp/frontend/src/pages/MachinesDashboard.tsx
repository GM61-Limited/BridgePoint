import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

function fmtWhen(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

const COLORS: Record<ResultBucket, string> = {
  PASS: "#22c55e", // vivid green
  FAIL: "#ef4444", // vivid red
  UNKNOWN: "#94a3b8", // slate
};

const BRAND_BLUE = "#0d6efd"; // bootstrap primary
const FAIL_RED = "#ef4444";

function kpiCardClass(tone: "primary" | "success" | "danger" | "secondary") {
  if (tone === "success") return "border-success";
  if (tone === "danger") return "border-danger";
  if (tone === "primary") return "border-primary";
  return "border-secondary";
}

type MachineStackRow = {
  machineId: number;
  machineName: string;
  PASS: number;
  FAIL: number;
  UNKNOWN: number;
  total: number;
};

export default function MachinesDashboard() {
  const navigate = useNavigate();

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

  // Drilldown: machine -> WashCycles locked view
  function goToMachine(machineId: number, machineName?: string) {
    const q = new URLSearchParams();
    q.set("machineId", String(machineId));
    if (machineName) q.set("machine", machineName);
    navigate(`/wash-cycles?${q.toString()}`);
  }

  // --- KPI calculations ---
  const kpis = useMemo(() => {
    const total = cyclesInRange.length;
    let pass = 0;
    let fail = 0;
    let unknown = 0;

    const activeMachineIds = new Set<number>();
    const failMachineIds = new Set<number>();

    for (const c of cyclesInRange) {
      activeMachineIds.add(c.machine_id);
      const r = resultBucket(c);
      if (r === "PASS") pass++;
      else if (r === "FAIL") {
        fail++;
        failMachineIds.add(c.machine_id);
      } else unknown++;
    }

    const passRate = total ? pass / total : 0;
    const failRate = total ? fail / total : 0;

    const totalMachines = machines.length;
    const activeMachines = activeMachineIds.size;

    return {
      total,
      pass,
      fail,
      unknown,
      passRate,
      failRate,
      totalMachines,
      activeMachines,
      machinesWithFailures: failMachineIds.size,
    };
  }, [cyclesInRange, machines]);

  // --- Pie: result distribution ---
  const pieData = useMemo(
    () => [
      { name: "PASS", value: kpis.pass },
      { name: "FAIL", value: kpis.fail },
      { name: "UNKNOWN", value: kpis.unknown },
    ],
    [kpis]
  );

  // --- Bar: cycles per machine (top 10) as STACKED PASS/FAIL/UNKNOWN ---
  const cyclesPerMachineStacked: MachineStackRow[] = useMemo(() => {
    const map = new Map<number, MachineStackRow>();

    for (const c of cyclesInRange) {
      const r = resultBucket(c);
      const row = map.get(c.machine_id) || {
        machineId: c.machine_id,
        machineName: c.machine_name,
        PASS: 0,
        FAIL: 0,
        UNKNOWN: 0,
        total: 0,
      };
      row[r] += 1;
      row.total += 1;
      map.set(c.machine_id, row);
    }

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [cyclesInRange]);

  // --- Line: cycles per day WITH FAIL LINE ---
  const cyclesPerDay = useMemo(() => {
    const map = new Map<string, { total: number; fail: number }>();

    for (const c of cyclesInRange) {
      if (!c.started_at) continue;
      const dayKey = c.started_at.slice(0, 10);
      const cur = map.get(dayKey) || { total: 0, fail: 0 };
      cur.total += 1;
      if (c.result === false) cur.fail += 1;
      map.set(dayKey, cur);
    }

    // Ensure all days in range are present
    const out: { day: string; total: number; fail: number }[] = [];
    const d = new Date(range.from);
    while (d <= range.to) {
      const key = startOfDayISO(d);
      const cur = map.get(key) || { total: 0, fail: 0 };
      out.push({ day: key, total: cur.total, fail: cur.fail });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [cyclesInRange, range]);

  // --- Top programs (bar) ---
  const topPrograms = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cyclesInRange) {
      const p = (c.program_name || "—").trim() || "—";
      map.set(p, (map.get(p) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([program, count]) => ({ program, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [cyclesInRange]);

  // --- Most common program ---
  const topProgram = useMemo(() => {
    if (!topPrograms.length) return { program: "—", count: 0 };
    return { program: topPrograms[0].program, count: topPrograms[0].count };
  }, [topPrograms]);

  // --- Most active machine ---
  const topMachine = useMemo(() => {
    if (!cyclesPerMachineStacked.length) return { machine: "—", count: 0 };
    return { machine: cyclesPerMachineStacked[0].machineName, count: cyclesPerMachineStacked[0].total };
  }, [cyclesPerMachineStacked]);

  // --- Latest cycle per machine (table) ---
  const latestByMachine = useMemo(() => {
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

  // --- Needs attention panel (Option A: machine drilldown only) ---
  const attention = useMemo(() => {
    // Fail counts by machine + last fail time
    const failMap = new Map<number, { machineId: number; machineName: string; fails: number; lastFailAt: string | null }>();
    let latestFail: { machineId: number; machineName: string; started_at: string | null; program_name: string | null } | null = null;

    for (const c of cyclesInRange) {
      if (c.result !== false) continue;

      const cur = failMap.get(c.machine_id) || {
        machineId: c.machine_id,
        machineName: c.machine_name,
        fails: 0,
        lastFailAt: null as string | null,
      };

      cur.fails += 1;

      const t = c.started_at ? new Date(c.started_at).getTime() : 0;
      const existingT = cur.lastFailAt ? new Date(cur.lastFailAt).getTime() : 0;
      if (t > existingT) cur.lastFailAt = c.started_at ?? null;

      failMap.set(c.machine_id, cur);

      if (!latestFail) {
        latestFail = {
          machineId: c.machine_id,
          machineName: c.machine_name,
          started_at: c.started_at ?? null,
          program_name: c.program_name ?? null,
        };
      } else {
        const lt = latestFail.started_at ? new Date(latestFail.started_at).getTime() : 0;
        if (t > lt) {
          latestFail = {
            machineId: c.machine_id,
            machineName: c.machine_name,
            started_at: c.started_at ?? null,
            program_name: c.program_name ?? null,
          };
        }
      }
    }

    const failingMachines = Array.from(failMap.values()).sort((a, b) => b.fails - a.fails);
    const topFailing = failingMachines.slice(0, 5);

    // Idle machines (no cycles in range)
    const machinesWithAnyCycles = new Set<number>();
    for (const c of cyclesInRange) machinesWithAnyCycles.add(c.machine_id);

    const idle = machines
      .filter((m: any) => !machinesWithAnyCycles.has((m as any).id))
      .map((m: any) => ({
        machineId: (m as any).id as number,
        machineName: (m as any).machine_name ?? (m as any).machineName ?? `Machine #${(m as any).id}`,
      }));

    return {
      topFailing,
      latestFail,
      idleCount: idle.length,
      idleTop: idle.slice(0, 5),
      worstMachine: topFailing[0] ?? null,
    };
  }, [cyclesInRange, machines]);

  // Click handler for stacked chart
  function onMachineBarClick(payload: any) {
    const row = payload?.activePayload?.[0]?.payload as MachineStackRow | undefined;
    if (!row) return;
    goToMachine(row.machineId, row.machineName);
  }

  // Click handler for stacked legend help (optional)
  const drilldownHint = "Click a machine to drill into its cycles.";

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
          <div className={`card ${kpiCardClass("secondary")}`}>
            <div className="card-body">
              <div className="text-secondary small">Total cycles</div>
              <div className="h4 mb-0">{loading ? "…" : kpis.total}</div>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-3">
          <div className={`card ${kpiCardClass("success")}`}>
            <div className="card-body">
              <div className="text-secondary small">Pass rate</div>
              <div className="h4 mb-0">{loading ? "…" : formatPct(kpis.passRate)}</div>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-3">
          <div className={`card ${kpiCardClass("danger")}`}>
            <div className="card-body">
              <div className="text-secondary small">Fail cycles</div>
              <div className="h4 mb-0">{loading ? "…" : kpis.fail}</div>
              <div className="text-secondary small mt-1">
                Fail rate: {loading ? "…" : formatPct(kpis.failRate)}
              </div>
            </div>
          </div>
        </div>

        {/* Clickable KPI -> worst machine drilldown */}
        <div className="col-12 col-md-3">
          <div className={`card ${kpiCardClass("primary")}`}>
            <div className="card-body">
              <div className="d-flex align-items-start justify-content-between">
                <div>
                  <div className="text-secondary small">Machines with failures</div>
                  <div className="h4 mb-0">{loading ? "…" : kpis.machinesWithFailures}</div>
                  <div className="text-secondary small mt-1">
                    Active machines: {loading ? "…" : kpis.activeMachines} / {kpis.totalMachines}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  disabled={loading || kpis.machinesWithFailures === 0}
                  title={kpis.machinesWithFailures ? "Open worst machine cycles" : "No failures in range"}
                  onClick={() => {
                    if (attention.worstMachine) {
                      goToMachine(attention.worstMachine.machineId, attention.worstMachine.machineName);
                    }
                  }}
                >
                  View
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Needs attention + Summary chips */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-lg-6">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <div className="fw-semibold">
                  <i className="bi bi-exclamation-triangle me-2" aria-hidden="true" />
                  Needs attention
                </div>
                <span className="text-secondary small">{drilldownHint}</span>
              </div>

              {/* Top failing machines */}
              <div className="mb-3">
                <div className="text-secondary small mb-1">Top failing machines</div>
                {attention.topFailing.length === 0 ? (
                  <div className="text-secondary small">No failures in the selected range.</div>
                ) : (
                  <div className="list-group list-group-flush">
                    {attention.topFailing.map((m) => (
                      <button
                        key={m.machineId}
                        type="button"
                        className="list-group-item list-group-item-action bg-transparent d-flex align-items-center justify-content-between"
                        onClick={() => goToMachine(m.machineId, m.machineName)}
                      >
                        <span className="fw-semibold">{m.machineName}</span>
                        <span className="d-flex align-items-center gap-3">
                          <span className="badge bg-danger">{m.fails} FAIL</span>
                          <span className="text-secondary small">{fmtWhen(m.lastFailAt)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Latest failure */}
              <div className="mb-3">
                <div className="text-secondary small mb-1">Latest failure</div>
                {attention.latestFail ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => goToMachine(attention.latestFail!.machineId, attention.latestFail!.machineName)}
                  >
                    {attention.latestFail.machineName}
                    {attention.latestFail.program_name ? ` • ${attention.latestFail.program_name}` : ""}
                    {attention.latestFail.started_at ? ` • ${fmtWhen(attention.latestFail.started_at)}` : ""}
                  </button>
                ) : (
                  <div className="text-secondary small">—</div>
                )}
              </div>

              {/* Idle machines */}
              <div>
                <div className="text-secondary small mb-1">Idle machines (no cycles in range)</div>
                {attention.idleCount === 0 ? (
                  <div className="text-secondary small">None 🎉</div>
                ) : (
                  <>
                    <div className="d-flex align-items-center justify-content-between">
                      <div className="text-secondary small">
                        {attention.idleCount} machine(s) have no cycles in the selected range.
                      </div>
                    </div>

                    <div className="mt-2 d-flex flex-wrap gap-2">
                      {attention.idleTop.map((m) => (
                        <button
                          key={m.machineId}
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => goToMachine(m.machineId, m.machineName)}
                          title="Open cycles for machine"
                        >
                          {m.machineName}
                        </button>
                      ))}
                      {attention.idleCount > attention.idleTop.length ? (
                        <span className="text-secondary small align-self-center">
                          +{attention.idleCount - attention.idleTop.length} more
                        </span>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Summary chips */}
        <div className="col-12 col-lg-6">
          <div className="row g-3 h-100">
            <div className="col-12">
              <div className="card border-secondary h-100">
                <div className="card-body">
                  <div className="text-secondary small mb-1">Most active machine</div>
                  <div className="fw-semibold">{topMachine.machine}</div>
                  <div className="text-secondary small">{topMachine.count} cycles in range</div>
                </div>
              </div>
            </div>
            <div className="col-12">
              <div className="card border-secondary h-100">
                <div className="card-body">
                  <div className="text-secondary small mb-1">Most common program</div>
                  <div className="fw-semibold">{topProgram.program}</div>
                  <div className="text-secondary small">{topProgram.count} cycles in range</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="row g-3 mb-3">
        {/* Pie */}
        <div className="col-12 col-lg-4">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <div className="fw-semibold mb-2">Cycle results</div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={COLORS[entry.name as ResultBucket]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-secondary small mt-2">
                Tip: Use the stacked machine chart to drill down to specific machines.
              </div>
            </div>
          </div>
        </div>

        {/* Stacked per machine (clickable) */}
        <div className="col-12 col-lg-8">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <div className="fw-semibold mb-2">Cycles per machine (Top 10) — Pass/Fail breakdown</div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={cyclesPerMachineStacked}
                    onClick={(evt) => {
                      // evt has activePayload when clicking inside chart area
                      // we intentionally keep drilldown to machine only (Option A)
                      // @ts-ignore - recharts typing for activePayload can be loose
                      onMachineBarClick(evt);
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="machineName"
                      tick={{ fontSize: 12 }}
                      interval={0}
                      angle={-15}
                      height={60}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="PASS" stackId="a" fill={COLORS.PASS} cursor="pointer" />
                    <Bar dataKey="FAIL" stackId="a" fill={COLORS.FAIL} cursor="pointer" />
                    <Bar dataKey="UNKNOWN" stackId="a" fill={COLORS.UNKNOWN} cursor="pointer" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-secondary small mt-2">
                {drilldownHint} Machines with a red segment are producing failures.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trends + Programs */}
      <div className="row g-3 mb-3">
        {/* Line chart with Fail line */}
        <div className="col-12 col-lg-8">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <div className="fw-semibold mb-2">Cycles over time (Total vs Fail)</div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={cyclesPerDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="total" name="Total" stroke={BRAND_BLUE} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="fail" name="Fail" stroke={FAIL_RED} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="text-secondary small mt-2">
                Watch the red line: if failures rise while total stays flat, reliability is degrading.
              </div>
            </div>
          </div>
        </div>

        {/* Top programs */}
        <div className="col-12 col-lg-4">
          <div className="card border-secondary h-100">
            <div className="card-body">
              <div className="fw-semibold mb-2">Top wash programs</div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={topPrograms} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="program" width={110} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count">
                      {topPrograms.map((_, idx) => (
                        <Cell key={idx} fill={idx === 0 ? BRAND_BLUE : "#6ea8fe"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-secondary small mt-2">
                Program mix helps validate expected usage patterns and highlights anomalies.
              </div>
            </div>
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
                      <td>
                        <button
                          type="button"
                          className="btn btn-link p-0"
                          onClick={() => goToMachine(c.machine_id, c.machine_name)}
                          title="Open cycles for machine"
                        >
                          {c.machine_name}
                        </button>
                      </td>
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