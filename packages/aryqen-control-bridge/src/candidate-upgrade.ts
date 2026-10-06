import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLiveUpstream } from "./observability.js";

type CandidateStatus =
  | "IDLE"
  | "PREPARING"
  | "PREPARED_WAITING_SANDBOX"
  | "FAILED";

type CandidateCheckStatus =
  | "PASS"
  | "STANDBY"
  | "BLOCKED_NO_SANDBOX"
  | "FAIL";

type CandidateCheck = {
  id:
    | "SOURCE_CAPTURE"
    | "SHA_VERIFICATION"
    | "STABLE_REPO_IMMUTABILITY"
    | "UPSTREAM_BASELINE"
    | "ARYQEN_CONTRACT"
    | "ARYQEN_INTEGRATION"
    | "AUTOMATON_CORE_INTEGRITY";
  status: CandidateCheckStatus;
  detail: string;
};

type CandidateState = {
  schemaVersion: 1;
  status: CandidateStatus;
  candidateSha: string | null;
  sourceRemote: string | null;
  candidatePath: string | null;
  preparedAt: string | null;
  verifiedHead: string | null;
  stableHeadBefore: string | null;
  stableHeadAfter: string | null;
  stableWorktreeUnchanged: boolean | null;
  executionPolicy: "NO_UPSTREAM_CODE_EXECUTION_WITHOUT_SANDBOX";
  testExecution: "NOT_STARTED" | "BLOCKED_NO_SANDBOX";
  checks: CandidateCheck[];
  error: string | null;
};

type CandidateAuditEntry = {
  at: string;
  action: "PREPARE";
  outcome: "PASS" | "BLOCKED" | "FAILED";
  candidateSha: string | null;
  detail: string;
};

const aryqenHome = path.join(os.homedir(), ".aryqen");
const candidatesRoot = path.join(aryqenHome, "candidates");
const statePath = path.join(aryqenHome, "upstream-candidate.json");
const auditPath = path.join(aryqenHome, "upstream-candidate-audit.jsonl");

function ensureHome() {
  fs.mkdirSync(aryqenHome, { recursive: true, mode: 0o700 });
  fs.mkdirSync(candidatesRoot, { recursive: true, mode: 0o700 });
}

function gitSync(args: string[], cwd: string, timeout = 4000): string | null {
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

function execGit(args: string[], cwd: string, timeout = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        encoding: "utf8",
        timeout,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              String(stderr || stdout || error.message).trim() || "git command failed",
            ),
          );
          return;
        }
        resolve(String(stdout).trim());
      },
    );
  });
}

function resolveStableRepoRoot(): string | null {
  const preferred = process.env.ARYQEN_REPO_PATH ?? process.cwd();
  return gitSync(["rev-parse", "--show-toplevel"], preferred, 1500);
}

function emptyChecks(): CandidateCheck[] {
  return [
    {
      id: "SOURCE_CAPTURE",
      status: "STANDBY",
      detail: "Waiting for an upstream candidate.",
    },
    {
      id: "SHA_VERIFICATION",
      status: "STANDBY",
      detail: "Candidate commit has not been verified yet.",
    },
    {
      id: "STABLE_REPO_IMMUTABILITY",
      status: "STANDBY",
      detail: "Stable repository has not been compared around candidate staging yet.",
    },
    {
      id: "UPSTREAM_BASELINE",
      status: "BLOCKED_NO_SANDBOX",
      detail: "No upstream code execution is allowed on the host without an isolated sandbox.",
    },
    {
      id: "ARYQEN_CONTRACT",
      status: "BLOCKED_NO_SANDBOX",
      detail: "Compatibility execution is deferred to the isolated test runner.",
    },
    {
      id: "ARYQEN_INTEGRATION",
      status: "BLOCKED_NO_SANDBOX",
      detail: "Compatibility execution is deferred to the isolated test runner.",
    },
    {
      id: "AUTOMATON_CORE_INTEGRITY",
      status: "BLOCKED_NO_SANDBOX",
      detail: "Runtime code execution is deferred; stable repository mutation remains forbidden.",
    },
  ];
}

function emptyState(): CandidateState {
  return {
    schemaVersion: 1,
    status: "IDLE",
    candidateSha: null,
    sourceRemote: null,
    candidatePath: null,
    preparedAt: null,
    verifiedHead: null,
    stableHeadBefore: null,
    stableHeadAfter: null,
    stableWorktreeUnchanged: null,
    executionPolicy: "NO_UPSTREAM_CODE_EXECUTION_WITHOUT_SANDBOX",
    testExecution: "NOT_STARTED",
    checks: emptyChecks(),
    error: null,
  };
}

function readState(): CandidateState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as CandidateState;
    if (parsed?.schemaVersion === 1) return parsed;
  } catch {
    // Missing or invalid state is treated as a fresh candidate pipeline.
  }
  return emptyState();
}

function writeState(state: CandidateState) {
  ensureHome();
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function audit(entry: CandidateAuditEntry) {
  ensureHome();
  fs.appendFileSync(auditPath, `${JSON.stringify(entry)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function stableFingerprint(root: string) {
  return {
    head: gitSync(["rev-parse", "HEAD"], root, 1500),
    status: gitSync(["status", "--porcelain=v1"], root, 1800) ?? "",
  };
}

function validSha(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{40}$/i.test(value));
}

function safeCandidatePath(sha: string): string {
  return path.join(candidatesRoot, sha.toLowerCase());
}

function preparedChecks(
  verifiedHead: string,
  expectedSha: string,
  stableUnchanged: boolean,
): CandidateCheck[] {
  return [
    {
      id: "SOURCE_CAPTURE",
      status: "PASS",
      detail: "Upstream candidate was fetched only inside the isolated ARYQEN candidate workspace.",
    },
    {
      id: "SHA_VERIFICATION",
      status: verifiedHead === expectedSha ? "PASS" : "FAIL",
      detail:
        verifiedHead === expectedSha
          ? "Detached candidate HEAD exactly matches the live upstream SHA."
          : "Candidate HEAD does not match the requested upstream SHA.",
    },
    {
      id: "STABLE_REPO_IMMUTABILITY",
      status: stableUnchanged ? "PASS" : "FAIL",
      detail: stableUnchanged
        ? "Stable ARYQEN HEAD and worktree fingerprint are unchanged."
        : "Stable repository changed while staging the candidate.",
    },
    {
      id: "UPSTREAM_BASELINE",
      status: "BLOCKED_NO_SANDBOX",
      detail: "Candidate source is staged, but upstream code will not execute on the host without a sandbox.",
    },
    {
      id: "ARYQEN_CONTRACT",
      status: "BLOCKED_NO_SANDBOX",
      detail: "Contract execution awaits the isolated compatibility runner.",
    },
    {
      id: "ARYQEN_INTEGRATION",
      status: "BLOCKED_NO_SANDBOX",
      detail: "Integration execution awaits the isolated compatibility runner.",
    },
    {
      id: "AUTOMATON_CORE_INTEGRITY",
      status: "BLOCKED_NO_SANDBOX",
      detail: "Core runtime execution awaits the isolated compatibility runner.",
    },
  ];
}

export function getCandidateStatus() {
  const state = readState();
  return {
    ...state,
    stableMutationAllowed: false,
    candidateWorkspaceRoot: candidatesRoot,
    auditPath,
  };
}

export async function prepareUpstreamCandidate() {
  const upstream = getLiveUpstream();
  const sha = upstream.guard.candidateSha;
  const remoteUrl = upstream.remoteUrl;
  const stableRoot = resolveStableRepoRoot();

  if (
    upstream.guard.status !== "COMPATIBILITY_CHECK_REQUIRED" ||
    !validSha(sha) ||
    !remoteUrl
  ) {
    const detail = "No verified live upstream candidate is currently eligible for staging.";
    audit({
      at: new Date().toISOString(),
      action: "PREPARE",
      outcome: "BLOCKED",
      candidateSha: sha ?? null,
      detail,
    });
    return {
      ok: false,
      code: "NO_ELIGIBLE_CANDIDATE",
      message: detail,
      candidate: getCandidateStatus(),
    };
  }

  if (!stableRoot) {
    const detail = "ARYQEN stable repository root could not be resolved.";
    audit({
      at: new Date().toISOString(),
      action: "PREPARE",
      outcome: "FAILED",
      candidateSha: sha,
      detail,
    });
    return {
      ok: false,
      code: "STABLE_REPO_NOT_FOUND",
      message: detail,
      candidate: getCandidateStatus(),
    };
  }

  ensureHome();

  const before = stableFingerprint(stableRoot);
  const finalPath = safeCandidatePath(sha);
  const tempPath = `${finalPath}.tmp-${process.pid}`;

  const preparing: CandidateState = {
    ...emptyState(),
    status: "PREPARING",
    candidateSha: sha,
    sourceRemote: remoteUrl,
    candidatePath: finalPath,
    stableHeadBefore: before.head,
    testExecution: "BLOCKED_NO_SANDBOX",
  };
  writeState(preparing);

  try {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }

    let verifiedHead: string | null = null;

    if (fs.existsSync(path.join(finalPath, ".git"))) {
      verifiedHead = gitSync(["rev-parse", "HEAD"], finalPath, 1500);
      if (verifiedHead !== sha) {
        throw new Error(
          "Existing candidate workspace does not match the requested upstream SHA.",
        );
      }
    } else {
      fs.mkdirSync(tempPath, { recursive: true, mode: 0o700 });

      await execGit(["init", "--quiet"], tempPath, 8000);
      await execGit(["remote", "add", "upstream", remoteUrl], tempPath, 5000);

      // This fetch is intentionally confined to ~/.aryqen/candidates/<sha>.
      // The stable ARYQEN repository is never fetched, merged or checked out.
      await execGit(
        ["fetch", "--quiet", "--depth=1", "upstream", sha],
        tempPath,
        45_000,
      );
      await execGit(["checkout", "--quiet", "--detach", "FETCH_HEAD"], tempPath, 10_000);

      verifiedHead = gitSync(["rev-parse", "HEAD"], tempPath, 1500);
      if (verifiedHead !== sha) {
        throw new Error("Fetched candidate HEAD does not match the live upstream SHA.");
      }

      if (fs.existsSync(finalPath)) {
        fs.rmSync(finalPath, { recursive: true, force: true });
      }
      fs.renameSync(tempPath, finalPath);
    }

    const after = stableFingerprint(stableRoot);
    const stableUnchanged =
      before.head === after.head && before.status === after.status;

    if (!stableUnchanged) {
      throw new Error(
        "Stable ARYQEN repository changed while staging the upstream candidate.",
      );
    }

    const checks = preparedChecks(verifiedHead ?? "", sha, stableUnchanged);
    const failedStaticCheck = checks.some((check) => check.status === "FAIL");

    const state: CandidateState = {
      schemaVersion: 1,
      status: failedStaticCheck ? "FAILED" : "PREPARED_WAITING_SANDBOX",
      candidateSha: sha,
      sourceRemote: remoteUrl,
      candidatePath: finalPath,
      preparedAt: new Date().toISOString(),
      verifiedHead,
      stableHeadBefore: before.head,
      stableHeadAfter: after.head,
      stableWorktreeUnchanged: stableUnchanged,
      executionPolicy: "NO_UPSTREAM_CODE_EXECUTION_WITHOUT_SANDBOX",
      testExecution: "BLOCKED_NO_SANDBOX",
      checks,
      error: failedStaticCheck ? "Candidate static verification failed." : null,
    };

    writeState(state);

    const detail = failedStaticCheck
      ? "Candidate staged but failed static verification."
      : "Candidate staged in isolation; execution remains blocked until a sandboxed compatibility runner is available.";

    audit({
      at: new Date().toISOString(),
      action: "PREPARE",
      outcome: failedStaticCheck ? "FAILED" : "PASS",
      candidateSha: sha,
      detail,
    });

    return {
      ok: !failedStaticCheck,
      code: failedStaticCheck
        ? "CANDIDATE_VERIFICATION_FAILED"
        : "CANDIDATE_PREPARED",
      message: detail,
      candidate: getCandidateStatus(),
    };
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }

    const after = stableFingerprint(stableRoot);
    const state: CandidateState = {
      ...preparing,
      status: "FAILED",
      stableHeadAfter: after.head,
      stableWorktreeUnchanged:
        before.head === after.head && before.status === after.status,
      error: error instanceof Error ? error.message : String(error),
    };
    writeState(state);

    audit({
      at: new Date().toISOString(),
      action: "PREPARE",
      outcome: "FAILED",
      candidateSha: sha,
      detail: state.error ?? "Candidate preparation failed.",
    });

    return {
      ok: false,
      code: "CANDIDATE_PREPARE_FAILED",
      message: state.error,
      candidate: getCandidateStatus(),
    };
  }
}
