import React from "react";
import ReactDOM from "react-dom/client";
import { motion } from "framer-motion";
import "./styles.css";

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
  events: Array<Record<string, unknown>>;
  toolCalls: Array<Record<string, unknown>>;
  turns: Array<Record<string, unknown>>;
  modifications: Array<Record<string, unknown>>;
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

function timeLabel(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
        <div className="core-scanline" />
        <div className="core-brand">ARYQEN</div>
        <div className="core-mode">{connected ? state.toUpperCase() : "BRIDGE OFFLINE"}</div>
      </motion.div>

      <div className="axis axis-x" />
      <div className="axis axis-y" />
    </div>
  );
}

function App() {
  const overviewPoll = usePolling<Overview>("/api/overview", emptyOverview, 1500);
  const activityPoll = usePolling<Activity>("/api/activity", emptyActivity, 1800);
  const o = overviewPoll.data;
  const activity = buildActivityFeed(activityPoll.data);

  const credits =
    o.economy.creditsCents == null ? "—" : `$${(o.economy.creditsCents / 100).toFixed(2)}`;

  const nominal = overviewPoll.connected && o.heartbeat.healthy;
  const systemLabel = nominal
    ? "SYSTEM NOMINAL"
    : overviewPoll.connected
      ? o.agent.state === "setup"
        ? "SYSTEM STANDBY"
        : "RUNTIME DEGRADED"
      : "BRIDGE OFFLINE";

  return (
    <main className="control-shell">
      <div className="grid-plane" />
      <div className="scan-beam" />
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <div className="vignette" />

      <aside className="side-nav">
        <div className="nav-mark">AQ</div>
        <div className="nav-stack">
          <button className="nav-item active"><span>01</span>CONTROL</button>
          <button className="nav-item"><span>02</span>MISSION</button>
          <button className="nav-item"><span>03</span>AGENTS</button>
          <button className="nav-item"><span>04</span>MEMORY</button>
          <button className="nav-item"><span>05</span>ECONOMY</button>
          <button className="nav-item"><span>06</span>SECURITY</button>
          <button className="nav-item"><span>07</span>UPSTREAM</button>
          <button className="nav-item"><span>08</span>SYSTEM</button>
        </div>
        <div className="nav-footer"><span className="tiny-dot linked" />LOCAL</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">AUTOMATON CORE · ARYQEN CONTROL LAYER</div>
            <h1>ARYQEN <span>CONTROL CENTER</span></h1>
            <div className="runtime-id">
              RUNTIME / {o.agent.name || "UNNAMED"} · READ-ONLY OBSERVATION
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
          <span className="strip-label">CONTROL</span>
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
        </div>

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

            <NeuralCore state={o.agent.state} connected={overviewPoll.connected} />

            <div className="mission-progress">
              <span style={{ width: `${Math.max(2, o.mission.progress)}%` }} />
            </div>

            <div className="mission-caption">
              {o.mission.title ?? "ARYQEN observing Automaton runtime"}
            </div>

            <div className="telemetry-row">
              <span>STATE <b>{o.agent.state.toUpperCase()}</b></span>
              <span>HEARTBEAT <b>{o.heartbeat.healthy ? "OK" : "WAIT"}</b></span>
              <span>BRIDGE <b>{overviewPoll.connected ? "LINKED" : "OFFLINE"}</b></span>
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
              <div className={`stream-state ${activityPoll.connected ? "linked" : ""}`}>
                <span className="tiny-dot" />
                {activityPoll.connected ? "STREAM LINKED" : "WAITING"}
              </div>
            </div>

            <div className="activity-list">
              {activity.length === 0 ? (
                <div className="activity-empty">
                  <div className="empty-pulse" />
                  No recent runtime events yet.
                </div>
              ) : (
                activity.map((item) => (
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

        <footer className="footer-line">
          <span>ARYQEN UI / V1.2</span>
          <span>CONTROL CENTER · LOCAL</span>
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
