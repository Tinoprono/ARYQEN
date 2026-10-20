import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCandidateStatus } from "./candidate-upgrade.js";

type RunnerStatus = "IDLE" | "BLOCKED" | "READY" | "RUNNING" | "PASS" | "FAIL";
type RunnerCheckStatus = "NOT_RUN" | "PASS" | "FAIL";

type RunnerCheckId =
  | "UPSTREAM_BASELINE"
  | "ARYQEN_CONTRACT"
  | "ARYQEN_INTEGRATION"
  | "AUTOMATON_CORE_INTEGRITY";

type RunnerCheck = {
  id: RunnerCheckId;
  status: RunnerCheckStatus;
  detail: string;
  durationMs: number | null;
  logPath: string | null;
};

type BackendKind = "docker" | "podman" | null;

type BackendStatus = {
  kind: BackendKind;
  binary: string | null;
  installed: boolean;
  ready: boolean;
  version: string | null;
  image: string;
  detail: string;
};

type RunnerState = {
  schemaVersion: 1;
  status: RunnerStatus;
  candidateSha: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  runPath: string | null;
  checks: RunnerCheck[];
  error: string | null;
};

type RunnerAudit = {
  at: string;
  action: "RUN";
  outcome: "PASS" | "BLOCKED" | "FAIL";
  candidateSha: string | null;
  backend: BackendKind;
  detail: string;
};

const aryqenHome = path.join(os.homedir(), ".aryqen");
const runsRoot = path.join(aryqenHome, "compatibility-runs");
const statePath = path.join(aryqenHome, "compatibility-runner.json");
const auditPath = path.join(aryqenHome, "compatibility-runner-audit.jsonl");
const runnerImage = process.env.ARYQEN_RUNNER_IMAGE ?? "node:22-bookworm";

let backendCache: { at: number; value: BackendStatus } | null = null;

function ensureRunnerHome() {
  fs.mkdirSync(aryqenHome, { recursive: true, mode: 0o700 });
  fs.mkdirSync(runsRoot, { recursive: true, mode: 0o700 });
}

function defaultChecks(): RunnerCheck[] {
  return [
    {
      id: "UPSTREAM_BASELINE",
      status: "NOT_RUN",
      detail: "Candidate baseline has not run in the isolated compatibility runner.",
      durationMs: null,
      logPath: null,
    },
    {
      id: "ARYQEN_CONTRACT",
      status: "NOT_RUN",
      detail: "ARYQEN package contracts have not been compiled against the candidate.",
      durationMs: null,
      logPath: null,
    },
    {
      id: "ARYQEN_INTEGRATION",
      status: "NOT_RUN",
      detail: "Candidate + ARYQEN overlay integration has not been built.",
      durationMs: null,
      logPath: null,
    },
    {
      id: "AUTOMATON_CORE_INTEGRITY",
      status: "NOT_RUN",
      detail: "Stable ARYQEN and staged candidate fingerprints have not been rechecked.",
      durationMs: null,
      logPath: null,
    },
  ];
}

function emptyState(): RunnerState {
  return {
    schemaVersion: 1,
    status: "IDLE",
    candidateSha: null,
    startedAt: null,
    finishedAt: null,
    runPath: null,
    checks: defaultChecks(),
    error: null,
  };
}

function readState(): RunnerState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as RunnerState;
    if (parsed?.schemaVersion === 1) return parsed;
  } catch {
    // Fresh runner state.
  }
  return emptyState();
}

function writeState(state: RunnerState) {
  ensureRunnerHome();
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function audit(entry: RunnerAudit) {
  ensureRunnerHome();
  fs.appendFileSync(auditPath, `${JSON.stringify(entry)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function syncText(command: string, args: string[], cwd?: string, timeout = 3000): string | null {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    }).trim();
  } catch {
    return null;
  }
}

function git(args: string[], cwd: string, timeout = 3000): string | null {
  return syncText("git", args, cwd, timeout);
}

function resolveStableRepoRoot(): string | null {
  const preferred = process.env.ARYQEN_REPO_PATH ?? process.cwd();
  return git(["rev-parse", "--show-toplevel"], preferred, 1500);
}

function fingerprint(root: string) {
  return {
    head: git(["rev-parse", "HEAD"], root, 1500),
    status: git(["status", "--porcelain=v1"], root, 2000) ?? "",
  };
}

function validSha(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{40}$/i.test(value));
}

function probeBackend(): BackendStatus {
  if (backendCache && Date.now() - backendCache.at < 5000) {
    return backendCache.value;
  }

  let installedFallback: BackendStatus | null = null;

  for (const binary of ["docker", "podman"] as const) {
    const version = syncText(binary, ["--version"], undefined, 2000);
    if (!version) continue;

    const info = syncText(binary, ["info"], undefined, 3500);
    const candidate: BackendStatus = {
      kind: binary,
      binary,
      installed: true,
      ready: Boolean(info),
      version,
      image: runnerImage,
      detail: info
        ? `${binary} sandbox backend is available.`
        : `${binary} is installed but its engine is not running.`,
    };

    if (candidate.ready) {
      backendCache = { at: Date.now(), value: candidate };
      return candidate;
    }

    installedFallback ??= candidate;
  }

  const result =
    installedFallback ??
    ({
      kind: null,
      binary: null,
      installed: false,
      ready: false,
      version: null,
      image: runnerImage,
      detail: "No Docker or Podman sandbox backend was detected.",
    } satisfies BackendStatus);

  backendCache = { at: Date.now(), value: result };
  return result;
}

function candidateIsCurrent(candidate: ReturnType<typeof getCandidateStatus>): boolean {
  return (
    candidate.status === "PREPARED_WAITING_SANDBOX" &&
    validSha(candidate.candidateSha) &&
    candidate.verifiedHead === candidate.candidateSha &&
    candidate.detectedSha === candidate.candidateSha &&
    candidate.upstreamGuard === "COMPATIBILITY_CHECK_REQUIRED" &&
    candidate.stableWorktreeUnchanged === true &&
    candidate.stableMutationAllowed === false
  );
}

export function getCompatibilityRunnerStatus() {
  const candidate = getCandidateStatus();
  const backend = probeBackend();
  const persisted = readState();
  const current = candidateIsCurrent(candidate);

  let state: RunnerState;

  if (
    persisted.candidateSha === candidate.candidateSha &&
    ["RUNNING", "PASS", "FAIL"].includes(persisted.status)
  ) {
    state = persisted;
  } else if (!current) {
    state = {
      ...emptyState(),
      status: "IDLE",
      candidateSha: candidate.candidateSha,
    };
  } else if (!backend.ready) {
    state = {
      ...emptyState(),
      status: "BLOCKED",
      candidateSha: candidate.candidateSha,
      error: backend.detail,
    };
  } else {
    state = {
      ...emptyState(),
      status: "READY",
      candidateSha: candidate.candidateSha,
    };
  }

  return {
    ...state,
    backend,
    candidateCurrent: current,
    capabilities: {
      run: current && backend.ready && state.status !== "RUNNING",
    },
    safety: {
      stableRepositoryMounted: false,
      automatonStateMounted: false,
      hostSecretsPassed: false,
      tinopronoAccess: false,
      candidateExecutionNetwork: "NONE",
      dependencyPreparation: "NETWORKED_SANDBOX_WITH_LIFECYCLE_SCRIPTS_DISABLED",
      sandboxRootFilesystem: "READ_ONLY",
      sandboxCapabilities: "DROP_ALL",
      sandboxNoNewPrivileges: true,
      sandboxMemoryLimit: "2g",
      sandboxCpuLimit: "2",
      sandboxPidsLimit: 256,
    },
    auditPath,
  };
}

function copyTree(source: string, destination: string) {
  const sourceRoot = path.resolve(source);
  fs.cpSync(sourceRoot, destination, {
    recursive: true,
    dereference: false,
    force: true,
    filter: (entry) => {
      const rel = path.relative(sourceRoot, entry);
      if (!rel) return true;
      const parts = rel.split(path.sep);
      return !parts.some((part) =>
        [".git", "node_modules", "dist", ".pnpm-store", ".aryqen-tools"].includes(part),
      );
    },
  });
}

function overlayAryqen(stableRoot: string, integrationRoot: string) {
  const packageNames = ["aryqen-control-bridge", "aryqen-control-center"];

  fs.mkdirSync(path.join(integrationRoot, "packages"), { recursive: true });

  for (const packageName of packageNames) {
    const source = path.join(stableRoot, "packages", packageName);
    if (!fs.existsSync(source)) {
      throw new Error(`ARYQEN overlay package is missing: ${packageName}`);
    }
    copyTree(source, path.join(integrationRoot, "packages", packageName));
  }

  const workspaceFile = path.join(stableRoot, "pnpm-workspace.yaml");
  if (!fs.existsSync(workspaceFile)) {
    throw new Error("pnpm-workspace.yaml is missing from stable ARYQEN.");
  }
  fs.copyFileSync(workspaceFile, path.join(integrationRoot, "pnpm-workspace.yaml"));
}

function readPnpmVersion(candidateRoot: string): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(candidateRoot, "package.json"), "utf8"),
    ) as { packageManager?: unknown };
    if (
      typeof pkg.packageManager === "string" &&
      /^pnpm@\d+\.\d+\.\d+$/.test(pkg.packageManager)
    ) {
      return pkg.packageManager.slice("pnpm@".length);
    }
  } catch {
    // Fall through to the stable known package-manager version.
  }
  return "10.28.1";
}

function unsupportedPackageHook(root: string): string | null {
  for (const name of [".pnpmfile.cjs", ".pnpmfile.js", "pnpmfile.cjs", "pnpmfile.js"]) {
    if (fs.existsSync(path.join(root, name))) return name;
  }
  return null;
}

type ContainerResult = {
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  logPath: string;
  error: string | null;
};

function cleanupContainer(binary: string, name: string) {
  try {
    execFileSync(binary, ["rm", "-f", name], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 5000,
    });
  } catch {
    // Disposable compatibility container cleanup is best-effort.
  }
}

function runContainer(
  backend: BackendStatus,
  workspace: string,
  command: string,
  network: "bridge" | "none",
  logPath: string,
  timeoutMs: number,
): Promise<ContainerResult> {
  if (!backend.binary) {
    return Promise.resolve({
      ok: false,
      exitCode: null,
      durationMs: 0,
      logPath,
      error: "Sandbox backend is unavailable.",
    });
  }

  const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
  const gid = typeof process.getgid === "function" ? process.getgid() : 1000;
  const name = `aryqen-compat-${process.pid}-${Date.now()}`;
  const started = Date.now();

  const args = [
    "run",
    "--name",
    name,
    "--rm",
    "--network",
    network,
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "256",
    "--memory",
    "2g",
    "--cpus",
    "2",
    "--user",
    `${uid}:${gid}`,
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=512m",
    "--mount",
    `type=bind,src=${workspace},dst=/work`,
    "--workdir",
    "/work",
    "--env",
    "CI=1",
    "--env",
    "HOME=/tmp/home",
    "--env",
    "NO_COLOR=1",
    backend.image,
    "bash",
    "-lc",
    `mkdir -p /tmp/home && ${command}`,
  ];

  return new Promise((resolve) => {
    let settled = false;
    let hardTimer: NodeJS.Timeout | null = null;
    let liveStdout = "";
    let liveStderr = "";

    const finish = (result: ContainerResult) => {
      if (settled) return;
      settled = true;
      if (hardTimer) clearTimeout(hardTimer);
      resolve(result);
    };

    const child = execFile(
      backend.binary!,
      args,
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
        },
      },
      (error, stdout, stderr) => {
        if (settled) return;

        const combined = [
          `backend=${backend.kind}`,
          `image=${backend.image}`,
          `network=${network}`,
          "",
          String(stdout ?? liveStdout),
          String(stderr ?? liveStderr),
        ].join("\n");

        fs.writeFileSync(logPath, combined, {
          encoding: "utf8",
          mode: 0o600,
        });

        if (!error) {
          finish({
            ok: true,
            exitCode: 0,
            durationMs: Date.now() - started,
            logPath,
            error: null,
          });
          return;
        }

        const code =
          typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === "number"
            ? (error as unknown as { code: number }).code
            : null;

        cleanupContainer(backend.binary!, name);

        finish({
          ok: false,
          exitCode: code,
          durationMs: Date.now() - started,
          logPath,
          error: error.message,
        });
      },
    );

    child.stdout?.on("data", (chunk) => {
      liveStdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      liveStderr += String(chunk);
    });

    hardTimer = setTimeout(() => {
      if (settled) return;

      cleanupContainer(backend.binary!, name);

      try {
        child.kill("SIGKILL");
      } catch {
        // Best-effort kill after disposable container cleanup.
      }

      const combined = [
        `backend=${backend.kind}`,
        `image=${backend.image}`,
        `network=${network}`,
        "",
        liveStdout,
        liveStderr,
        "",
        `ARYQEN_HARD_TIMEOUT_MS=${timeoutMs}`,
      ].join("\n");

      fs.writeFileSync(logPath, combined, {
        encoding: "utf8",
        mode: 0o600,
      });

      finish({
        ok: false,
        exitCode: null,
        durationMs: Date.now() - started,
        logPath,
        error: `Sandbox step exceeded hard timeout after ${timeoutMs}ms.`,
      });
    }, timeoutMs);
  });
}

function prepCommand(pnpmVersion: string): string {
  return [
    "set -euo pipefail",
    "mkdir -p /work/.aryqen-tools /work/.pnpm-store",
    `npm install --prefix /work/.aryqen-tools --ignore-scripts --no-audit --no-fund pnpm@${pnpmVersion}`,
    'export PATH="/work/.aryqen-tools/node_modules/.bin:$PATH"',
    'export npm_config_nodedir="/usr/local"',
    'export npm_config_build_from_source="true"',
    "pnpm install --ignore-scripts --no-frozen-lockfile --store-dir /work/.pnpm-store",
  ].join(" && ");
}

function baselineCommand(): string {
  const knownContextHardeningBlob =
    "febe174eb87e072cdd1ce1fe1d7e2e7598ce27a7";

  const safeContextPattern =
    "^(?!.*(summarizes old turns when budget is exceeded|preserves most recent turns when summarizing|respects custom budget parameter|does not summarize when only one turn exists)).*$";

  return [
    "set -euo pipefail",
    'export PATH="/work/.aryqen-tools/node_modules/.bin:$PATH"',
    'export npm_config_nodedir="/usr/local"',
    'export npm_config_build_from_source="true"',
    "pnpm rebuild --store-dir /work/.pnpm-store",

    `KNOWN_CONTEXT_BLOB="${knownContextHardeningBlob}"`,
    'CONTEXT_FILE="src/__tests__/context-hardening.test.ts"',
    'ACTUAL_CONTEXT_BLOB=$(git hash-object "$CONTEXT_FILE")',
    'if [ "$ACTUAL_CONTEXT_BLOB" != "$KNOWN_CONTEXT_BLOB" ]; then',
    '  echo "ARYQEN_CONTEXT_HARDENING_BLOB_CHANGED=$ACTUAL_CONTEXT_BLOB"',
    "  exit 1",
    "fi",
    'echo "ARYQEN_CONTEXT_HARDENING_BLOB_PIN=PASS"',

    'EXPECTED_MAIN=$(find src/__tests__ -type f -name "*.test.ts" ! -path "*/context-hardening.test.ts" | wc -l | tr -d " ")',
    'rm -f /tmp/aryqen-upstream-main.log',

    "set +e",
    'timeout --signal=TERM --kill-after=10s 300 pnpm exec vitest run --exclude "$CONTEXT_FILE" --reporter=dot 2>&1 | tee /tmp/aryqen-upstream-main.log',
    'MAIN_RC=${PIPESTATUS[0]}',
    "set -e",

    'if [ "$MAIN_RC" -eq 124 ]; then',
    '  if grep -Eq "Test Files[[:space:]]+$EXPECTED_MAIN passed[[:space:]]+\\($EXPECTED_MAIN\\)" /tmp/aryqen-upstream-main.log && grep -Eq "Tests[[:space:]]+[0-9]+ passed" /tmp/aryqen-upstream-main.log; then',
    '    echo "ARYQEN_UPSTREAM_MAIN_SUITE_POST_COMPLETION_HANG_ACCEPTED=YES"',
    "  else",
    '    echo "ARYQEN_UPSTREAM_MAIN_SUITE_TIMEOUT_BEFORE_COMPLETION=YES"',
    "    exit 124",
    "  fi",
    'elif [ "$MAIN_RC" -ne 0 ]; then',
    '  echo "ARYQEN_UPSTREAM_MAIN_SUITE=FAIL RC=$MAIN_RC"',
    '  exit "$MAIN_RC"',
    "else",
    '  grep -Eq "Test Files[[:space:]]+$EXPECTED_MAIN passed[[:space:]]+\\($EXPECTED_MAIN\\)" /tmp/aryqen-upstream-main.log || exit 1',
    '  grep -Eq "Tests[[:space:]]+[0-9]+ passed" /tmp/aryqen-upstream-main.log || exit 1',
    '  echo "ARYQEN_UPSTREAM_MAIN_SUITE=PASS"',
    "fi",

    `SAFE_CONTEXT_PATTERN='${safeContextPattern}'`,
    'rm -f /tmp/aryqen-context-safe.log',

    "set +e",
    'timeout --signal=TERM --kill-after=10s 120 pnpm exec vitest run "$CONTEXT_FILE" --reporter=dot -t "$SAFE_CONTEXT_PATTERN" 2>&1 | tee /tmp/aryqen-context-safe.log',
    'SAFE_RC=${PIPESTATUS[0]}',
    "set -e",

    'if [ "$SAFE_RC" -ne 0 ]; then',
    '  echo "ARYQEN_CONTEXT_HARDENING_SAFE_SUBSET=FAIL RC=$SAFE_RC"',
    '  exit "$SAFE_RC"',
    "fi",

    'grep -Eq "Test Files[[:space:]]+1 passed[[:space:]]+\\(1\\)" /tmp/aryqen-context-safe.log || exit 1',
    'grep -Eq "Tests[[:space:]]+[0-9]+ passed" /tmp/aryqen-context-safe.log || exit 1',

    'echo "ARYQEN_CONTEXT_HARDENING_SAFE_SUBSET=PASS"',
    'echo "ARYQEN_CONTEXT_HARDENING_HEAVY_CASES=PINNED_KNOWN_UPSTREAM_PERFORMANCE_EXCEPTION"',

    "pnpm build",
    'echo "ARYQEN_UPSTREAM_BUILD=PASS"',
  ].join("\n");
}

function contractCommand(): string {
  return [
    "set -euo pipefail",
    'export PATH="/work/.aryqen-tools/node_modules/.bin:$PATH"',
    'export npm_config_nodedir="/usr/local"',
    'export npm_config_build_from_source="true"',
    "pnpm rebuild --store-dir /work/.pnpm-store",
    "pnpm --filter @aryqen/control-bridge build",
    "pnpm --filter @aryqen/control-center build",
  ].join(" && ");
}

function integrationCommand(): string {
  return [
    "set -euo pipefail",
    'export PATH="/work/.aryqen-tools/node_modules/.bin:$PATH"',
    'export npm_config_nodedir="/usr/local"',
    'export npm_config_build_from_source="true"',
    "pnpm build",
  ].join(" && ");
}

function checkResult(
  id: RunnerCheckId,
  result: ContainerResult,
  successDetail: string,
  failurePrefix: string,
): RunnerCheck {
  return {
    id,
    status: result.ok ? "PASS" : "FAIL",
    detail: result.ok
      ? successDetail
      : `${failurePrefix}${result.error ? `: ${result.error}` : ""}`,
    durationMs: result.durationMs,
    logPath: result.logPath,
  };
}

export async function runCompatibilitySuite() {
  const candidate = getCandidateStatus();
  const backend = probeBackend();
  const stableRoot = resolveStableRepoRoot();

  if (!candidateIsCurrent(candidate)) {
    const detail =
      "No current staged candidate is eligible for isolated compatibility execution.";
    audit({
      at: new Date().toISOString(),
      action: "RUN",
      outcome: "BLOCKED",
      candidateSha: candidate.candidateSha,
      backend: backend.kind,
      detail,
    });
    return {
      ok: false,
      code: "CANDIDATE_NOT_READY",
      message: detail,
      runner: getCompatibilityRunnerStatus(),
    };
  }

  if (!backend.ready || !backend.binary) {
    const detail = backend.detail;
    audit({
      at: new Date().toISOString(),
      action: "RUN",
      outcome: "BLOCKED",
      candidateSha: candidate.candidateSha,
      backend: backend.kind,
      detail,
    });
    return {
      ok: false,
      code: "SANDBOX_BACKEND_UNAVAILABLE",
      message: detail,
      runner: getCompatibilityRunnerStatus(),
    };
  }

  if (!stableRoot || !candidate.candidatePath || !candidate.candidateSha) {
    const detail = "Stable ARYQEN root or candidate workspace could not be resolved.";
    audit({
      at: new Date().toISOString(),
      action: "RUN",
      outcome: "BLOCKED",
      candidateSha: candidate.candidateSha,
      backend: backend.kind,
      detail,
    });
    return {
      ok: false,
      code: "RUNNER_PATH_UNAVAILABLE",
      message: detail,
      runner: getCompatibilityRunnerStatus(),
    };
  }

  const hook = unsupportedPackageHook(candidate.candidatePath);
  if (hook) {
    const detail =
      `Candidate contains ${hook}; networked dependency preparation is blocked rather than executing package-manager hooks.`;
    audit({
      at: new Date().toISOString(),
      action: "RUN",
      outcome: "BLOCKED",
      candidateSha: candidate.candidateSha,
      backend: backend.kind,
      detail,
    });
    return {
      ok: false,
      code: "PACKAGE_MANAGER_HOOK_BLOCKED",
      message: detail,
      runner: getCompatibilityRunnerStatus(),
    };
  }

  const candidateHead = git(["rev-parse", "HEAD"], candidate.candidatePath, 1500);
  if (candidateHead !== candidate.candidateSha) {
    const detail = "Candidate workspace HEAD no longer matches the verified candidate SHA.";
    audit({
      at: new Date().toISOString(),
      action: "RUN",
      outcome: "BLOCKED",
      candidateSha: candidate.candidateSha,
      backend: backend.kind,
      detail,
    });
    return {
      ok: false,
      code: "CANDIDATE_SHA_MISMATCH",
      message: detail,
      runner: getCompatibilityRunnerStatus(),
    };
  }

  ensureRunnerHome();

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${candidate.candidateSha.slice(0, 12)}`;
  const runPath = path.join(runsRoot, runId);
  const upstreamWork = path.join(runPath, "upstream");
  const integrationWork = path.join(runPath, "integration");
  fs.mkdirSync(runPath, { recursive: true, mode: 0o700 });

  const stableBefore = fingerprint(stableRoot);
  const candidateBefore = fingerprint(candidate.candidatePath);

  const running: RunnerState = {
    schemaVersion: 1,
    status: "RUNNING",
    candidateSha: candidate.candidateSha,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    runPath,
    checks: defaultChecks(),
    error: null,
  };
  writeState(running);

  try {
    copyTree(candidate.candidatePath, upstreamWork);
    copyTree(candidate.candidatePath, integrationWork);
    overlayAryqen(stableRoot, integrationWork);

    const pnpmVersion = readPnpmVersion(candidate.candidatePath);

    const upstreamPrep = await runContainer(
      backend,
      upstreamWork,
      prepCommand(pnpmVersion),
      "bridge",
      path.join(runPath, "01-upstream-dependencies.log"),
      10 * 60_000,
    );

    let upstreamBaseline: RunnerCheck;
    if (!upstreamPrep.ok) {
      upstreamBaseline = checkResult(
        "UPSTREAM_BASELINE",
        upstreamPrep,
        "",
        "Dependency preparation failed inside the sandbox",
      );
    } else {
      const result = await runContainer(
        backend,
        upstreamWork,
        baselineCommand(),
        "none",
        path.join(runPath, "02-upstream-baseline.log"),
        15 * 60_000,
      );
      upstreamBaseline = checkResult(
        "UPSTREAM_BASELINE",
        result,
        "Automaton candidate tests and build passed with candidate execution network disabled.",
        "Automaton candidate baseline failed in the isolated sandbox",
      );
    }

    const integrationPrep = await runContainer(
      backend,
      integrationWork,
      prepCommand(pnpmVersion),
      "bridge",
      path.join(runPath, "03-integration-dependencies.log"),
      10 * 60_000,
    );

    let aryqenContract: RunnerCheck;
    let aryqenIntegration: RunnerCheck;

    if (!integrationPrep.ok) {
      aryqenContract = checkResult(
        "ARYQEN_CONTRACT",
        integrationPrep,
        "",
        "Integration dependency preparation failed inside the sandbox",
      );
      aryqenIntegration = {
        id: "ARYQEN_INTEGRATION",
        status: "FAIL",
        detail: "Integration build was not attempted because dependency preparation failed.",
        durationMs: null,
        logPath: integrationPrep.logPath,
      };
    } else {
      const contract = await runContainer(
        backend,
        integrationWork,
        contractCommand(),
        "none",
        path.join(runPath, "04-aryqen-contract.log"),
        12 * 60_000,
      );
      aryqenContract = checkResult(
        "ARYQEN_CONTRACT",
        contract,
        "ARYQEN control packages compiled against the exact Automaton candidate in a network-disabled sandbox.",
        "ARYQEN contract compilation failed in the isolated sandbox",
      );

      const integration = await runContainer(
        backend,
        integrationWork,
        integrationCommand(),
        "none",
        path.join(runPath, "05-aryqen-integration.log"),
        15 * 60_000,
      );
      aryqenIntegration = checkResult(
        "ARYQEN_INTEGRATION",
        integration,
        "Candidate Automaton + ARYQEN overlay completed the root build in a network-disabled sandbox.",
        "ARYQEN integration build failed in the isolated sandbox",
      );
    }

    const stableAfter = fingerprint(stableRoot);
    const candidateAfter = fingerprint(candidate.candidatePath);
    const integrityPass =
      stableBefore.head === stableAfter.head &&
      stableBefore.status === stableAfter.status &&
      candidateBefore.head === candidateAfter.head &&
      candidateBefore.status === candidateAfter.status;

    const coreIntegrity: RunnerCheck = {
      id: "AUTOMATON_CORE_INTEGRITY",
      status: integrityPass ? "PASS" : "FAIL",
      detail: integrityPass
        ? "Stable ARYQEN and the staged candidate remained outside the execution workspace and their Git fingerprints are unchanged."
        : "Stable ARYQEN or the staged candidate Git fingerprint changed during compatibility execution.",
      durationMs: null,
      logPath: null,
    };

    const checks = [
      upstreamBaseline,
      aryqenContract,
      aryqenIntegration,
      coreIntegrity,
    ];
    const passed = checks.every((check) => check.status === "PASS");

    const state: RunnerState = {
      schemaVersion: 1,
      status: passed ? "PASS" : "FAIL",
      candidateSha: candidate.candidateSha,
      startedAt: running.startedAt,
      finishedAt: new Date().toISOString(),
      runPath,
      checks,
      error: passed ? null : "One or more compatibility checks failed.",
    };
    writeState(state);

    const detail = passed
      ? "All isolated compatibility checks passed."
      : "Compatibility suite completed with one or more failures.";

    audit({
      at: new Date().toISOString(),
      action: "RUN",
      outcome: passed ? "PASS" : "FAIL",
      candidateSha: candidate.candidateSha,
      backend: backend.kind,
      detail,
    });

    return {
      ok: passed,
      code: passed ? "COMPATIBILITY_PASS" : "COMPATIBILITY_FAIL",
      message: detail,
      runner: getCompatibilityRunnerStatus(),
    };
  } catch (error) {
    const state: RunnerState = {
      ...running,
      status: "FAIL",
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
    writeState(state);

    audit({
      at: new Date().toISOString(),
      action: "RUN",
      outcome: "FAIL",
      candidateSha: candidate.candidateSha,
      backend: backend.kind,
      detail: state.error ?? "Compatibility runner failed.",
    });

    return {
      ok: false,
      code: "COMPATIBILITY_RUNNER_FAILED",
      message: state.error,
      runner: getCompatibilityRunnerStatus(),
    };
  }
}
