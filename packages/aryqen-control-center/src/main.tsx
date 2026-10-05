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

type ActivityItem = { id: string; at: string; label: string; detail: string; tone: "ok" | "warn" | "neutral" };

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
      detail: hasError ? `${String(tool.name)} · ${compact(tool.error, 70)}` : String(tool.name ?? "unknown"),
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

function Core({ state, connected }: { state: string; connected: boolean }) {
  const active = connected && !["sleeping", "dead", "offline"].includes(state);
  return (
    <div className={`core-wrap ${active ? "is-active" : ""}`}>
      <motion.div
        className="orbit orbit-a"
        animate={{ rotate: 360 }}
        transition={{ duration: active ? 13 : 24, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="orbit orbit-b"
        animate={{ rotate: -360 }}
        transition={{ duration: active ? 9 : 18, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="core"
        animate={{ scale: active ? [1, 1.045, 1] : [1, 1.018, 1], opacity: [0.9, 1, 0.9] }}
        transition={{ duration: active ? 2.2 : 4.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="core-grid" />
        <div className="core-node node-a" />
        <div className="core-node node-b" />
        <div className="core-node node-c" />
        <div className="core-label">ARYQEN</div>
        <div className="core-state">{connected ? state.toUpperCase() : "BRIDGE OFFLINE"}</div>
      </motion.div>
    </div>
  );
}

function Card({ title, value, sub }: { title: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <motion.section className="card" whileHover={{ y: -2 }} transition={{ duration: 0.16 }}>
      <div className="card-title">{title}</div>
      <div className="card-value">{value}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </motion.section>
  );
}

function App() {
  const overviewPoll = usePolling<Overview>("/api/overview", emptyOverview, 1500);
  const activityPoll = usePolling<Activity>("/api/activity", emptyActivity, 1800);
  const o = overviewPoll.data;
  const activity = buildActivityFeed(activityPoll.data);
  const credits = o.economy.creditsCents == null ? "—" : `$${(o.economy.creditsCents / 100).toFixed(2)}`;
  const nominal = overviewPoll.connected && o.heartbeat.healthy;

  return (
    <main className="shell">
      <div className="scan" />
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <header>
        <div>
          <div className="eyebrow">AUTOMATON CORE · ARYQEN CONTROL LAYER</div>
          <h1>ARYQEN</h1>
          <div className="runtime-id">RUNTIME / {o.agent.name || "UNNAMED"}</div>
        </div>
        <div className="status-stack">
          <div className="status"><span className={nominal ? "dot ok" : "dot"} /> {nominal ? "SYSTEM NOMINAL" : overviewPoll.connected ? "RUNTIME DEGRADED" : "BRIDGE OFFLINE"}</div>
          <div className="uptime">UPTIME {formatUptime(o.agent.uptimeSeconds)}</div>
        </div>
      </header>

      <section className="hero-grid">
        <div className="rail left">
          <Card title="MISSION" value={o.mission.title ?? "No active mission"} sub={`${o.mission.progress}% complete · ${o.mission.runningTasks} running`} />
          <Card title="WORKERS" value={`${o.workers.active}/${o.workers.total}`} sub="active / total" />
          <Card title="POLICY" value={o.policy.blockedLast24h} sub="blocked or quarantined · 24h" />
        </div>

        <div className="center">
          <Core state={o.agent.state} connected={overviewPoll.connected} />
          <div className="mission-progress"><span style={{ width: `${Math.max(2, o.mission.progress)}%` }} /></div>
          <div className="mission-caption">{o.mission.title ?? "ARYQEN observing Automaton runtime"}</div>
          <div className="telemetry-row">
            <span>STATE {o.agent.state.toUpperCase()}</span>
            <span>HEARTBEAT {o.heartbeat.healthy ? "OK" : "WAIT"}</span>
            <span>BRIDGE {overviewPoll.connected ? "LINKED" : "OFFLINE"}</span>
          </div>
        </div>

        <div className="rail right">
          <Card title="BUDGET" value={credits} sub={`AI cost today $${(o.economy.todayInferenceCostCents / 100).toFixed(2)}`} />
          <Card title="UPSTREAM" value={o.upstream.behind == null ? "—" : o.upstream.behind === 0 ? "SYNCED" : `${o.upstream.behind} BEHIND`} sub={o.upstream.healthy ? "Automaton upstream visible" : "status unavailable"} />
          <Card title="TIER" value={o.agent.tier?.toUpperCase() ?? "—"} sub="resource state" />
        </div>
      </section>

      <section className="bottom-grid">
        <div className="panel activity-panel">
          <div className="panel-head">
            <div className="panel-title">LIVE ACTIVITY</div>
            <div className={`mini-link ${activityPoll.connected ? "linked" : ""}`}>{activityPoll.connected ? "STREAM LINKED" : "WAITING"}</div>
          </div>
          <div className="activity-list">
            {activity.length === 0 ? (
              <div className="activity-empty">No recent runtime events yet.</div>
            ) : activity.map((item) => (
              <motion.div className="activity-line" key={item.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                <span className={`activity-dot ${item.tone}`} />
                <div className="activity-copy">
                  <div className="activity-meta"><b>{item.label}</b><em>{timeLabel(item.at)}</em></div>
                  <div>{item.detail}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="panel doctrine-panel">
          <div className="panel-title">UPSTREAM-FIRST</div>
          <div className="doctrine-mark">AUTOMATON</div>
          <div className="telemetry">Core capabilities remain upstream-owned. ARYQEN V1 observes state through a read-only bridge and adds visual control without rewriting the runtime.</div>
          <div className="security-chip">READ-ONLY · QUERY_ONLY</div>
        </div>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
