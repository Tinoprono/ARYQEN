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
  upstream: { behind: number | null; checkedAt: string | null; healthy: boolean };
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
  behind?: number | null;
  commits?: unknown[];
  checkedAt?: string | null;
  error?: string;
  [key: string]: unknown;
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

const emptyOverview: Overview = {
  agent: { name: "ARYQEN", state: "offline", tier: null, uptimeSeconds: null },
  mission: { id: null, title: null, progress: 0, runningTasks: 0 },
  workers: { active: 0, total: 0 },
  economy: { creditsCents: null, todayInferenceCostCents: 0 },
  heartbeat: { healthy: false, lastRunAt: null },
  policy: { blockedLast24h: 0 },
  upstream: { behind: null, checkedAt: null, healthy: false },
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
const emptyUpstream: UpstreamData = { behind: null, commits: [], checkedAt: null };
const emptySystem: SystemData = {
  schemaVersion: null,
  agentState: "setup",
  capabilities: {},
  heartbeatSchedule: [],
  heartbeatHistory: [],
  latestHeartbeat: null,
  latestMetricSnapshot: null,
};

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

function ControlView({
  overview,
  overviewConnected,
  activity,
  activityConnected,
}: {
  overview: Overview;
  overviewConnected: boolean;
  activity: Activity;
  activityConnected: boolean;
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
            <span>READ</span>
            <b>ONLY</b>
          </div>
          <div className="integrity-list">
            <div><span>Automaton core</span><b>INTACT</b></div>
            <div><span>Control bridge</span><b>QUERY_ONLY</b></div>
            <div><span>Financial actions</span><b>LOCKED</b></div>
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

function UpstreamView({ data, overview }: { data: UpstreamData; overview: Overview }) {
  const commits = Array.isArray(data.commits)
    ? data.commits.filter((item): item is Row => typeof item === "object" && item !== null)
    : [];

  return (
    <div className="view-shell">
      <div className="view-stat-grid">
        <StatCard
          label="STATUS"
          value={overview.upstream.healthy ? "VISIBLE" : "UNAVAILABLE"}
          tone={overview.upstream.healthy ? "green" : "amber"}
        />
        <StatCard
          label="BEHIND"
          value={overview.upstream.behind == null ? "—" : overview.upstream.behind}
        />
        <StatCard label="COMMITS" value={commits.length} tone="violet" />
        <StatCard
          label="LAST CHECK"
          value={overview.upstream.checkedAt ? dateTimeLabel(overview.upstream.checkedAt) : "—"}
        />
      </div>

      <Section title="UPSTREAM STATUS" kicker="Automaton upstream compatibility surface">
        <div className="detail-grid">
          {Object.entries(data).map(([key, value]) => (
            <div className="detail-item" key={key}>
              <span>{key.replaceAll("_", " ")}</span>
              <b>{display(value, 180)}</b>
            </div>
          ))}
        </div>
      </Section>

      <Section title="UPSTREAM COMMITS" kicker="Available upstream commit metadata">
        <DataTable
          rows={commits.slice(0, 30)}
          emptyLabel="No upstream commit data has been captured yet."
          columns={[
            { key: "sha", label: "SHA" },
            { key: "message", label: "MESSAGE" },
            { key: "author", label: "AUTHOR" },
            { key: "date", label: "DATE", render: (row) => dateTimeLabel(row.date) },
          ]}
        />
      </Section>
    </div>
  );
}

function SystemView({ data, overview }: { data: SystemData; overview: Overview }) {
  const capabilities = Object.entries(data.capabilities);
  const enabled = capabilities.filter(([, available]) => available).length;

  return (
    <div className="view-shell">
      <div className="view-stat-grid">
        <StatCard label="SCHEMA" value={display(data.schemaVersion)} />
        <StatCard label="AGENT STATE" value={data.agentState.toUpperCase()} tone="violet" />
        <StatCard label="CAPABILITIES" value={`${enabled}/${capabilities.length}`} tone="green" />
        <StatCard label="HEARTBEAT" value={overview.heartbeat.healthy ? "HEALTHY" : "WAIT"} />
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
        return <UpstreamView data={upstreamPoll.data} overview={o} />;
      case "system":
        return <SystemView data={systemPoll.data} overview={o} />;
      case "control":
      default:
        return (
          <ControlView
            overview={o}
            overviewConnected={overviewPoll.connected}
            activity={activityPoll.data}
            activityConnected={activityPoll.connected}
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
              {o.upstream.behind == null
                ? "UNKNOWN"
                : o.upstream.behind === 0
                  ? "SYNCED"
                  : `${o.upstream.behind} BEHIND`}
            </b>
          </span>
          <span>ACCESS <b>READ ONLY</b></span>
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
          <span>ARYQEN CONTROL / V1.4</span>
          <span>READ-ONLY CONTROL CENTER · LOCAL</span>
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
