import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

type RuntimeRecord = {
  pid: number;
  startedAt: string;
  repoRoot: string;
  distPath: string;
};

export type ControlRuntimeState =
  | "STOPPED"
  | "RUNNING_MANAGED"
  | "RUNNING_UNMANAGED";

export type ControlPreflight = {
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

export type ControlStatus = {
  mode: "BOUNDED_LOCAL_CONTROL";
  preflight: ControlPreflight;
  runtime: {
    state: ControlRuntimeState;
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

export type ControlAuditEntry = {
  at: string;
  action: string;
  outcome: string;
  pid: number | null;
  detail: string | null;
};

const CONTROL_DIR =
  process.env.ARYQEN_CONTROL_DIR ?? path.join(os.homedir(), ".aryqen");
const PID_FILE = path.join(CONTROL_DIR, "runtime.json");
const AUDIT_FILE = path.join(CONTROL_DIR, "control-audit.jsonl");
const RUNTIME_LOG = path.join(CONTROL_DIR, "automaton-runtime.log");

function ensureControlDir(): void {
  fs.mkdirSync(CONTROL_DIR, { recursive: true, mode: 0o700 });
}

function git(args: string[], cwd: string, timeout = 1500): string | null {
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

function repoRoot(): string | null {
  const preferred = process.env.ARYQEN_REPO_PATH ?? process.cwd();
  return git(["rev-parse", "--show-toplevel"], preferred);
}

function runtimeDist(root: string): string {
  return path.join(root, "dist", "index.js");
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function getRuntimePreflight(): ControlPreflight {
  const root = repoRoot();
  const automatonDir = path.join(os.homedir(), ".automaton");
  const automatonConfigPath = path.join(automatonDir, "automaton.json");
  const provisionConfigPath = path.join(automatonDir, "config.json");

  const automatonConfig = readJsonObject(automatonConfigPath);
  const provisionConfig = readJsonObject(provisionConfigPath);

  let apiKeySource: ControlPreflight["apiKeySource"] = null;

  if (hasNonEmptyString(process.env.CONWAY_API_KEY)) {
    apiKeySource = "ENV";
  } else if (hasNonEmptyString(automatonConfig?.conwayApiKey)) {
    apiKeySource = "AUTOMATON_CONFIG";
  } else if (hasNonEmptyString(provisionConfig?.apiKey)) {
    apiKeySource = "PROVISION_CONFIG";
  }

  const configPresent = automatonConfig !== null;
  const buildReady = root ? fs.existsSync(runtimeDist(root)) : false;
  const apiKeyPresent = apiKeySource !== null;

  let blocker: ControlPreflight["blocker"] = null;
  if (!root) blocker = "REPO_NOT_FOUND";
  else if (!buildReady) blocker = "RUNTIME_BUILD_MISSING";
  else if (!apiKeyPresent) blocker = "CONWAY_API_KEY_MISSING";

  return {
    status: blocker === null ? "READY" : "BLOCKED",
    runtimeReady: blocker === null,
    configPresent,
    buildReady,
    apiKeyPresent,
    apiKeySource,
    blocker,
    dependency: {
      name: "CONWAY_AUTH",
      nativeProvisionCommand: "--provision",
      upstreamOwned: true,
    },
  };
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processCommand(pid: number): string | null {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1200,
    }).trim();
  } catch {
    return null;
  }
}

function isExpectedRuntimeCommand(command: string | null, distPath: string): boolean {
  if (!command) return false;
  return command.includes(distPath) && /(?:^|\s)--run(?:\s|$)/.test(command);
}

function readRuntimeRecord(): RuntimeRecord | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(PID_FILE, "utf8")) as Partial<RuntimeRecord>;
    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.startedAt !== "string" ||
      typeof parsed.repoRoot !== "string" ||
      typeof parsed.distPath !== "string"
    ) {
      return null;
    }
    return parsed as RuntimeRecord;
  } catch {
    return null;
  }
}

function writeRuntimeRecord(record: RuntimeRecord): void {
  ensureControlDir();
  fs.writeFileSync(PID_FILE, JSON.stringify(record, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function clearRuntimeRecord(): void {
  try {
    fs.rmSync(PID_FILE, { force: true });
  } catch {
    // Best effort. A stale record will be rejected by command verification.
  }
}

function findUnmanagedRuntime(root: string): number | null {
  const distPath = runtimeDist(root);

  try {
    const output = execFileSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500,
    });

    for (const rawLine of output.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = line.match(/^(\d+)\s+(.*)$/);
      if (!match) continue;

      const pid = Number(match[1]);
      const command = match[2] ?? "";
      if (pid !== process.pid && isExpectedRuntimeCommand(command, distPath)) {
        return pid;
      }
    }
  } catch {
    // If process enumeration is unavailable, fail closed on management:
    // we simply won't claim or stop an unmanaged process.
  }

  return null;
}

function audit(entry: Omit<ControlAuditEntry, "at">): void {
  ensureControlDir();
  const record: ControlAuditEntry = {
    at: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function inspectRuntime() {
  const root = repoRoot();
  const record = readRuntimeRecord();

  if (record && isAlive(record.pid)) {
    const command = processCommand(record.pid);
    if (isExpectedRuntimeCommand(command, record.distPath)) {
      return {
        state: "RUNNING_MANAGED" as const,
        running: true,
        managed: true,
        pid: record.pid,
        startedAt: record.startedAt,
        root: record.repoRoot,
        distPath: record.distPath,
      };
    }

    // Never control a PID if it no longer matches the exact ARYQEN-owned command.
    clearRuntimeRecord();
  } else if (record) {
    clearRuntimeRecord();
  }

  if (root) {
    const unmanagedPid = findUnmanagedRuntime(root);
    if (unmanagedPid) {
      return {
        state: "RUNNING_UNMANAGED" as const,
        running: true,
        managed: false,
        pid: unmanagedPid,
        startedAt: null,
        root,
        distPath: runtimeDist(root),
      };
    }
  }

  return {
    state: "STOPPED" as const,
    running: false,
    managed: false,
    pid: null,
    startedAt: null,
    root,
    distPath: root ? runtimeDist(root) : null,
  };
}

export function getControlStatus(): ControlStatus {
  const runtime = inspectRuntime();
  const preflight = getRuntimePreflight();

  return {
    mode: "BOUNDED_LOCAL_CONTROL",
    preflight,
    runtime: {
      state: runtime.state,
      running: runtime.running,
      managed: runtime.managed,
      pid: runtime.pid,
      startedAt: runtime.startedAt,
    },
    capabilities: {
      start: !runtime.running && preflight.runtimeReady,
      stopManaged: runtime.running && runtime.managed,
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
      runtime: [
        "--run",
        "--status",
        "--setup",
        "--configure",
        "--pick-model",
        "--init",
        "--provision",
      ],
      creatorCli: ["status", "logs", "fund", "send"],
    },
  };
}

export function getControlAudit(limit = 40): ControlAuditEntry[] {
  try {
    const lines = fs
      .readFileSync(AUDIT_FILE, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-Math.max(1, Math.min(limit, 100)));

    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as ControlAuditEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is ControlAuditEntry => entry !== null)
      .reverse();
  } catch {
    return [];
  }
}

export async function startManagedRuntime() {
  const current = inspectRuntime();

  if (current.running) {
    const detail = current.managed
      ? "ARYQEN-managed Automaton runtime is already running"
      : "An Automaton runtime is already running outside ARYQEN control";

    audit({
      action: "START",
      outcome: "REFUSED",
      pid: current.pid,
      detail,
    });

    return {
      ok: false,
      code: current.managed ? "ALREADY_RUNNING" : "UNMANAGED_RUNTIME_PRESENT",
      message: detail,
      status: getControlStatus(),
    };
  }

  const preflight = getRuntimePreflight();
  if (!preflight.runtimeReady) {
    const detail =
      preflight.blocker === "CONWAY_API_KEY_MISSING"
        ? "Conway API key is missing; native Automaton provisioning remains upstream-owned"
        : preflight.blocker === "RUNTIME_BUILD_MISSING"
          ? "Automaton runtime build is missing"
          : "ARYQEN repository root could not be resolved";

    audit({
      action: "START",
      outcome: "BLOCKED",
      pid: null,
      detail,
    });

    return {
      ok: false,
      code: preflight.blocker ?? "PREFLIGHT_BLOCKED",
      message: detail,
      status: getControlStatus(),
    };
  }

  const root = current.root;
  const distPath = current.distPath;
  if (!root || !distPath) {
    audit({
      action: "START",
      outcome: "FAILED",
      pid: null,
      detail: "Repository root could not be resolved",
    });
    return {
      ok: false,
      code: "REPO_NOT_FOUND",
      message: "ARYQEN repository root could not be resolved.",
      status: getControlStatus(),
    };
  }

  if (!fs.existsSync(distPath)) {
    audit({
      action: "START",
      outcome: "FAILED",
      pid: null,
      detail: "Root dist/index.js is missing",
    });
    return {
      ok: false,
      code: "BUILD_REQUIRED",
      message: "Automaton runtime build is missing. Run the root build before starting.",
      status: getControlStatus(),
    };
  }

  ensureControlDir();
  const logFd = fs.openSync(RUNTIME_LOG, "a", 0o600);

  let child;
  try {
    child = spawn(process.execPath, [distPath, "--run"], {
      cwd: root,
      env: process.env,
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
  } finally {
    fs.closeSync(logFd);
  }

  if (!child.pid) {
    audit({
      action: "START",
      outcome: "FAILED",
      pid: null,
      detail: "Node did not return a child PID",
    });
    return {
      ok: false,
      code: "NO_PID",
      message: "Automaton runtime could not be started.",
      status: getControlStatus(),
    };
  }

  const record: RuntimeRecord = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    repoRoot: root,
    distPath,
  };

  writeRuntimeRecord(record);
  child.unref();

  await new Promise((resolve) => setTimeout(resolve, 1200));

  if (!isAlive(record.pid) || !isExpectedRuntimeCommand(processCommand(record.pid), distPath)) {
    clearRuntimeRecord();
    audit({
      action: "START",
      outcome: "FAILED",
      pid: record.pid,
      detail: `Runtime exited during startup. Inspect ${RUNTIME_LOG}`,
    });
    return {
      ok: false,
      code: "STARTUP_EXIT",
      message: "Automaton exited during startup. Check the ARYQEN runtime log.",
      logPath: RUNTIME_LOG,
      status: getControlStatus(),
    };
  }

  audit({
    action: "START",
    outcome: "STARTED",
    pid: record.pid,
    detail: "Native Automaton --run launched by ARYQEN",
  });

  return {
    ok: true,
    code: "STARTED",
    message: "Automaton runtime started through its native --run entry point.",
    status: getControlStatus(),
  };
}

export async function stopManagedRuntime() {
  const current = inspectRuntime();

  if (!current.running) {
    audit({
      action: "STOP",
      outcome: "NOOP",
      pid: null,
      detail: "Runtime already stopped",
    });
    return {
      ok: true,
      code: "ALREADY_STOPPED",
      message: "Automaton runtime is already stopped.",
      status: getControlStatus(),
    };
  }

  if (!current.managed || current.pid == null) {
    audit({
      action: "STOP",
      outcome: "REFUSED",
      pid: current.pid,
      detail: "ARYQEN will not signal an unmanaged Automaton process",
    });
    return {
      ok: false,
      code: "UNMANAGED_RUNTIME",
      message: "Runtime is not owned by ARYQEN. Stop was refused.",
      status: getControlStatus(),
    };
  }

  const command = processCommand(current.pid);
  if (!current.distPath || !isExpectedRuntimeCommand(command, current.distPath)) {
    clearRuntimeRecord();
    audit({
      action: "STOP",
      outcome: "REFUSED",
      pid: current.pid,
      detail: "PID command verification failed",
    });
    return {
      ok: false,
      code: "PID_VERIFICATION_FAILED",
      message: "PID verification failed. No signal was sent.",
      status: getControlStatus(),
    };
  }

  process.kill(current.pid, "SIGTERM");

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!isAlive(current.pid)) {
      clearRuntimeRecord();
      audit({
        action: "STOP",
        outcome: "STOPPED",
        pid: current.pid,
        detail: "Native runtime handled SIGTERM graceful shutdown",
      });
      return {
        ok: true,
        code: "STOPPED",
        message: "Automaton stopped gracefully through SIGTERM.",
        status: getControlStatus(),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  // Deliberately no SIGKILL fallback in V1.7.
  audit({
    action: "STOP",
    outcome: "PENDING",
    pid: current.pid,
    detail: "Runtime did not exit within 5s; no force-kill was attempted",
  });

  return {
    ok: false,
    code: "STOP_PENDING",
    message: "Graceful stop is still pending. ARYQEN did not force-kill the runtime.",
    status: getControlStatus(),
  };
}
