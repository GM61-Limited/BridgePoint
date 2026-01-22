
// src/pages/pipelines.tsx
import { useEffect, useMemo, useState } from "react";

/* =========================================================================
   Types
   ========================================================================= */

type TriggerType = "manual" | "http_webhook" | "schedule";
type StepType = "connector_action" | "transform" | "http_request";

type PipelineStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

type PipelineDefinition = {
  triggers: Array<{
    type: TriggerType;
    path?: string;   // http_webhook
    auth?: string;   // http_webhook (e.g., token:X)
    cron?: string;   // schedule
  }>;
  steps: PipelineStep[];
};

type Pipeline = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  latestVersion?: number;
  definition: PipelineDefinition;
};

type PipelineStep = {
  id: string;
  name: string;
  type: StepType;

  // connector_action
  connectorId?: string;  // e.g., "api-assure", "api-tdoc", "db-pg" — aligns with connectors.tsx seed
  action?: string;       // e.g., "get_cycle", "create_sample"
  params?: Record<string, any>; // support templates in values

  // transform (simple mapping with templates)
  mapping?: Record<string, any>;

  // http_request
  method?: "GET" | "POST";
  url?: string;
  headers?: Record<string, any>;
  body?: Record<string, any>;
};

type StepRun = {
  stepId: string;
  name: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  input?: any;
  output?: any;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
};

type ConnectorSummary = {
  id: string;     // matches AnyConnector.id from connectors.tsx
  name: string;
  provider?: string;
  category?: "api" | "database";
};

/* =========================================================================
   Helpers
   ========================================================================= */

const nowIso = () => new Date().toISOString();
const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

/** Resolve "steps.fetch.output.id" safely without eval */
function getByPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

/** Resolve templates like "Hello {{ trigger.body.orderId }}" anywhere in an object */
function resolveTemplates(input: any, ctx: any): any {
  if (typeof input === "string") {
    const re = /{{\s*([^}]+)\s*}}/g;
    return input.replace(re, (_, p1) => {
      const val = getByPath(ctx, p1.trim());
      return val == null ? "" : String(val);
    });
  }
  if (Array.isArray(input)) return input.map(v => resolveTemplates(v, ctx));
  if (input && typeof input === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) out[k] = resolveTemplates(v, ctx);
    return out;
  }
  return input;
}

/* =========================================================================
   Mock API (aligned with connectors.tsx IDs)
   ========================================================================= */

const USE_MOCK = true;

// If you want to populate from live connectors API later:
// - GET /api/connectors -> reduce to {id, name, provider, category}
const mockConnectors: ConnectorSummary[] = [
  { id: "api-assure", name: "Assure", provider: "Assure", category: "api" },
  { id: "api-tdoc", name: "T-DOC", provider: "TDOC", category: "api" },
  { id: "db-pg", name: "PostgreSQL", provider: "PostgreSQL", category: "database" },
];

const mockPipelines: Pipeline[] = [
  {
    id: "pl-001",
    name: "Assure Cycle → Transform → T-DOC Sample",
    description: "Fetch a cycle from Assure, transform, then create sample in T-DOC",
    enabled: true,
    latestVersion: 1,
    definition: {
      triggers: [{ type: "manual" }],
      steps: [
        {
          id: "fetch_cycle",
          name: "Fetch cycle from Assure",
          type: "connector_action",
          connectorId: "api-assure",
          action: "get_cycle",
          params: { cycleId: "{{ trigger.body.cycleId }}" }
        },
        {
          id: "transform",
          name: "Transform payload",
          type: "transform",
          mapping: {
            cycleRef: "{{ steps.fetch_cycle.output.cycle.id }}",
            trayCount: "{{ steps.fetch_cycle.output.cycle.trays.length }}",
            timestamp: "{{ steps.fetch_cycle.output.cycle.completedAt }}"
          }
        },
        {
          id: "create_sample",
          name: "Create sample in T-DOC",
          type: "connector_action",
          connectorId: "api-tdoc",
          action: "create_sample",
          params: {
            ref: "{{ steps.transform.output.cycleRef }}",
            count: "{{ steps.transform.output.trayCount }}",
            completedAt: "{{ steps.transform.output.timestamp }}"
          }
        }
      ]
    }
  },
  {
    id: "pl-002",
    name: "Manual → HTTP POST → Transform",
    description: "Demonstrate HTTP request with templated body, then map fields",
    enabled: true,
    latestVersion: 1,
    definition: {
      triggers: [{ type: "manual" }],
      steps: [
        {
          id: "post_echo",
          name: "POST echo to demo endpoint",
          type: "http_request",
          method: "POST",
          url: "https://example.local/api/echo",
          headers: { "X-BridgePoint": "PipelineDemo" },
          body: { orderId: "{{ trigger.body.orderId }}", source: "pipelines-ui" }
        },
        {
          id: "map",
          name: "Map response",
          type: "transform",
          mapping: {
            echoedOrder: "{{ steps.post_echo.output.body.orderId }}",
            note: "OK"
          }
        }
      ]
    }
  }
];

async function apiFetchConnectors(): Promise<ConnectorSummary[]> {
  if (USE_MOCK) return new Promise(res => setTimeout(() => res(mockConnectors), 200));
  const res = await fetch("/api/connectors", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed connectors: ${res.status}`);
  // reduce server response to {id, name, provider?, category?}
  const full = await res.json();
  return (full as any[]).map(x => ({
    id: x.id,
    name: x.name,
    provider: x.vendor || x.provider,
    category: x.category || (x.type ? "api" : "database")
  }));
}

async function apiFetchPipelines(): Promise<Pipeline[]> {
  if (USE_MOCK) return new Promise(res => setTimeout(() => res(mockPipelines), 250));
  const res = await fetch("/api/pipelines", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed pipelines: ${res.status}`);
  return res.json();
}

async function apiSavePipeline(p: Pipeline): Promise<Pipeline> {
  if (USE_MOCK) return new Promise(res => setTimeout(() => res({ ...p, id: p.id || `pl-${Date.now()}` }), 250));
  const method = p.id ? "PUT" : "POST";
  const res = await fetch("/api/pipelines", {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  if (!res.ok) throw new Error(`Failed save: ${res.status}`);
  return res.json();
}

/* =========================================================================
   Simulated Step Executors (client-side demo)
   In real app, these live on the server and use secure secrets.
   ========================================================================= */

async function execConnectorAction(
  connectorId: string | undefined,
  action: string | undefined,
  params: Record<string, any>
): Promise<any> {
  await new Promise(r => setTimeout(r, 500)); // simulate latency

  // Assure demo
  if (connectorId === "api-assure" && action === "get_cycle") {
    const cycleId = params.cycleId || "CYCLE-0000";
    return {
      cycle: {
        id: cycleId,
        trays: [{ id: "T001" }, { id: "T002" }, { id: "T003" }],
        completedAt: nowIso(),
        meta: { source: "Assure", quality: "OK" }
      }
    };
  }

  // T-DOC demo
  if (connectorId === "api-tdoc" && action === "create_sample") {
    return {
      sampleId: `TDOC-${Math.floor(Math.random() * 10000)}`,
      ref: params.ref,
      count: Number(params.count ?? 0),
      completedAt: params.completedAt
    };
  }

  // PostgreSQL example (non-network; just echo)
  if (connectorId === "db-pg") {
    return { ok: true, connector: "db-pg", action, params };
  }

  return { ok: true, connectorId, action, params };
}

async function execHttpRequest(step: PipelineStep): Promise<any> {
  await new Promise(r => setTimeout(r, 400));
  // ECHO: mimic a service response (does not call real network)
  return {
    status: 200,
    url: step.url,
    method: step.method,
    headers: step.headers,
    body: step.body,
    response: { ok: true }
  };
}

/** Run the pipeline definition with a given trigger payload (client-side demo) */
async function runPipelineClient(
  def: PipelineDefinition,
  triggerPayload: any
): Promise<{ runs: StepRun[]; status: PipelineStatus; outputs: any }> {
  const runs: StepRun[] = [];
  const ctx: any = { trigger: { body: triggerPayload }, steps: {} };

  for (const step of def.steps) {
    const sr: StepRun = {
      stepId: step.id,
      name: step.name,
      status: "running",
      startedAt: nowIso(),
    };

    try {
      // Resolve templates with current context
      const params = resolveTemplates(step.params || {}, ctx);
      const mapping = resolveTemplates(step.mapping || {}, ctx);
      const headers = resolveTemplates(step.headers || {}, ctx);
      const body = resolveTemplates(step.body || {}, ctx);

      sr.input = { params, mapping, headers, body };

      let output: any = null;
      if (step.type === "connector_action") {
        output = await execConnectorAction(step.connectorId, step.action, params);
      } else if (step.type === "transform") {
        output = mapping; // mapping already resolved
      } else if (step.type === "http_request") {
        output = await execHttpRequest({ ...step, headers, body });
      }

      sr.output = output;
      sr.status = "succeeded";
      sr.finishedAt = nowIso();
      runs.push(sr);

      // Expose step output to downstream steps
      ctx.steps[step.id] = { output };
    } catch (e: any) {
      sr.status = "failed";
      sr.error = e?.message || String(e);
      sr.finishedAt = nowIso();
      runs.push(sr);
      return { runs, status: "failed", outputs: null };
    }
  }

  const lastStepId = def.steps[def.steps.length - 1]?.id;
  const outputs = lastStepId ? ctx.steps[lastStepId]?.output : null;
  return { runs, status: "succeeded", outputs };
}

/* =========================================================================
   UI Components (Bootstrap-theme-aware)
   ========================================================================= */

function StatusChip({ text, tone }: { text: string; tone: "ok" | "warn" | "bad" | "muted" }) {
  const map = {
    ok: { icon: "bi-check-circle", className: "text-success" },
    warn: { icon: "bi-hourglass-split", className: "text-warning" },
    bad: { icon: "bi-exclamation-triangle", className: "text-danger" },
    muted: { icon: "bi-dot", className: "text-muted" },
  }[tone];
  return (
    <span className={`small d-inline-flex align-items-center gap-1 ${map.className}`}>
      <i className={`bi ${map.icon}`} /> {text}
    </span>
  );
}

function JsonEditor({
  value,
  onChange,
  placeholder,
  rows = 6,
}: {
  value: Record<string, any>;
  onChange: (obj: Record<string, any>) => void;
  placeholder?: Record<string, any>;
  rows?: number;
}) {
  const [text, setText] = useState<string>(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value ?? {}, null, 2));
  }, [value]);

  function apply() {
    try {
      const obj = text.trim() ? JSON.parse(text) : {};
      setError(null);
      onChange(obj);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="border rounded p-2">
      <textarea
        className={`form-control ${error ? "is-invalid" : ""}`}
        rows={rows}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder ? JSON.stringify(placeholder, null, 2) : "{}"}
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace" }}
      />
      <div className="d-flex align-items-center gap-2 mt-2">
        <button className="btn btn-sm btn-outline-primary" onClick={apply}>
          Apply
        </button>
        {error && <div className="invalid-feedback d-block">Invalid JSON: {error}</div>}
        {!error && <div className="text-muted small">Templates supported: <code>{"{{ path.to.value }}"}</code></div>}
      </div>
    </div>
  );
}

function StepCard({
  step,
  connectors,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  step: PipelineStep;
  connectors: ConnectorSummary[];
  onChange: (s: PipelineStep) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const isConn = step.type === "connector_action";
  const isTransform = step.type === "transform";
  const isHttp = step.type === "http_request";

  return (
    <div className="border rounded p-3 mb-3" style={{ backgroundColor: "var(--bs-body-bg)" }}>
      <div className="d-flex align-items-center gap-2 mb-2">
        <input
          className="form-control form-control-sm"
          value={step.name}
          onChange={e => onChange({ ...step, name: e.target.value })}
          placeholder="Step name"
          style={{ maxWidth: 360 }}
        />
        <div className="ms-auto btn-group btn-group-sm">
          <button className="btn btn-outline-secondary" onClick={onMoveUp} title="Move up">▲</button>
          <button className="btn btn-outline-secondary" onClick={onMoveDown} title="Move down">▼</button>
          <button className="btn btn-outline-danger" onClick={onDelete} title="Delete">✕</button>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-4">
          <label className="form-label">Type</label>
          <select
            className="form-select form-select-sm"
            value={step.type}
            onChange={e => {
              const t = e.target.value as StepType;
              const base: PipelineStep = { ...step, type: t };
              if (t === "connector_action") {
                onChange({ ...base, connectorId: connectors[0]?.id, action: "", params: {} });
              } else if (t === "transform") {
                onChange({ ...base, mapping: {} });
              } else if (t === "http_request") {
                onChange({ ...base, method: "POST", url: "", headers: {}, body: {} });
              } else {
                onChange(base);
              }
            }}
          >
            <option value="connector_action">Connector action</option>
            <option value="transform">Transform</option>
            <option value="http_request">HTTP request</option>
          </select>
        </div>

        {isConn && (
          <>
            <div className="col-md-4">
              <label className="form-label">Connector</label>
              <select
                className="form-select form-select-sm"
                value={step.connectorId || ""}
                onChange={e => onChange({ ...step, connectorId: e.target.value })}
              >
                {connectors.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.provider ? `(${c.provider})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Action</label>
              <input
                className="form-control form-control-sm"
                value={step.action || ""}
                onChange={e => onChange({ ...step, action: e.target.value })}
                placeholder="e.g., get_cycle, create_sample"
              />
            </div>
            <div className="col-12">
              <label className="form-label">Params (JSON; templates OK)</label>
              <JsonEditor
                value={step.params || {}}
                onChange={obj => onChange({ ...step, params: obj })}
                placeholder={{ cycleId: "{{ trigger.body.cycleId }}" }}
              />
            </div>
          </>
        )}

        {isTransform && (
          <div className="col-12">
            <label className="form-label">Mapping (output JSON; templates OK)</label>
            <JsonEditor
              value={step.mapping || {}}
              onChange={obj => onChange({ ...step, mapping: obj })}
              placeholder={{ cycleRef: "{{ steps.fetch_cycle.output.cycle.id }}" }}
            />
          </div>
        )}

        {isHttp && (
          <>
            <div className="col-md-3">
              <label className="form-label">Method</label>
              <select
                className="form-select form-select-sm"
                value={step.method || "POST"}
                onChange={e => onChange({ ...step, method: e.target.value as "GET" | "POST" })}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
            <div className="col-md-9">
              <label className="form-label">URL</label>
              <input
                className="form-control form-control-sm"
                value={step.url || ""}
                onChange={e => onChange({ ...step, url: e.target.value })}
                placeholder="https://service.local/api"
              />
            </div>
            <div className="col-12">
              <label className="form-label">Headers (JSON; templates OK)</label>
              <JsonEditor value={step.headers || {}} onChange={obj => onChange({ ...step, headers: obj })} />
            </div>
            <div className="col-12">
              <label className="form-label">Body (JSON; templates OK)</label>
              <JsonEditor value={step.body || {}} onChange={obj => onChange({ ...step, body: obj })} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   Page
   ========================================================================= */
export default function Pipelines() {
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selected, setSelected] = useState<Pipeline | null>(null);

  // Editor state
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [enabled, setEnabled] = useState<boolean>(true);
  const [triggers, setTriggers] = useState<PipelineDefinition["triggers"]>([{ type: "manual" }]);
  const [steps, setSteps] = useState<PipelineStep[]>([]);

  // Run demo state
  const [payloadText, setPayloadText] = useState<string>('{"cycleId":"CYCLE-1234","orderId":"ORD-1001"}');
  const [running, setRunning] = useState<boolean>(false);
  const [runStatus, setRunStatus] = useState<PipelineStatus | undefined>();
  const [stepRuns, setStepRuns] = useState<StepRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [conns, pls] = await Promise.all([apiFetchConnectors(), apiFetchPipelines()]);
        setConnectors(conns);
        setPipelines(pls);
        const first = pls[0] || null;
        selectPipeline(first);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  function resetEditor() {
    setName("");
    setDescription("");
    setEnabled(true);
    setTriggers([{ type: "manual" }]);
    setSteps([]);
  }

  function selectPipeline(p: Pipeline | null) {
    setSelected(p);
    if (!p) {
      resetEditor();
      return;
    }
    setName(p.name);
    setDescription(p.description || "");
    setEnabled(p.enabled);
    setTriggers(p.definition.triggers);
    setSteps(p.definition.steps);
  }

  function addStep() {
    const id = `step_${Math.random().toString(36).slice(2, 8)}`;
    setSteps(prev => [
      ...prev,
      { id, name: "New step", type: "connector_action", connectorId: connectors[0]?.id, action: "", params: {} },
    ]);
  }

  function updateStep(index: number, updated: PipelineStep) {
    setSteps(prev => prev.map((s, i) => (i === index ? updated : s)));
  }

  function deleteStep(index: number) {
    setSteps(prev => prev.filter((_, i) => i !== index));
  }

  function moveStepUp(index: number) {
    if (index === 0) return;
    setSteps(prev => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr;
    });
  }

  function moveStepDown(index: number) {
    if (index === steps.length - 1) return;
    setSteps(prev => {
      const arr = [...prev];
      [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
      return arr;
    });
  }

  async function savePipeline() {
    try {
      const draft: Pipeline = {
        id: selected?.id || "",
        name: name || "Untitled pipeline",
        description,
        enabled,
        definition: { triggers, steps },
      };
      const saved = await apiSavePipeline(draft);
      setPipelines(prev => {
        const idx = prev.findIndex(x => x.id === saved.id);
        if (idx >= 0) {
          const arr = [...prev];
          arr[idx] = saved;
          return arr;
        }
        return [saved, ...prev];
      });
      setSelected(saved);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function runNow() {
    setRunning(true);
    setRunStatus(undefined);
    setStepRuns([]);
    try {
      const payload = payloadText.trim() ? JSON.parse(payloadText) : {};
      const def: PipelineDefinition = { triggers, steps };
      const res = await runPipelineClient(def, payload);
      setStepRuns(res.runs);
      setRunStatus(res.status);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const filtered = useMemo(() => pipelines, [pipelines]);

  const triggersUI = useMemo(
    () => (
      <div className="row g-3">
        {(triggers || []).map((t, idx) => (
          <div key={idx} className="col-12">
            <div className="border rounded p-3">
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label">Type</label>
                  <select
                    className="form-select form-select-sm"
                    value={t.type}
                    onChange={e => {
                      const type = e.target.value as TriggerType;
                      const updated = { ...t, type };
                      if (type === "http_webhook") updated.path = updated.path || "/pipelines/new-order";
                      if (type === "schedule") updated.cron = updated.cron || "*/5 * * * *";
                      const arr = [...triggers];
                      arr[idx] = updated;
                      setTriggers(arr);
                    }}
                  >
                    <option value="manual">Manual</option>
                    <option value="http_webhook">HTTP webhook</option>
                    <option value="schedule">Schedule</option>
                  </select>
                </div>

                {t.type === "http_webhook" && (
                  <>
                    <div className="col-md-4">
                      <label className="form-label">Path</label>
                      <input
                        className="form-control form-control-sm"
                        value={t.path || ""}
                        onChange={e => {
                          const arr = [...triggers];
                          arr[idx] = { ...t, path: e.target.value };
                          setTriggers(arr);
                        }}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Auth (e.g., token:X)</label>
                      <input
                        className="form-control form-control-sm"
                        value={t.auth || ""}
                        onChange={e => {
                          const arr = [...triggers];
                          arr[idx] = { ...t, auth: e.target.value };
                          setTriggers(arr);
                        }}
                      />
                    </div>
                  </>
                )}

                {t.type === "schedule" && (
                  <div className="col-md-6">
                    <label className="form-label">CRON</label>
                    <input
                      className="form-control form-control-sm"
                      value={t.cron || ""}
                      onChange={e => {
                        const arr = [...triggers];
                        arr[idx] = { ...t, cron: e.target.value };
                        setTriggers(arr);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        <div className="col-12">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setTriggers(prev => [...prev, { type: "manual" }])}>
            + Add trigger
          </button>
        </div>
      </div>
    ),
    [triggers]
  );

  return (
    <div className="container-xxl py-3">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">Pipelines</h2>
        <div className="text-muted small">Demo run: {fmtTime(nowIso())}</div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <i className="bi bi-exclamation-triangle" /> Error: {error}
        </div>
      )}

      <div className="row g-3">
        {/* Sidebar: pipeline list */}
        <div className="col-12 col-lg-3">
          <div className="card">
            <div className="card-header d-flex align-items-center justify-content-between">
              <strong>Workflows</strong>
              <button className="btn btn-sm btn-outline-primary" onClick={() => selectPipeline(null)}>
                + New
              </button>
            </div>
            <div className="list-group list-group-flush">
              {filtered.map(p => (
                <button
                  key={p.id}
                  className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between ${selected?.id === p.id ? "active" : ""}`}
                  onClick={() => selectPipeline(p)}
                  style={{ cursor: "pointer" }}
                >
                  <div>
                    <div className="fw-semibold">{p.name}</div>
                    <div className="small text-muted">{p.description}</div>
                  </div>
                  <StatusChip text={p.enabled ? "Enabled" : "Disabled"} tone={p.enabled ? "ok" : "muted"} />
                </button>
              ))}
              {filtered.length === 0 && <div className="list-group-item text-muted">No pipelines yet.</div>}
            </div>
          </div>
        </div>

        {/* Main: designer */}
        <div className="col-12 col-lg-9">
          <div className="card mb-3">
            <div className="card-header d-flex align-items-center gap-2">
              <i className="bi bi-diagram-3" /> <strong>Designer</strong>
              <span className="text-muted small ms-auto">Use templates like <code>{"{{ trigger.body.cycleId }}"}</code> or <code>{"{{ steps.fetch_cycle.output.cycle.id }}"}</code>.</span>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">Name</label>
                  <input className="form-control" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="col-md-6 d-flex align-items-end">
                  <div className="form-check form-switch">
                    <input id="pl-enabled" className="form-check-input" type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                    <label htmlFor="pl-enabled" className="form-check-label">Enabled</label>
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label">Description</label>
                  <input className="form-control" value={description} onChange={e => setDescription(e.target.value)} />
                </div>
              </div>

              {/* Triggers */}
              <div className="mt-4">
                <h6 className="mb-2 d-flex align-items-center gap-2"><i className="bi bi-lightning" /> Triggers</h6>
                {triggersUI}
              </div>

              {/* Steps */}
              <div className="mt-4">
                <h6 className="mb-2 d-flex align-items-center gap-2"><i className="bi bi-sliders" /> Steps</h6>
                {steps.map((s, idx) => (
                  <StepCard
                    key={s.id}
                    step={s}
                    connectors={connectors}
                    onChange={updated => updateStep(idx, updated)}
                    onDelete={() => deleteStep(idx)}
                    onMoveUp={() => moveStepUp(idx)}
                    onMoveDown={() => moveStepDown(idx)}
                  />
                ))}
                <div className="d-flex align-items-center gap-2">
                  <button className="btn btn-outline-secondary" onClick={addStep}>+ Add step</button>
                  <button className="btn btn-primary" onClick={savePipeline}><i className="bi bi-save" /> Save pipeline</button>
                </div>
                <div className="text-muted small mt-2">
                  Placeholder only — execution happens client-side for demo. When the API is available, saving and running will call server endpoints and store runs.
                </div>
              </div>
            </div>
          </div>

          {/* Run demo */}
          <div className="card">
            <div className="card-header d-flex align-items-center gap-2">
              <i className="bi bi-play-circle" /> <strong>Run (demo)</strong>
            </div>
            <div className="card-body">
              <label className="form-label">Trigger payload (JSON)</label>
              <textarea
                className="form-control"
                rows={4}
                value={payloadText}
                onChange={e => setPayloadText(e.target.value)}
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace" }}
              />

              <div className="d-flex align-items-center gap-2 mt-2">
                <button className="btn btn-primary" disabled={running} onClick={runNow}>
                  {running ? "Running…" : "Run now"}
                </button>
                {runStatus && <StatusChip text={`Status: ${runStatus}`} tone={runStatus === "succeeded" ? "ok" : runStatus === "running" ? "warn" : runStatus === "failed" ? "bad" : "muted"} />}
              </div>

              {stepRuns.length > 0 && (
                <div className="mt-3">
                  <h6 className="mb-2">Timeline</h6>
                  <div className="list-group">
                    {stepRuns.map(sr => (
                      <div key={sr.stepId} className="list-group-item">
                        <div className="d-flex align-items-center justify-content-between">
                          <div className="d-flex align-items-center gap-2">
                            <strong>{sr.name}</strong>
                            <StatusChip
                              text={sr.status}
                              tone={
                                sr.status === "succeeded" ? "ok" :
                                sr.status === "running"   ? "warn" :
                                sr.status === "failed"    ? "bad"  : "muted"
                              }
                            />
                          </div>
                          <span className="text-muted small">{fmtTime(sr.startedAt)} → {fmtTime(sr.finishedAt)}</span>
                        </div>
                        <div className="mt-2">
                          <details>
                            <summary className="text-muted">Input</summary>
                            <pre className="mt-1 p-2 bg-body-tertiary rounded">{JSON.stringify(sr.input, null, 2)}</pre>
                          </details>
                          <details>
                            <summary className="text-muted">Output</summary>
                            <pre className="mt-1 p-2 bg-body-tertiary rounded">{JSON.stringify(sr.output, null, 2)}</pre>
                          </details>
                          {sr.error && (
                            <details open>
                              <summary className="text-danger">Error</summary>
                              <pre className="mt-1 p-2 bg-body-tertiary rounded text-danger">{sr.error}</pre>
                            </details>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
