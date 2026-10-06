import React from "react";
import ReactDOM from "react-dom/client";
import { motion } from "framer-motion";
import "./styles.css";

type Row = Record<string, unknown>;
type ViewKey = "control" | "mission" | "agents" | "memory" | "economy" | "security" | "upstream" | "system";

type Overview = {
  agent: { name: string; state: string; tier: string | null; uptimeSeconds: number | null };
  mission: { id: string | null; title: string | null; progress: number; runningTasks: number };
  workers: { active: number; total: number };
  economy: { creditsCents: number | null; todayInferenceCostCents: number };
  heartbeat: { healthy: boolean; lastRunAt: string | null };
  policy: { blockedLast24h: number };
  upstream: {
    status: string;
    guardStatus: string;
    behind: number | null;
    checkedAt: string | null;
    healthy: boolean;
  };
};

type Activity = {
  events: Row[];
  toolCalls: Row[];
  turns: Row[];
  modifications: Row[];
};

type MissionData = { goal: Row | null; tasks: Row[] };
type WorkersData = { workers: Row[]; lifecycle: Row[] };

type EconomyData = {
  recentTransactions: Row[];
  spendToday: Row[];
  inferenceToday: Row[];
  creditStatus: unknown;
  usdcStatus: unknown;
};

type PolicyData = {
  recent: Row[];
  blockedLast24h: number;
};

type MemoryData = {
  counts: {
    working: number;
    episodic: number;
    semantic: number;
    procedural: number;
    relationship: number;
  };
  recentWorking: Row[];
  recentEpisodic: Row[];
  recentSemantic: Row[];
  procedures: Row[];
  relationships: Row[];
};

type UpstreamData = {
  status: string;
  reachable: boolean;
  checkedAt: string | null;
  repoRoot: string | null;
  branch: string | null;
  localHead: string | null;
  trackedUpstreamSha: string | null;
  remoteHeadSha: string | null;
  remoteUrl: string | null;
  behind: number | null;
  ahead: number | null;
  comparisonBasis:
    | "REMOTE_HEAD"
    | "TRACKED_CACHE"
    | "REMOTE_HEAD_NOT_FETCHED"
    | null;
  remoteChanged: boolean | null;
  guard: {
    status: "CLEAR" | "COMPATIBILITY_CHECK_REQUIRED" | "UNAVAILABLE";
    candidateSha: string | null;
    trackedSha: string | null;
    promotionGate:
      | "NO_CANDIDATE"
      | "BLOCKED_PENDING_COMPATIBILITY"
      | "UNAVAILABLE";
    remoteObjectAvailableLocally: boolean;
    testsRequired: string[];
    mutation: {
      fetch: false;
      merge: false;
      checkout: false;
    };
    reason: string;
  };
  error: string | null;
};

type SystemData = {
  schemaVersion: number | string | null;
  agentState: string;
  capabilities: Record<string, boolean>;
  heartbeatSchedule: Row[];
  heartbeatHistory: Row[];
  latestHeartbeat: Row | null;
  latestMetricSnapshot: Row | null;
};

type ObservabilityData = {
  queriedAt: string | null;
  bridge: {
    mode: string;
    processUptimeSeconds: number;
    databaseQueryOnly: boolean;
  };
  heartbeat: {
    status: string;
    lastRunAt: string | null;
    ageSeconds: number | null;
    staleAfterSeconds: number;
    latestTask: unknown;
    latestResult: unknown;
    latestError: string | null;
    latestDurationMs: unknown;
    scheduleCount: number;
    historyCount: number;
  };
  activity24h: {
    events: number;
    toolCalls: number;
    toolErrors: number;
    turns: number;
    modifications: number;
    policyBlocks: number;
  };
  freshness: {
    lastEventAt: string | null;
    lastToolCallAt: string | null;
    lastTurnAt: string | null;
    lastModificationAt: string | null;
    lastPolicyDecisionAt: string | null;
    lastMetricSnapshotAt: string | null;
  };
};

type ControlStatusData = {
  mode: string;
  preflight: {
    status: "READY" | "BLOCKED";
    runtimeReady: boolean;
    configPresent: boolean;
    buildReady: boolean;
    apiKeyPresent: boolean;
    apiKeySource: "ENV" | "AUTOMATON_CONFIG" | "PROVISION_CONFIG" | null;
    blocker:
      | "REPO_NOT_FOUND"
      | "RUNTIME_BUILD_MISSING"
      | "CONWAY_API_KEY_MISSING"
      | null;
    dependency: {
      name: "CONWAY_AUTH";
      nativeProvisionCommand: "--provision";
      upstreamOwned: true;
    };
  };
  runtime: {
    state: "STOPPED" | "RUNNING_MANAGED" | "RUNNING_UNMANAGED";
    running: boolean;
    managed: boolean;
    pid: number | null;
    startedAt: string | null;
  };
  capabilities: {
    start: boolean;
    stopManaged: boolean;
    pause: false;
    resume: false;
  };
  safety: {
    automatonDbWritesByBridge: false;
    forceKill: false;
    gracefulSignal: "SIGTERM";
    tinopronoAccess: false;
    financialActions: false;
  };
  nativeSurface: {
    runtime: string[];
    creatorCli: string[];
  };
};

type ControlAuditData = {
  entries: Array<{
    at: string;
    action: string;
    outcome: string;
    pid: number | null;
    detail: string | null;
  }>;
};


const emptyOverview: Overview = {
  agent: { name: "ARYQEN", state: "offline", tier: null, uptimeSeconds: null },
  mission: { id: null, title: null, progress: 0, runningTasks: 0 },
  workers: { active: 0, total: 0 },
  economy: { creditsCents: null, todayInferenceCostCents: 0 },
  heartbeat: { healthy: false, lastRunAt: null },
  policy: { blockedLast24h: 0 },
  upstream: {
    status: "UNAVAILABLE",
    guardStatus: "UNAVAILABLE",
    behind: null,
    checkedAt: null,
    healthy: false,
  },
};

const emptyActivity: Activity = { events: [], toolCalls: [], turns: [], modifications: [] };
const emptyMission: MissionData = { goal: null, tasks: [] };
const emptyWorkers: WorkersData = { workers: [], lifecycle: [] };
const emptyEconomy: EconomyData = {
  recentTransactions: [],
  spendToday: [],
  inferenceToday: [],
  creditStatus: null,
  usdcStatus: null,
};
const emptyPolicy: PolicyData = { recent: [], blockedLast24h: 0 };
const emptyMemory: MemoryData = {
  counts: { working: 0, episodic: 0, semantic: 0, procedural: 0, relationship: 0 },
  recentWorking: [],
  recentEpisodic: [],
  recentSemantic: [],
  procedures: [],
  relationships: [],
};
const emptyUpstream: UpstreamData = {
  status: "UNAVAILABLE",
  reachable: false,
  checkedAt: null,
  repoRoot: null,
  branch: null,
  localHead: null,
  trackedUpstreamSha: null,
  remoteHeadSha: null,
  remoteUrl: null,
  behind: null,
  ahead: null,
  comparisonBasis: null,
  remoteChanged: null,
  guard: {
    status: "UNAVAILABLE",
    candidateSha: null,
    trackedSha: null,
    promotionGate: "UNAVAILABLE",
    remoteObjectAvailableLocally: false,
    testsRequired: [
      "UPSTREAM_BASELINE",
      "ARYQEN_CONTRACT",
      "ARYQEN_INTEGRATION",
      "AUTOMATON_CORE_INTEGRITY",
    ],
    mutation: {
      fetch: false,
      merge: false,
      checkout: false,
    },
    reason: "Upstream compatibility state unavailable.",
  },
  error: null,
};
const emptySystem: SystemData = {
  schemaVersion: null,
  agentState: "setup",
  capabilities: {},
  heartbeatSchedule: [],
  heartbeatHistory: [],
  latestHeartbeat: null,
  latestMetricSnapshot: null,
};

const emptyObservability: ObservabilityData = {
  queriedAt: null,
  bridge: { mode: "read-only", processUptimeSeconds: 0, databaseQueryOnly: true },
  heartbeat: {
    status: "WAITING",
    lastRunAt: null,
    ageSeconds: null,
    staleAfterSeconds: 1800,
    latestTask: null,
    latestResult: null,
    latestError: null,
    latestDurationMs: null,
    scheduleCount: 0,
    historyCount: 0,
  },
  activity24h: {
    events: 0,
    toolCalls: 0,
    toolErrors: 0,
    turns: 0,
    modifications: 0,
    policyBlocks: 0,
  },
  freshness: {
    lastEventAt: null,
    lastToolCallAt: null,
    lastTurnAt: null,
    lastModificationAt: null,
    lastPolicyDecisionAt: null,
    lastMetricSnapshotAt: null,
  },
};

const emptyControlStatus: ControlStatusData = {
  mode: "BOUNDED_LOCAL_CONTROL",
  preflight: {
    status: "BLOCKED",
    runtimeReady: false,
    configPresent: false,
    buildReady: false,
    apiKeyPresent: false,
    apiKeySource: null,
    blocker: "REPO_NOT_FOUND",
    dependency: {
      name: "CONWAY_AUTH",
      nativeProvisionCommand: "--provision",
      upstreamOwned: true,
    },
  },
  runtime: {
    state: "STOPPED",
    running: false,
    managed: false,
    pid: null,
    startedAt: null,
  },
  capabilities: {
    start: true,
    stopManaged: false,
    pause: false,
    resume: false,
  },
  safety: {
    automatonDbWritesByBridge: false,
    forceKill: false,
    gracefulSignal: "SIGTERM",
    tinopronoAccess: false,
    financialActions: false,
  },
  nativeSurface: {
    runtime: [],
    creatorCli: [],
  },
};

const emptyControlAudit: ControlAuditData = { entries: [] };


const NAV_ITEMS: Array<{ key: ViewKey; index: string; label: string }> = [
  { key: "control", index: "01", label: "CONTROL" },
  { key: "mission", index: "02", label: "MISSION" },
  { key: "agents", index: "03", label: "AGENTS" },
  { key: "memory", index: "04", label: "MEMORY" },
  { key: "economy", index: "05", label: "ECONOMY" },
  { key: "security", index: "06", label: "SECURITY" },
  { key: "upstream", index: "07", label: "UPSTREAM" },
  { key: "system", index: "08", label: "SYSTEM" },
];

const VIEW_META: Record<ViewKey, { title: string; subtitle: string }> = {
  control: { title: "CONTROL CENTER", subtitle: "Live read-only overview of the Automaton runtime" },
  mission: { title: "MISSION", subtitle: "Active goal, task graph and mission execution state" },
  agents: { title: "AGENTS", subtitle: "Workers, children and lifecycle telemetry" },
  memory: { title: "MEMORY", subtitle: "Working, episodic, semantic, procedural and relationship memory" },
  economy: { title: "ECONOMY", subtitle: "Credits, inference usage, spend and transaction telemetry" },
  security: { title: "SECURITY", subtitle: "Policy decisions, quarantines and blocked actions" },
  upstream: { title: "UPSTREAM", subtitle: "Automaton upstream status and compatibility visibility" },
  system: { title: "SYSTEM", subtitle: "Schema, capabilities, heartbeat and runtime health" },
};

function usePolling<T>(endpoint: string, fallback: T, intervalMs: number) {
  const [data, setData] = React.useState<T>(fallback);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as T;
        if (alive) {
          setData(next);
          setConnected(true);
        }
      } catch {
        if (alive) setConnected(false);
      }
    };

    load();
    const timer = window.setInterval(load, intervalMs);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [endpoint, intervalMs]);

  return { data, connected };
}

function getHashView(): ViewKey {
  const value = window.location.hash.replace("#", "").toLowerCase();
  return NAV_ITEMS.some((item) => item.key === value) ? (value as ViewKey) : "control";
}

function useViewNavigation() {
  const [view, setViewState] = React.useState<ViewKey>(() => getHashView());

  React.useEffect(() => {
    const onHashChange = () => setViewState(getHashView());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setView = React.useCallback((next: ViewKey) => {
    if (window.location.hash !== `#${next}`) {
      window.location.hash = next;
    } else {
      setViewState(next);
    }
  }, []);

  return [view, setView] as const;
}

function formatUptime(seconds: number | null) {
  if (seconds == null) return "—";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}

function compact(value: unknown, max = 92) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function display(value: unknown, max = 100) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "YES" : "NO";
  if (typeof value === "object") {
    try {
      return compact(JSON.stringify(value), max);
    } catch {
      return "—";
    }
  }
  return compact(value, max);
}

function timeLabel(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function dateTimeLabel(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return display(value);
  return date.toLocaleString();
}

type ActivityItem = {
  id: string;
  at: string;
  label: string;
  detail: string;
  tone: "ok" | "warn" | "neutral";
};

function buildActivityFeed(activity: Activity): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const event of activity.events.slice(0, 8)) {
    items.push({
      id: `event-${String(event.id)}`,
      at: String(event.created_at ?? ""),
      label: String(event.type ?? "EVENT").toUpperCase(),
      detail: compact(event.content),
      tone: "neutral",
    });
  }

  for (const tool of activity.toolCalls.slice(0, 8)) {
    const hasError = Boolean(tool.error);
    items.push({
      id: `tool-${String(tool.id)}`,
      at: String(tool.created_at ?? ""),
      label: hasError ? "TOOL ERROR" : "TOOL",
      detail: hasError
        ? `${String(tool.name)} · ${compact(tool.error, 70)}`
        : String(tool.name ?? "unknown"),
      tone: hasError ? "warn" : "ok",
    });
  }

  for (const modification of activity.modifications.slice(0, 5)) {
    items.push({
      id: `mod-${String(modification.id)}`,
      at: String(modification.created_at ?? modification.timestamp ?? ""),
      label: "SELF-MOD",
      detail: compact(modification.description),
      tone: "neutral",
    });
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);
}

function MetricCard({
  title,
  value,
  sub,
  tone = "cyan",
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "cyan" | "violet" | "green" | "amber";
}) {
  return (
    <motion.section
      className={`metric-card tone-${tone}`}
      whileHover={{ y: -3, scale: 1.008 }}
      transition={{ duration: 0.18 }}
    >
      <div className="metric-corner" />
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </motion.section>
  );
}

function NeuralCore({ state, connected }: { state: string; connected: boolean }) {
  const active = connected && !["sleeping", "dead", "offline", "setup"].includes(state);
  const pace = active ? 1 : 1.7;

  return (
    <div className={`neural-core ${active ? "is-active" : ""}`}>
      <div className="core-halo halo-outer" />
      <div className="core-halo halo-mid" />
      <div className="core-crown crown-a" />
      <div className="core-crown crown-b" />

      <motion.div
        className="ring ring-1"
        animate={{ rotate: 360 }}
        transition={{ duration: 24 * pace, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="ring ring-2"
        animate={{ rotate: -360 }}
        transition={{ duration: 17 * pace, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="ring ring-3"
        animate={{ rotate: 360 }}
        transition={{ duration: 10 * pace, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="ring ring-4"
        animate={{ rotate: -360 }}
        transition={{ duration: 7 * pace, repeat: Infinity, ease: "linear" }}
      />

      <div className="orbital-node n1" />
      <div className="orbital-node n2" />
      <div className="orbital-node n3" />
      <div className="orbital-node n4" />
      <div className="orbital-node n5" />
      <div className="orbital-node n6" />

      <div className="signal-spoke spoke-a"><span /></div>
      <div className="signal-spoke spoke-b"><span /></div>
      <div className="signal-spoke spoke-c"><span /></div>
      <div className="signal-spoke spoke-d"><span /></div>

      <div className="data-beacon beacon-a"><b>MEM</b><span>SYNC</span></div>
      <div className="data-beacon beacon-b"><b>POL</b><span>SAFE</span></div>
      <div className="data-beacon beacon-c"><b>UP</b><span>LINK</span></div>
      <div className="data-beacon beacon-d"><b>HB</b><span>WAIT</span></div>

      <motion.div
        className="core-sphere"
        animate={{
          scale: active ? [1, 1.035, 1] : [1, 1.018, 1],
          filter: active
            ? ["brightness(1)", "brightness(1.2)", "brightness(1)"]
            : ["brightness(.92)", "brightness(1)", "brightness(.92)"],
        }}
        transition={{ duration: active ? 2.3 : 4.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="neural-web" />
        <div className="neural-lattice" />
        <div className="core-scanline" />
        <div className="core-heartbeat">
          <i /><i /><i /><i /><i />
        </div>
        <div className="core-brand">ARYQEN</div>
        <div className="core-mode">{connected ? state.toUpperCase() : "BRIDGE OFFLINE"}</div>
      </motion.div>

      <div className="axis axis-x" />
      <div className="axis axis-y" />
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="view-empty">
      <div className="empty-pulse" />
      <div>{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone = "cyan",
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  tone?: "cyan" | "green" | "violet" | "amber";
}) {
  return (
    <div className={`view-stat tone-${tone}`}>
      <div className="view-stat-label">{label}</div>
      <div className="view-stat-value">{value}</div>
      {detail && <div className="view-stat-detail">{detail}</div>}
    </div>
  );
}

type Column = {
  key: string;
  label: string;
  render?: (row: Row) => React.ReactNode;
};

function DataTable({
  rows,
  columns,
  emptyLabel,
}: {
  rows: Row[];
  columns: Column[];
  emptyLabel: string;
}) {
  if (rows.length === 0) return <EmptyState>{emptyLabel}</EmptyState>;

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? `${index}-${columns[0]?.key ?? "row"}`)}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row) : display(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({
  title,
  kicker,
  children,
  className = "",
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`view-panel ${className}`}>
      <div className="view-panel-head">
        <div>
          <div className="panel-title">{title}</div>
          {kicker && <div className="panel-kicker">{kicker}</div>}
        </div>
      </div>
      <div className="view-panel-body">{children}</div>
    </section>
  );
}


function ControlPlane({
  status,
  connected,
  audit,
}: {
  status: ControlStatusData;
  connected: boolean;
  audit: ControlAuditData;
}) {
  const [confirmAction, setConfirmAction] = React.useState<"start" | "stop" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  const execute = async (action: "start" | "stop") => {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(`/api/control/${action}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-aryqen-confirm":
            action === "start" ? "START_ARYQEN_RUNTIME" : "STOP_ARYQEN_RUNTIME",
        },
        body: "{}",
      });
      const payload = (await response.json()) as { message?: string; code?: string };
      setResult(payload.message ?? payload.code ?? `HTTP ${response.status}`);
    } catch {
      setResult("Control request failed: bridge unavailable.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  };

  const dependencyBlocked = connected && !status.preflight.runtimeReady;
  const runtimeLabel = !connected
    ? "BRIDGE OFFLINE"
    : status.runtime.running
      ? status.runtime.state.replaceAll("_", " ")
      : dependencyBlocked
        ? status.preflight.blocker === "CONWAY_API_KEY_MISSING"
          ? "AUTH BLOCKED"
          : "PREFLIGHT BLOCKED"
        : "STOPPED";

  const blockerCopy =
    status.preflight.blocker === "CONWAY_API_KEY_MISSING"
      ? "Conway API key is missing. ARYQEN blocks START before spawning Automaton."
      : status.preflight.blocker === "RUNTIME_BUILD_MISSING"
        ? "Automaton runtime build is missing. Build must pass before START is available."
        : status.preflight.blocker === "REPO_NOT_FOUND"
          ? "ARYQEN cannot resolve the Automaton repository root."
          : "Runtime prerequisites are satisfied.";

  return (
    <section className="control-plane panel">
      <div className="panel-head">
        <div>
          <div className="panel-title">SAFE CONTROL PLANE</div>
          <div className="panel-kicker">Dependency-aware preflight · native Automaton lifecycle · local only</div>
        </div>
        <div
          className={`control-runtime-state ${
            status.runtime.running ? "running" : dependencyBlocked ? "blocked" : ""
          }`}
        >
          <i />
          {runtimeLabel}
        </div>
      </div>

      <div className={`dependency-gate ${status.preflight.runtimeReady ? "ready" : "blocked"}`}>
        <div className="dependency-identity">
          <span>UPSTREAM DEPENDENCY</span>
          <b>CONWAY AUTH</b>
          <p>Runtime authentication remains owned by Automaton / Conway upstream.</p>
        </div>

        <div className="dependency-metric">
          <span>CONFIG</span>
          <b>{connected ? (status.preflight.configPresent ? "PRESENT" : "MISSING") : "—"}</b>
        </div>

        <div className="dependency-metric">
          <span>RUNTIME BUILD</span>
          <b>{connected ? (status.preflight.buildReady ? "READY" : "MISSING") : "—"}</b>
        </div>

        <div className="dependency-metric">
          <span>CONWAY API KEY</span>
          <b>{connected ? (status.preflight.apiKeyPresent ? "PRESENT" : "MISSING") : "—"}</b>
          {status.preflight.apiKeySource && <em>{status.preflight.apiKeySource.replaceAll("_", " ")}</em>}
        </div>

        <div className="dependency-metric">
          <span>START GATE</span>
          <b>{connected ? status.preflight.status : "—"}</b>
        </div>

        <div className="dependency-detail">
          <span>{blockerCopy}</span>
          <code>native provisioning: {status.preflight.dependency.nativeProvisionCommand}</code>
        </div>
      </div>

      <div className="control-plane-grid">
        <div className="control-actions">
          <div className="control-action-card">
            <span className="control-action-index">01</span>
            <div>
              <b>START RUNTIME</b>
              <p>
                Launches native Automaton <code>--run</code> only after the local preflight gate is READY.
              </p>
            </div>

            {confirmAction === "start" ? (
              <div className="confirm-row">
                <button className="control-button confirm" disabled={busy} onClick={() => void execute("start")}>
                  {busy ? "STARTING…" : "CONFIRM START"}
                </button>
                <button className="control-button ghost" disabled={busy} onClick={() => setConfirmAction(null)}>
                  CANCEL
                </button>
              </div>
            ) : (
              <button
                className="control-button"
                disabled={!connected || !status.capabilities.start || busy}
                onClick={() => setConfirmAction("start")}
              >
                {!connected ? "OFFLINE" : status.preflight.runtimeReady ? "START" : "BLOCKED"}
              </button>
            )}
          </div>

          <div className="control-action-card">
            <span className="control-action-index">02</span>
            <div>
              <b>SAFE STOP</b>
              <p>Sends graceful <code>SIGTERM</code> only to an ARYQEN-owned runtime.</p>
            </div>

            {confirmAction === "stop" ? (
              <div className="confirm-row">
                <button className="control-button danger confirm" disabled={busy} onClick={() => void execute("stop")}>
                  {busy ? "STOPPING…" : "CONFIRM STOP"}
                </button>
                <button className="control-button ghost" disabled={busy} onClick={() => setConfirmAction(null)}>
                  CANCEL
                </button>
              </div>
            ) : (
              <button
                className="control-button danger"
                disabled={!connected || !status.capabilities.stopManaged || busy}
                onClick={() => setConfirmAction("stop")}
              >
                STOP
              </button>
            )}
          </div>

          <div className="native-gap">
            <span>NATIVE PAUSE / RESUME</span>
            <b>NOT EXPOSED BY AUTOMATON v0.2.1</b>
            <p>ARYQEN does not invent a fake pause/resume path or write runtime state directly.</p>
          </div>
        </div>

        <div className="control-safety">
          <div className="control-safety-title">CONTROL ENVELOPE</div>
          <div className="control-safety-list">
            <div><span>Automaton DB writes by bridge</span><b>NONE</b></div>
            <div><span>Preflight before START</span><b>REQUIRED</b></div>
            <div><span>Force kill</span><b>DISABLED</b></div>
            <div><span>Graceful signal</span><b>SIGTERM</b></div>
            <div><span>Financial actions</span><b>LOCKED</b></div>
            <div><span>TINOPRONO access</span><b>DENIED</b></div>
          </div>

          <div className="control-native">
            <span>NATIVE SURFACE</span>
            <p>{status.nativeSurface.runtime.join(" · ") || "waiting for bridge"}</p>
          </div>
        </div>

        <div className="control-audit">
          <div className="control-safety-title">LOCAL AUDIT</div>
          {audit.entries.length === 0 ? (
            <div className="control-audit-empty">No control actions recorded yet.</div>
          ) : (
            audit.entries.slice(0, 6).map((entry, index) => (
              <div className="control-audit-line" key={`${entry.at}-${index}`}>
                <span>{timeLabel(entry.at)}</span>
                <b>{entry.action}</b>
                <em>{entry.outcome}</em>
                <p>{entry.detail ?? "—"}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {result && <div className="control-result">{result}</div>}
    </section>
  );
}

function ControlView({
  overview,
  overviewConnected,
  activity,
  activityConnected,
  controlStatus,
  controlConnected,
  controlAudit,
}: {
  overview: Overview;
  overviewConnected: boolean;
  activity: Activity;
  activityConnected: boolean;
  controlStatus: ControlStatusData;
  controlConnected: boolean;
  controlAudit: ControlAuditData;
}) {
  const o = overview;
  const activityFeed = buildActivityFeed(activity);
  const credits = o.economy.creditsCents == null ? "—" : `$${(o.economy.creditsCents / 100).toFixed(2)}`;

  return (
    <>
      <section className="control-grid">
        <div className="metric-rail left-rail">
          <MetricCard
            title="MISSION"
            value={o.mission.title ?? "No active mission"}
            sub={`${o.mission.progress}% complete · ${o.mission.runningTasks} running`}
          />
          <MetricCard
            title="WORKERS"
            value={`${o.workers.active}/${o.workers.total}`}
            sub="active / total"
            tone="violet"
          />
          <MetricCard
            title="POLICY"
            value={o.policy.blockedLast24h}
            sub="blocked or quarantined · 24h"
            tone={o.policy.blockedLast24h > 0 ? "amber" : "green"}
          />
        </div>

        <div className="core-stage">
          <div className="stage-label stage-label-left">NEURAL CONTROL MATRIX</div>
          <div className="stage-label stage-label-right">LIVE TELEMETRY</div>

          <div className="core-status-stack">
            <span><i className="cs cyan" />OBSERVATION MODE</span>
            <span><i className="cs green" />CORE INTACT</span>
          </div>

          <NeuralCore state={o.agent.state} connected={overviewConnected} />

          <div className="mission-progress">
            <span style={{ width: `${Math.max(2, o.mission.progress)}%` }} />
          </div>

          <div className="mission-caption">
            {o.mission.title ?? "ARYQEN observing Automaton runtime"}
          </div>

          <div className="telemetry-row">
            <span>STATE <b>{o.agent.state.toUpperCase()}</b></span>
            <span>HEARTBEAT <b>{o.heartbeat.healthy ? "OK" : "WAIT"}</b></span>
            <span>BRIDGE <b>{overviewConnected ? "LINKED" : "OFFLINE"}</b></span>
          </div>
        </div>

        <div className="metric-rail right-rail">
          <MetricCard
            title="BUDGET"
            value={credits}
            sub={`AI cost today $${(o.economy.todayInferenceCostCents / 100).toFixed(2)}`}
            tone="green"
          />
          <MetricCard
            title="UPSTREAM"
            value={
              o.upstream.behind == null
                ? "—"
                : o.upstream.behind === 0
                  ? "SYNCED"
                  : `${o.upstream.behind} BEHIND`
            }
            sub={o.upstream.healthy ? "Automaton upstream visible" : "status unavailable"}
          />
          <MetricCard
            title="RESOURCE TIER"
            value={o.agent.tier?.toUpperCase() ?? "—"}
            sub="runtime survival state"
            tone="violet"
          />
        </div>
      </section>

      <section className="lower-deck">
        <div className="panel activity-panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">LIVE ACTIVITY</div>
              <div className="panel-kicker">Automaton event surface</div>
            </div>

            <div className={`stream-state ${activityConnected ? "linked" : ""}`}>
              <span className="tiny-dot" />
              {activityConnected ? "STREAM LINKED" : "WAITING"}
            </div>
          </div>

          <div className="activity-list">
            {activityFeed.length === 0 ? (
              <div className="activity-empty">
                <div className="empty-pulse" />
                No recent runtime events yet.
              </div>
            ) : (
              activityFeed.map((item) => (
                <motion.div
                  className="activity-line"
                  key={item.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <span className={`activity-dot ${item.tone}`} />
                  <div className="activity-copy">
                    <div className="activity-meta">
                      <b>{item.label}</b>
                      <em>{timeLabel(item.at)}</em>
                    </div>
                    <div>{item.detail}</div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="panel integrity-panel">
          <div className="panel-title">CORE INTEGRITY</div>
          <div className="integrity-orb">
            <span>CORE</span>
            <b>SAFE</b>
          </div>
          <div className="integrity-list">
            <div><span>Automaton core</span><b>INTACT</b></div>
            <div><span>Automaton DB</span><b>QUERY_ONLY</b></div>
            <div><span>Control actions</span><b>GATED</b></div>
            <div><span>TINOPRONO access</span><b>DENIED</b></div>
          </div>
        </div>

        <div className="panel doctrine-panel">
          <div className="panel-title">UPSTREAM-FIRST</div>
          <div className="doctrine-mark">AUTOMATON</div>
          <div className="telemetry">
            Native Automaton capabilities stay upstream-owned. ARYQEN adds a reversible visual
            control layer without rewriting the runtime.
          </div>
          <div className="security-chip">MINIMAL DELTA · REVERSIBLE</div>
        </div>
      </section>

      <ControlPlane
        status={controlStatus}
        connected={controlConnected}
        audit={controlAudit}
      />
    </>
  );
}

function MissionView({ data, overview }: { data: MissionData; overview: Overview }) {
  const goal = data.goal;
  return (
    <div className="view-shell">
      <div className="view-stat-grid">
        <StatCard label="ACTIVE GOAL" value={goal ? display(goal.title ?? goal.id, 40) : "NONE"} />
        <StatCard label="TASKS" value={data.tasks.length} tone="violet" />
        <StatCard label="RUNNING" value={overview.mission.runningTasks} tone="green" />
        <StatCard label="PROGRESS" value={`${overview.mission.progress}%`} />
      </div>

      <div className="view-columns">
        <Section title="GOAL" kicker="Current active Automaton objective">
          {goal ? (
            <div className="detail-grid">
              {["id", "title", "status", "priority", "created_at", "updated_at"].map((key) => (
                <div className="detail-item" key={key}>
                  <span>{key.replaceAll("_", " ")}</span>
                  <b>{display(goal[key], 90)}</b>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>No active mission. Automaton is currently in setup/standby.</EmptyState>
          )}
        </Section>

        <Section title="TASK GRAPH" kicker="Read-only task execution surface" className="wide-panel">
          <DataTable
            rows={data.tasks}
            emptyLabel="No tasks exist for the active mission."
            columns={[
              { key: "title", label: "TASK" },
              { key: "status", label: "STATE" },
              { key: "priority", label: "PRIORITY" },
              { key: "assigned_worker_id", label: "WORKER" },
              { key: "created_at", label: "CREATED", render: (row) => dateTimeLabel(row.created_at) },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}

function AgentsView({ data, overview }: { data: WorkersData; overview: Overview }) {
  return (
    <div className="view-shell">
      <div className="view-stat-grid">
        <StatCard label="ACTIVE" value={overview.workers.active} tone="green" />
        <StatCard label="TOTAL" value={overview.workers.total} />
        <StatCard label="LIFECYCLE EVENTS" value={data.lifecycle.length} tone="violet" />
        <StatCard label="MODE" value="READ ONLY" />
      </div>

      <Section title="WORKERS / CHILDREN" kicker="Spawned Automaton worker identities">
        <DataTable
          rows={data.workers}
          emptyLabel="No workers or child agents have been created yet."
          columns={[
            { key: "name", label: "NAME" },
            { key: "role", label: "ROLE" },
            { key: "status", label: "STATUS" },
            { key: "address", label: "ADDRESS" },
            { key: "funded_amount_cents", label: "FUNDED" },
            { key: "created_at", label: "CREATED", render: (row) => dateTimeLabel(row.created_at) },
          ]}
        />
      </Section>

      <Section title="LIFECYCLE" kicker="Recent worker lifecycle events">
        <DataTable
          rows={data.lifecycle.slice(0, 30)}
          emptyLabel="No worker lifecycle events recorded."
          columns={[
            { key: "event_type", label: "EVENT" },
            { key: "child_id", label: "CHILD" },
            { key: "status", label: "STATUS" },
            { key: "reason", label: "DETAIL" },
            { key: "created_at", label: "TIME", render: (row) => dateTimeLabel(row.created_at) },
          ]}
        />
      </Section>
    </div>
  );
}

function MemoryView({ data }: { data: MemoryData }) {
  const total =
    data.counts.working +
    data.counts.episodic +
    data.counts.semantic +
    data.counts.procedural +
    data.counts.relationship;

  return (
    <div className="view-shell">
      <div className="memory-count-grid">
        <StatCard label="TOTAL MEMORY" value={total} />
        <StatCard label="WORKING" value={data.counts.working} tone="green" />
        <StatCard label="EPISODIC" value={data.counts.episodic} tone="violet" />
        <StatCard label="SEMANTIC" value={data.counts.semantic} />
        <StatCard label="PROCEDURAL" value={data.counts.procedural} tone="amber" />
        <StatCard label="RELATIONSHIPS" value={data.counts.relationship} tone="green" />
      </div>

      <div className="view-columns two">
        <Section title="EPISODIC" kicker="Recent event summaries">
          <DataTable
            rows={data.recentEpisodic.slice(0, 12)}
            emptyLabel="No episodic memories recorded."
            columns={[
              { key: "event_type", label: "TYPE" },
              { key: "summary", label: "SUMMARY" },
              { key: "importance", label: "IMPORTANCE" },
              { key: "created_at", label: "CREATED", render: (row) => dateTimeLabel(row.created_at) },
            ]}
          />
        </Section>

        <Section title="SEMANTIC" kicker="Knowledge entries">
          <DataTable
            rows={data.recentSemantic.slice(0, 12)}
            emptyLabel="No semantic memories recorded."
            columns={[
              { key: "category", label: "CATEGORY" },
              { key: "key", label: "KEY" },
              { key: "confidence", label: "CONFIDENCE" },
              { key: "source", label: "SOURCE" },
            ]}
          />
        </Section>

        <Section title="PROCEDURES" kicker="Learned operational procedures">
          <DataTable
            rows={data.procedures.slice(0, 12)}
            emptyLabel="No procedural memories recorded."
            columns={[
              { key: "name", label: "NAME" },
              { key: "success_count", label: "SUCCESS" },
              { key: "failure_count", label: "FAIL" },
              { key: "last_used_at", label: "LAST USED", render: (row) => dateTimeLabel(row.last_used_at) },
            ]}
          />
        </Section>

        <Section title="RELATIONSHIPS" kicker="Known external identities">
          <DataTable
            rows={data.relationships.slice(0, 12)}
            emptyLabel="No relationship memories recorded."
            columns={[
              { key: "entity_name", label: "ENTITY" },
              { key: "relationship_type", label: "TYPE" },
              { key: "trust_score", label: "TRUST" },
              { key: "interaction_count", label: "INTERACTIONS" },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}

function EconomyView({ data, overview }: { data: EconomyData; overview: Overview }) {
  const credits =
    overview.economy.creditsCents == null ? "—" : `$${(overview.economy.creditsCents / 100).toFixed(2)}`;

  return (
    <div className="view-shell">
      <div className="view-stat-grid">
        <StatCard label="CREDITS" value={credits} tone="green" />
        <StatCard
          label="AI COST TODAY"
          value={`$${(overview.economy.todayInferenceCostCents / 100).toFixed(2)}`}
        />
        <StatCard label="FINANCIAL ACTIONS" value="LOCKED" tone="green" />
        <StatCard label="MODE" value="OBSERVE" tone="violet" />
      </div>

      <div className="view-columns two">
        <Section title="SPEND TODAY" kicker="Aggregated by category">
          <DataTable
            rows={data.spendToday}
            emptyLabel="No spend recorded today."
            columns={[
              { key: "category", label: "CATEGORY" },
              { key: "amount_cents", label: "CENTS" },
            ]}
          />
        </Section>

        <Section title="INFERENCE TODAY" kicker="Provider/model usage">
          <DataTable
            rows={data.inferenceToday}
            emptyLabel="No inference costs recorded today."
            columns={[
              { key: "provider", label: "PROVIDER" },
              { key: "model", label: "MODEL" },
              { key: "cost_cents", label: "COST" },
              { key: "input_tokens", label: "IN" },
              { key: "output_tokens", label: "OUT" },
            ]}
          />
        </Section>
      </div>

      <Section title="RECENT TRANSACTIONS" kicker="Read-only financial ledger">
        <DataTable
          rows={data.recentTransactions.slice(0, 30)}
          emptyLabel="No transactions recorded."
          columns={[
            { key: "type", label: "TYPE" },
            { key: "amount_cents", label: "AMOUNT" },
            { key: "recipient", label: "RECIPIENT" },
            { key: "status", label: "STATUS" },
            { key: "created_at", label: "TIME", render: (row) => dateTimeLabel(row.created_at) },
          ]}
        />
      </Section>
    </div>
  );
}

function SecurityView({ data }: { data: PolicyData }) {
  return (
    <div className="view-shell">
      <div className="view-stat-grid">
        <StatCard
          label="BLOCKED / 24H"
          value={data.blockedLast24h}
          tone={data.blockedLast24h > 0 ? "amber" : "green"}
        />
        <StatCard label="POLICY LOG" value={data.recent.length} />
        <StatCard label="BRIDGE MODE" value="QUERY_ONLY" tone="green" />
        <StatCard label="AUTOMATON CORE" value="INTACT" tone="green" />
      </div>

      <Section title="POLICY DECISIONS" kicker="Recent allow / quarantine / deny decisions">
        <DataTable
          rows={data.recent}
          emptyLabel="No policy decisions recorded yet."
          columns={[
            { key: "tool_name", label: "TOOL" },
            { key: "risk_level", label: "RISK" },
            { key: "decision", label: "DECISION" },
            { key: "rules_triggered", label: "RULES" },
            { key: "reason", label: "REASON" },
            { key: "created_at", label: "TIME", render: (row) => dateTimeLabel(row.created_at) },
          ]}
        />
      </Section>
    </div>
  );
}

function UpstreamView({ data }: { data: UpstreamData }) {
  const statusTone =
    data.status === "SYNCED"
      ? "green"
      : data.status === "UPDATE_AVAILABLE"
        ? "amber"
        : data.reachable
          ? "cyan"
          : "amber";

  const guardTone =
    data.guard.status === "CLEAR"
      ? "green"
      : data.guard.status === "COMPATIBILITY_CHECK_REQUIRED"
        ? "amber"
        : "violet";

  const shortSha = (sha: string | null) => (sha ? sha.slice(0, 10) : "—");
  const mutationSafe =
    !data.guard.mutation.fetch &&
    !data.guard.mutation.merge &&
    !data.guard.mutation.checkout;

  return (
    <div className="view-shell upstream-v18">
      <div className="view-stat-grid">
        <StatCard label="UPSTREAM STATUS" value={data.status.replaceAll("_", " ")} tone={statusTone} />
        <StatCard
          label="COMPATIBILITY GUARD"
          value={data.guard.status.replaceAll("_", " ")}
          tone={guardTone}
        />
        <StatCard
          label="CANDIDATE"
          value={data.guard.candidateSha ? shortSha(data.guard.candidateSha) : "NONE"}
          detail={data.guard.candidateSha ? "live upstream SHA" : "no upstream candidate"}
          tone={data.guard.candidateSha ? "amber" : "cyan"}
        />
        <StatCard
          label="STABLE MUTATION"
          value={mutationSafe ? "NONE" : "REVIEW"}
          detail="fetch · merge · checkout"
          tone={mutationSafe ? "green" : "amber"}
        />
      </div>

      <div className="view-columns two">
        <Section title="LIVE UPSTREAM" kicker="Remote observation only — ls-remote without repository mutation">
          <div className="detail-grid">
            <div className="detail-item"><span>branch</span><b>{display(data.branch)}</b></div>
            <div className="detail-item"><span>checked at</span><b>{dateTimeLabel(data.checkedAt)}</b></div>
            <div className="detail-item"><span>local head</span><b className="mono-value">{shortSha(data.localHead)}</b></div>
            <div className="detail-item"><span>tracked upstream</span><b className="mono-value">{shortSha(data.trackedUpstreamSha)}</b></div>
            <div className="detail-item"><span>live remote head</span><b className="mono-value">{shortSha(data.remoteHeadSha)}</b></div>
            <div className="detail-item"><span>remote changed</span><b>{data.remoteChanged == null ? "—" : data.remoteChanged ? "YES" : "NO"}</b></div>
            <div className="detail-item"><span>comparison basis</span><b>{display(data.comparisonBasis)}</b></div>
            <div className="detail-item"><span>remote object local</span><b>{data.guard.remoteObjectAvailableLocally ? "YES" : "NO"}</b></div>
          </div>
        </Section>

        <Section title="COMPATIBILITY GATE" kicker="Stable ARYQEN never promotes an upstream change before verification">
          <div className="upstream-policy">
            <div className={`upstream-signal ${data.guard.status.toLowerCase()}`}>
              <i />
              <div>
                <b>{data.guard.status.replaceAll("_", " ")}</b>
                <span>{data.guard.reason}</span>
              </div>
            </div>

            <div className="guard-gate">
              <span>PROMOTION GATE</span>
              <b>{data.guard.promotionGate.replaceAll("_", " ")}</b>
            </div>

            <div className="policy-note">
              A detected remote SHA is only a candidate. No update reaches the stable runtime until the required
              compatibility suite is green.
            </div>
          </div>
        </Section>
      </div>

      <Section title="UPGRADE STATE MACHINE" kicker="Upstream-first promotion path">
        <div className="upgrade-flow">
          {[
            ["DETECTED", data.status === "UPDATE_AVAILABLE"],
            ["CANDIDATE", Boolean(data.guard.candidateSha)],
            ["COMPATIBILITY TESTS", data.guard.status === "COMPATIBILITY_CHECK_REQUIRED"],
            ["READY", false],
            ["PROMOTED", false],
          ].map(([label, active], index) => (
            <React.Fragment key={String(label)}>
              <div className={`upgrade-step ${active ? "active" : ""}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <b>{String(label)}</b>
              </div>
              {index < 4 && <i className="upgrade-arrow">→</i>}
            </React.Fragment>
          ))}
        </div>
      </Section>

      <div className="view-columns two">
        <Section title="REQUIRED COMPATIBILITY SUITE" kicker="Checks required before any candidate can be promoted">
          <div className="compat-test-grid">
            {data.guard.testsRequired.map((test) => (
              <div className="compat-test" key={test}>
                <i />
                <span>{test.replaceAll("_", " ")}</span>
                <b>{data.guard.status === "COMPATIBILITY_CHECK_REQUIRED" ? "REQUIRED" : "STANDBY"}</b>
              </div>
            ))}
          </div>
        </Section>

        <Section title="IMMUTABILITY ENVELOPE" kicker="What this live guard is explicitly forbidden to do">
          <div className="immutability-grid">
            <div><span>git fetch</span><b>{data.guard.mutation.fetch ? "ENABLED" : "DISABLED"}</b></div>
            <div><span>git merge</span><b>{data.guard.mutation.merge ? "ENABLED" : "DISABLED"}</b></div>
            <div><span>git checkout</span><b>{data.guard.mutation.checkout ? "ENABLED" : "DISABLED"}</b></div>
            <div><span>stable runtime mutation</span><b>NONE</b></div>
          </div>
        </Section>
      </div>

      <Section title="REMOTE IDENTITY" kicker="Git source configured as Automaton upstream">
        <div className="detail-grid">
          <div className="detail-item"><span>remote url</span><b>{display(data.remoteUrl, 160)}</b></div>
          <div className="detail-item"><span>repository root</span><b>{display(data.repoRoot, 160)}</b></div>
          <div className="detail-item"><span>live lookup</span><b>{data.reachable ? "READ-ONLY LS-REMOTE PASS" : "UNAVAILABLE"}</b></div>
          <div className="detail-item"><span>working tree mutation</span><b>NONE</b></div>
          <div className="detail-item"><span>ahead</span><b>{data.ahead ?? "—"}</b></div>
          <div className="detail-item"><span>behind</span><b>{data.behind ?? "—"}</b></div>
        </div>
      </Section>
    </div>
  );
}

function SystemView({
  data,
  overview,
  observability,
}: {
  data: SystemData;
  overview: Overview;
  observability: ObservabilityData;
}) {
  const capabilities = Object.entries(data.capabilities);
  const enabled = capabilities.filter(([, available]) => available).length;
  const hbTone =
    observability.heartbeat.status === "HEALTHY"
      ? "green"
      : observability.heartbeat.status === "WAITING_SETUP"
        ? "cyan"
        : "amber";

  return (
    <div className="view-shell">
      <div className="view-stat-grid">
        <StatCard label="SCHEMA" value={display(data.schemaVersion)} />
        <StatCard label="AGENT STATE" value={data.agentState.toUpperCase()} tone="violet" />
        <StatCard label="CAPABILITIES" value={`${enabled}/${capabilities.length}`} tone="green" />
        <StatCard label="HEARTBEAT" value={observability.heartbeat.status.replaceAll("_", " ")} tone={hbTone} />
      </div>

      <div className="observability-grid">
        <Section title="RUNTIME PULSE" kicker="Current read-only bridge and heartbeat diagnostics">
          <div className="detail-grid">
            <div className="detail-item"><span>bridge mode</span><b>{observability.bridge.mode.toUpperCase()}</b></div>
            <div className="detail-item"><span>db query only</span><b>{observability.bridge.databaseQueryOnly ? "YES" : "NO"}</b></div>
            <div className="detail-item"><span>bridge uptime</span><b>{formatUptime(observability.bridge.processUptimeSeconds)}</b></div>
            <div className="detail-item"><span>last heartbeat</span><b>{dateTimeLabel(observability.heartbeat.lastRunAt)}</b></div>
            <div className="detail-item"><span>heartbeat age</span><b>{observability.heartbeat.ageSeconds == null ? "—" : `${observability.heartbeat.ageSeconds}s`}</b></div>
            <div className="detail-item"><span>stale after</span><b>{`${observability.heartbeat.staleAfterSeconds}s`}</b></div>
          </div>
        </Section>

        <Section title="ACTIVITY / 24H" kicker="Runtime activity counters">
          <div className="pulse-count-grid">
            <div><span>EVENTS</span><b>{observability.activity24h.events}</b></div>
            <div><span>TOOLS</span><b>{observability.activity24h.toolCalls}</b></div>
            <div><span>TOOL ERRORS</span><b>{observability.activity24h.toolErrors}</b></div>
            <div><span>TURNS</span><b>{observability.activity24h.turns}</b></div>
            <div><span>MODIFICATIONS</span><b>{observability.activity24h.modifications}</b></div>
            <div><span>POLICY BLOCKS</span><b>{observability.activity24h.policyBlocks}</b></div>
          </div>
        </Section>
      </div>

      <Section title="CAPABILITY MATRIX" kicker="Tables/capabilities visible through the read-only adapter">
        {capabilities.length === 0 ? (
          <EmptyState>No capability metadata available.</EmptyState>
        ) : (
          <div className="capability-grid">
            {capabilities.map(([name, available]) => (
              <div className={`capability-chip ${available ? "available" : ""}`} key={name}>
                <i />
                <span>{name}</span>
                <b>{available ? "READY" : "N/A"}</b>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="view-columns two">
        <Section title="HEARTBEAT SCHEDULE" kicker="Configured scheduled tasks">
          <DataTable
            rows={data.heartbeatSchedule}
            emptyLabel="No heartbeat schedule entries."
            columns={[
              { key: "task_name", label: "TASK" },
              { key: "priority", label: "PRIORITY" },
              { key: "enabled", label: "ENABLED" },
              { key: "interval_ms", label: "INTERVAL" },
            ]}
          />
        </Section>

        <Section title="HEARTBEAT HISTORY" kicker="Recent runtime heartbeat executions">
          <DataTable
            rows={data.heartbeatHistory.slice(0, 20)}
            emptyLabel="No heartbeat runs have been recorded."
            columns={[
              { key: "task_name", label: "TASK" },
              { key: "result", label: "RESULT" },
              { key: "duration_ms", label: "MS" },
              { key: "started_at", label: "START", render: (row) => dateTimeLabel(row.started_at) },
            ]}
          />
        </Section>
      </div>

      <Section title="DATA FRESHNESS" kicker="Most recent observed records by subsystem">
        <div className="freshness-grid">
          {Object.entries(observability.freshness).map(([key, value]) => (
            <div className="freshness-item" key={key}>
              <span>{key.replace(/^last/, "").replace(/At$/, "").replace(/([A-Z])/g, " $1").trim()}</span>
              <b>{dateTimeLabel(value)}</b>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function App() {
  const [view, setView] = useViewNavigation();

  const overviewPoll = usePolling<Overview>("/api/overview", emptyOverview, 1500);
  const activityPoll = usePolling<Activity>("/api/activity", emptyActivity, 1800);
  const missionPoll = usePolling<MissionData>("/api/mission", emptyMission, 2400);
  const workersPoll = usePolling<WorkersData>("/api/workers", emptyWorkers, 2600);
  const memoryPoll = usePolling<MemoryData>("/api/memory", emptyMemory, 3200);
  const economyPoll = usePolling<EconomyData>("/api/economy", emptyEconomy, 2800);
  const policyPoll = usePolling<PolicyData>("/api/policy", emptyPolicy, 2200);
  const upstreamPoll = usePolling<UpstreamData>("/api/upstream", emptyUpstream, 5000);
  const systemPoll = usePolling<SystemData>("/api/system", emptySystem, 3000);
  const observabilityPoll = usePolling<ObservabilityData>("/api/observability", emptyObservability, 1800);
  const controlStatusPoll = usePolling<ControlStatusData>("/api/control/status", emptyControlStatus, 1200);
  const controlAuditPoll = usePolling<ControlAuditData>("/api/control/audit", emptyControlAudit, 1600);

  const o = overviewPoll.data;
  const nominal = overviewPoll.connected && o.heartbeat.healthy;
  const systemLabel = nominal
    ? "SYSTEM NOMINAL"
    : overviewPoll.connected
      ? o.agent.state === "setup"
        ? "SYSTEM STANDBY"
        : "RUNTIME DEGRADED"
      : "BRIDGE OFFLINE";

  const meta = VIEW_META[view];

  const renderView = () => {
    switch (view) {
      case "mission":
        return <MissionView data={missionPoll.data} overview={o} />;
      case "agents":
        return <AgentsView data={workersPoll.data} overview={o} />;
      case "memory":
        return <MemoryView data={memoryPoll.data} />;
      case "economy":
        return <EconomyView data={economyPoll.data} overview={o} />;
      case "security":
        return <SecurityView data={policyPoll.data} />;
      case "upstream":
        return <UpstreamView data={upstreamPoll.data} />;
      case "system":
        return <SystemView data={systemPoll.data} overview={o} observability={observabilityPoll.data} />;
      case "control":
      default:
        return (
          <ControlView
            overview={o}
            overviewConnected={overviewPoll.connected}
            activity={activityPoll.data}
            activityConnected={activityPoll.connected}
            controlStatus={controlStatusPoll.data}
            controlConnected={controlStatusPoll.connected}
            controlAudit={controlAuditPoll.data}
          />
        );
    }
  };

  return (
    <main className="control-shell">
      <div className="grid-plane" />
      <div className="scan-beam" />
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <div className="vignette" />

      <aside className="side-nav">
        <button className="nav-mark nav-home" onClick={() => setView("control")} aria-label="Open control view">
          AQ
        </button>

        <div className="nav-stack">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${view === item.key ? "active" : ""}`}
              onClick={() => setView(item.key)}
              aria-current={view === item.key ? "page" : undefined}
            >
              <span>{item.index}</span>
              {item.label}
            </button>
          ))}
        </div>

        <div className="nav-footer">
          <span className={`tiny-dot ${overviewPoll.connected ? "linked" : ""}`} />
          LOCAL
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">AUTOMATON CORE · ARYQEN CONTROL LAYER</div>
            <h1>ARYQEN <span>{meta.title}</span></h1>
            <div className="runtime-id">
              RUNTIME / {o.agent.name || "UNNAMED"} · {meta.subtitle.toUpperCase()}
            </div>
          </div>

          <div className="top-status">
            <div className="status-line">
              <span
                className={`status-dot ${
                  nominal ? "ok" : overviewPoll.connected ? "standby" : ""
                }`}
              />
              {systemLabel}
            </div>
            <div className="status-meta">
              <span>UPTIME {formatUptime(o.agent.uptimeSeconds)}</span>
              <span>BRIDGE {overviewPoll.connected ? "LINKED" : "OFFLINE"}</span>
            </div>
          </div>
        </header>

        <div className="command-strip">
          <span className="strip-label">{view.toUpperCase()}</span>
          <span>CORE STATE <b>{o.agent.state.toUpperCase()}</b></span>
          <span>HEARTBEAT <b>{o.heartbeat.healthy ? "ONLINE" : "WAIT"}</b></span>
          <span>POLICY <b>{o.policy.blockedLast24h === 0 ? "CLEAR" : "REVIEW"}</b></span>
          <span>
            UPSTREAM{" "}
            <b>
              {o.upstream.guardStatus === "COMPATIBILITY_CHECK_REQUIRED"
                ? "CHECK REQUIRED"
                : o.upstream.status === "UPDATE_AVAILABLE"
                  ? "UPDATE AVAILABLE"
                  : o.upstream.status === "SYNCED"
                    ? "SYNCED"
                    : o.upstream.status.replaceAll("_", " ")}
            </b>
          </span>
          <span>ACCESS <b>CONTROL GATED</b></span>
        </div>

        <motion.div
          key={view}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {renderView()}
        </motion.div>

        <footer className="footer-line">
          <span>ARYQEN CONTROL / V1.8</span>
          <span>UPSTREAM COMPATIBILITY GUARD · LOCAL</span>
          <span>{new Date().toLocaleDateString()}</span>
        </footer>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
