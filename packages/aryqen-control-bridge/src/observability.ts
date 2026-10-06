import { execFileSync } from "node:child_process";
import type { AutomatonStateDb } from "./db.js";
import { hasTable, safeJson } from "./db.js";

type Row = Record<string, unknown>;

function git(args: string[], cwd: string, timeout = 3500): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    }).trim();
  } catch {
    return null;
  }
}

function resolveRepoRoot(): string | null {
  const preferred = process.env.ARYQEN_REPO_PATH ?? process.cwd();
  return git(["rev-parse", "--show-toplevel"], preferred, 1500);
}

function scalar<T>(
  db: AutomatonStateDb,
  table: string,
  sql: string,
  params: unknown[] = [],
): T | undefined {
  if (!hasTable(db, table)) return undefined;
  try {
    const row = db.prepare(sql).get(...params) as Record<string, T> | undefined;
    return row ? Object.values(row)[0] : undefined;
  } catch {
    return undefined;
  }
}

function one(
  db: AutomatonStateDb,
  table: string,
  sql: string,
  params: unknown[] = [],
): Row | null {
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
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  } catch {
    return undefined;
  }
}

function numberFromGit(value: string | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function commitExists(sha: string | null, cwd: string): boolean {
  if (!sha) return false;
  return git(["cat-file", "-e", `${sha}^{commit}`], cwd, 1200) !== null;
}

export function getLiveUpstream() {
  const checkedAt = new Date().toISOString();
  const repoRoot = resolveRepoRoot();

  if (!repoRoot) {
    return {
      status: "UNAVAILABLE",
      reachable: false,
      checkedAt,
      repoRoot: null,
      branch: null,
      localHead: null,
      trackedUpstreamSha: null,
      remoteHeadSha: null,
      remoteUrl: null,
      behind: null,
      ahead: null,
      remoteChanged: null,
      error: "ARYQEN Git repository could not be resolved",
    };
  }

  const branch = git(["branch", "--show-current"], repoRoot, 1200);
  const localHead = git(["rev-parse", "HEAD"], repoRoot, 1200);
  const remoteUrl = git(["remote", "get-url", "upstream"], repoRoot, 1200);
  const trackedUpstreamSha = git(["rev-parse", "refs/remotes/upstream/main"], repoRoot, 1200);

  const lsRemote = remoteUrl
    ? git(["ls-remote", "upstream", "refs/heads/main"], repoRoot, 5000)
    : null;
  const remoteHeadSha = lsRemote?.split(/\s+/)[0] || null;

  const reachable = Boolean(remoteUrl && remoteHeadSha);
  const remoteChanged =
    remoteHeadSha && trackedUpstreamSha ? remoteHeadSha !== trackedUpstreamSha : null;

  let behind: number | null = null;
  let ahead: number | null = null;

  const comparisonSha =
    remoteHeadSha && commitExists(remoteHeadSha, repoRoot) ? remoteHeadSha : trackedUpstreamSha;

  if (comparisonSha && localHead) {
    behind = numberFromGit(git(["rev-list", "--count", `${localHead}..${comparisonSha}`], repoRoot, 1500));
    ahead = numberFromGit(git(["rev-list", "--count", `${comparisonSha}..${localHead}`], repoRoot, 1500));
  }

  let status = "UNAVAILABLE";
  if (reachable) {
    status = remoteChanged ? "UPDATE_AVAILABLE" : "SYNCED";
  } else if (remoteUrl && trackedUpstreamSha) {
    status = "LOCAL_CACHE_ONLY";
  }

  return {
    status,
    reachable,
    checkedAt,
    repoRoot,
    branch,
    localHead,
    trackedUpstreamSha,
    remoteHeadSha,
    remoteUrl,
    behind,
    ahead,
    remoteChanged,
    error: reachable ? null : remoteUrl ? "Live upstream lookup unavailable" : "Missing upstream remote",
  };
}

export function getObservability(db: AutomatonStateDb) {
  const now = Date.now();
  const agentState = kv(db, "agent_state") ?? "setup";

  const latestHeartbeat = one(
    db,
    "heartbeat_history",
    "SELECT task_name, started_at, completed_at, result, duration_ms, error FROM heartbeat_history ORDER BY started_at DESC LIMIT 1",
  );

  const ping = safeJson<{ uptimeSeconds?: number; timestamp?: string } | null>(
    kv(db, "last_heartbeat_ping"),
    null,
  );

  const lastRunAtRaw =
    (latestHeartbeat?.completed_at as string | undefined) ??
    (latestHeartbeat?.started_at as string | undefined) ??
    ping?.timestamp ??
    null;

  const lastRunMs = lastRunAtRaw ? Date.parse(lastRunAtRaw) : Number.NaN;
  const ageSeconds = Number.isFinite(lastRunMs) ? Math.max(0, Math.round((now - lastRunMs) / 1000)) : null;

  const minIntervalMs =
    scalar<number>(
      db,
      "heartbeat_schedule",
      "SELECT MIN(interval_ms) AS interval_ms FROM heartbeat_schedule WHERE enabled = 1 AND interval_ms > 0",
    ) ?? null;

  const staleAfterSeconds = minIntervalMs
    ? Math.max(300, Math.min(21_600, Math.round((minIntervalMs / 1000) * 3)))
    : 1_800;

  const latestResult = String(latestHeartbeat?.result ?? "").toLowerCase();
  const latestError = latestHeartbeat?.error ? String(latestHeartbeat.error) : null;

  let heartbeatStatus = "WAITING";
  if (agentState === "setup" && !lastRunAtRaw) {
    heartbeatStatus = "WAITING_SETUP";
  } else if (latestError || ["failed", "error", "timeout"].includes(latestResult)) {
    heartbeatStatus = "FAILED";
  } else if (ageSeconds != null && ageSeconds > staleAfterSeconds) {
    heartbeatStatus = "STALE";
  } else if (lastRunAtRaw) {
    heartbeatStatus = "HEALTHY";
  }

  const count = (table: string, where = "") =>
    scalar<number>(db, table, `SELECT COUNT(*) AS c FROM ${table}${where}`) ?? 0;

  const lastValue = (table: string, column: string) =>
    scalar<string>(db, table, `SELECT MAX(${column}) AS value FROM ${table}`) ?? null;

  return {
    queriedAt: new Date().toISOString(),
    bridge: {
      mode: "read-only",
      processUptimeSeconds: Math.round(process.uptime()),
      databaseQueryOnly: true,
    },
    heartbeat: {
      status: heartbeatStatus,
      lastRunAt: lastRunAtRaw,
      ageSeconds,
      staleAfterSeconds,
      latestTask: latestHeartbeat?.task_name ?? null,
      latestResult: latestHeartbeat?.result ?? null,
      latestError,
      latestDurationMs: latestHeartbeat?.duration_ms ?? null,
      scheduleCount: count("heartbeat_schedule"),
      historyCount: count("heartbeat_history"),
    },
    activity24h: {
      events: count("event_stream", " WHERE created_at >= datetime('now','-1 day')"),
      toolCalls: count("tool_calls", " WHERE created_at >= datetime('now','-1 day')"),
      toolErrors: count(
        "tool_calls",
        " WHERE created_at >= datetime('now','-1 day') AND error IS NOT NULL AND error != ''",
      ),
      turns: count("turns", " WHERE created_at >= datetime('now','-1 day')"),
      modifications: count("modifications", " WHERE created_at >= datetime('now','-1 day')"),
      policyBlocks: count(
        "policy_decisions",
        " WHERE created_at >= datetime('now','-1 day') AND decision != 'allow'",
      ),
    },
    freshness: {
      lastEventAt: lastValue("event_stream", "created_at"),
      lastToolCallAt: lastValue("tool_calls", "created_at"),
      lastTurnAt: lastValue("turns", "created_at"),
      lastModificationAt: lastValue("modifications", "created_at"),
      lastPolicyDecisionAt: lastValue("policy_decisions", "created_at"),
      lastMetricSnapshotAt: lastValue("metric_snapshots", "snapshot_at"),
    },
  };
}
