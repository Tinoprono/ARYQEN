import type Database from "better-sqlite3";
import {
  getSchemaVersion,
  getTableColumns,
  hasTable,
  safeJson,
  type AutomatonStateDb,
} from "./db.js";
import type { AryqenMission, AryqenOverview, AryqenWorkerView } from "./contracts.js";

type Row = Record<string, unknown>;

const CAPABILITY_TABLES = [
  "identity",
  "kv",
  "goals",
  "task_graph",
  "children",
  "child_lifecycle_events",
  "transactions",
  "spend_tracking",
  "inference_costs",
  "policy_decisions",
  "working_memory",
  "episodic_memory",
  "semantic_memory",
  "procedural_memory",
  "relationship_memory",
  "event_stream",
  "tool_calls",
  "turns",
  "modifications",
  "heartbeat_schedule",
  "heartbeat_history",
  "metric_snapshots",
] as const;

function scalar<T>(db: AutomatonStateDb, table: string, sql: string, params: unknown[] = []): T | undefined {
  if (!hasTable(db, table)) return undefined;
  try {
    const row = db.prepare(sql).get(...params) as Record<string, T> | undefined;
    return row ? Object.values(row)[0] : undefined;
  } catch {
    return undefined;
  }
}

function rows(db: AutomatonStateDb, table: string, sql: string, params: unknown[] = []): Row[] {
  if (!hasTable(db, table)) return [];
  try {
    return db.prepare(sql).all(...params) as Row[];
  } catch {
    return [];
  }
}

function one(db: AutomatonStateDb, table: string, sql: string, params: unknown[] = []): Row | null {
  if (!hasTable(db, table)) return null;
  try {
    return (db.prepare(sql).get(...params) as Row | undefined) ?? null;
  } catch {
    return null;
  }
}

function kv(db: AutomatonStateDb, key: string): string | undefined {
  if (!hasTable(db, "kv")) return undefined;
  try {
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  } catch {
    return undefined;
  }
}

function selectedColumns(db: AutomatonStateDb, table: string, desired: string[]): string[] {
  const available = getTableColumns(db, table);
  return desired.filter((column) => available.has(column));
}

export function getMission(db: AutomatonStateDb): AryqenMission {
  if (!hasTable(db, "goals") || !hasTable(db, "task_graph")) {
    return { goal: null, tasks: [] };
  }

  const goal = one(
    db,
    "goals",
    "SELECT * FROM goals WHERE status = 'active' ORDER BY created_at ASC LIMIT 1",
  );
  if (!goal) return { goal: null, tasks: [] };

  const tasks = rows(
    db,
    "task_graph",
    "SELECT * FROM task_graph WHERE goal_id = ? ORDER BY priority DESC, created_at ASC",
    [goal.id],
  );
  return { goal, tasks };
}

export function getWorkers(db: AutomatonStateDb): AryqenWorkerView {
  const workerFields = selectedColumns(db, "children", [
    "id",
    "name",
    "address",
    "sandbox_id",
    "funded_amount_cents",
    "status",
    "created_at",
    "last_checked",
    "role",
    "chain_type",
  ]);

  return {
    workers:
      workerFields.length === 0
        ? []
        : rows(db, "children", `SELECT ${workerFields.join(", ")} FROM children ORDER BY created_at DESC`),
    lifecycle: rows(
      db,
      "child_lifecycle_events",
      "SELECT * FROM child_lifecycle_events ORDER BY created_at DESC LIMIT 100",
    ),
  };
}

export function getEconomy(db: AutomatonStateDb) {
  return {
    recentTransactions: rows(db, "transactions", "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 100"),
    spendToday: rows(
      db,
      "spend_tracking",
      "SELECT category, COALESCE(SUM(amount_cents),0) AS amount_cents FROM spend_tracking WHERE date(created_at)=date('now') GROUP BY category",
    ),
    inferenceToday: rows(
      db,
      "inference_costs",
      "SELECT provider, model, COALESCE(SUM(cost_cents),0) AS cost_cents, COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens FROM inference_costs WHERE date(created_at)=date('now') GROUP BY provider, model ORDER BY cost_cents DESC",
    ),
    creditStatus: safeJson(kv(db, "last_credit_check"), null),
    usdcStatus: safeJson(kv(db, "last_usdc_check"), null),
  };
}

export function getPolicy(db: AutomatonStateDb) {
  return {
    recent: rows(
      db,
      "policy_decisions",
      "SELECT id, turn_id, tool_name, risk_level, decision, rules_evaluated, rules_triggered, reason, latency_ms, created_at FROM policy_decisions ORDER BY created_at DESC LIMIT 100",
    ),
    blockedLast24h:
      scalar<number>(
        db,
        "policy_decisions",
        "SELECT COUNT(*) AS c FROM policy_decisions WHERE decision != 'allow' AND created_at >= datetime('now','-1 day')",
      ) ?? 0,
  };
}

export function getMemory(db: AutomatonStateDb) {
  const count = (table: string) => scalar<number>(db, table, `SELECT COUNT(*) AS c FROM ${table}`) ?? 0;

  return {
    counts: {
      working: count("working_memory"),
      episodic: count("episodic_memory"),
      semantic: count("semantic_memory"),
      procedural: count("procedural_memory"),
      relationship: count("relationship_memory"),
    },
    recentWorking: rows(
      db,
      "working_memory",
      "SELECT id, session_id, content_type, priority, token_count, expires_at, created_at FROM working_memory ORDER BY created_at DESC LIMIT 30",
    ),
    recentEpisodic: rows(
      db,
      "episodic_memory",
      "SELECT id, event_type, summary, outcome, importance, token_count, created_at FROM episodic_memory ORDER BY created_at DESC LIMIT 30",
    ),
    recentSemantic: rows(
      db,
      "semantic_memory",
      "SELECT id, category, key, confidence, source, last_verified_at, updated_at FROM semantic_memory ORDER BY updated_at DESC LIMIT 30",
    ),
    procedures: rows(
      db,
      "procedural_memory",
      "SELECT id, name, description, success_count, failure_count, last_used_at, updated_at FROM procedural_memory ORDER BY updated_at DESC LIMIT 30",
    ),
    relationships: rows(
      db,
      "relationship_memory",
      "SELECT id, entity_address, entity_name, relationship_type, trust_score, interaction_count, last_interaction_at, updated_at FROM relationship_memory ORDER BY updated_at DESC LIMIT 30",
    ),
  };
}

export function getActivity(db: AutomatonStateDb) {
  return {
    events: rows(
      db,
      "event_stream",
      "SELECT id, type, agent_address, goal_id, task_id, content, token_count, compacted_to, created_at FROM event_stream ORDER BY created_at DESC LIMIT 100",
    ),
    toolCalls: rows(
      db,
      "tool_calls",
      "SELECT id, turn_id, name, duration_ms, error, created_at FROM tool_calls ORDER BY created_at DESC LIMIT 100",
    ),
    // Deliberately excludes turns.thinking and tool-call arguments/results.
    turns: rows(
      db,
      "turns",
      "SELECT id, timestamp, state, input_source, token_usage, cost_cents, created_at FROM turns ORDER BY timestamp DESC LIMIT 50",
    ),
    modifications: rows(
      db,
      "modifications",
      "SELECT id, timestamp, type, description, file_path, reversible, created_at FROM modifications ORDER BY timestamp DESC LIMIT 50",
    ),
  };
}

export function getUpstream(db: AutomatonStateDb) {
  return safeJson(kv(db, "upstream_status"), { behind: null, commits: [], checkedAt: null });
}

export function getSystem(db: AutomatonStateDb) {
  const latestHeartbeat = one(
    db,
    "heartbeat_history",
    "SELECT task_name, started_at, completed_at, result, duration_ms, error FROM heartbeat_history ORDER BY started_at DESC LIMIT 1",
  );

  return {
    schemaVersion: getSchemaVersion(db),
    agentState: kv(db, "agent_state") ?? "setup",
    capabilities: Object.fromEntries(CAPABILITY_TABLES.map((table) => [table, hasTable(db, table)])),
    heartbeatSchedule: rows(db, "heartbeat_schedule", "SELECT * FROM heartbeat_schedule ORDER BY priority DESC, task_name ASC"),
    heartbeatHistory: rows(db, "heartbeat_history", "SELECT * FROM heartbeat_history ORDER BY started_at DESC LIMIT 100"),
    latestHeartbeat,
    latestMetricSnapshot: one(
      db,
      "metric_snapshots",
      "SELECT * FROM metric_snapshots ORDER BY snapshot_at DESC LIMIT 1",
    ),
  };
}

export function getOverview(db: AutomatonStateDb): AryqenOverview {
  const mission = getMission(db);
  const taskList = mission.tasks;
  const total = taskList.length;
  const completed = taskList.filter((task) => task.status === "completed").length;
  const running = taskList.filter((task) => task.status === "running" || task.status === "assigned").length;

  const workerRows = rows(db, "children", "SELECT status FROM children");
  const activeWorkers = workerRows.filter((worker) =>
    ["running", "healthy", "starting"].includes(String(worker.status)),
  ).length;

  const blockedLast24h =
    scalar<number>(
      db,
      "policy_decisions",
      "SELECT COUNT(*) AS c FROM policy_decisions WHERE decision != 'allow' AND created_at >= datetime('now','-1 day')",
    ) ?? 0;

  const inferenceToday =
    scalar<number>(
      db,
      "inference_costs",
      "SELECT COALESCE(SUM(cost_cents),0) AS c FROM inference_costs WHERE date(created_at)=date('now')",
    ) ?? 0;

  const credit = safeJson<{ credits?: number; tier?: string; timestamp?: string } | null>(
    kv(db, "last_credit_check"),
    null,
  );
  const heartbeatPing = safeJson<{ uptimeSeconds?: number; timestamp?: string } | null>(
    kv(db, "last_heartbeat_ping"),
    null,
  );
  const upstream = safeJson<{ behind?: number; checkedAt?: string; error?: string } | null>(
    kv(db, "upstream_status"),
    null,
  );
  const latestHeartbeat = one(
    db,
    "heartbeat_history",
    "SELECT completed_at, result FROM heartbeat_history ORDER BY started_at DESC LIMIT 1",
  );
  const identityName = scalar<string>(db, "identity", "SELECT value FROM identity WHERE key = 'name'");

  return {
    agent: {
      name: identityName ?? "ARYQEN",
      state: kv(db, "agent_state") ?? "setup",
      tier: credit?.tier ?? null,
      uptimeSeconds: heartbeatPing?.uptimeSeconds ?? null,
    },
    mission: {
      id: mission.goal ? String(mission.goal.id) : null,
      title: mission.goal ? String(mission.goal.title) : null,
      progress: total === 0 ? 0 : Math.round((completed / total) * 100),
      runningTasks: running,
    },
    workers: { active: activeWorkers, total: workerRows.length },
    economy: { creditsCents: credit?.credits ?? null, todayInferenceCostCents: inferenceToday },
    heartbeat: {
      healthy: latestHeartbeat ? latestHeartbeat.result === "success" : Boolean(heartbeatPing),
      lastRunAt: latestHeartbeat?.completed_at ? String(latestHeartbeat.completed_at) : heartbeatPing?.timestamp ?? null,
    },
    policy: { blockedLast24h },
    upstream: {
      behind: upstream?.behind ?? null,
      checkedAt: upstream?.checkedAt ?? null,
      healthy: Boolean(upstream && !upstream.error),
    },
  };
}
