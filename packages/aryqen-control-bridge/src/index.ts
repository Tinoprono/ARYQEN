import { createServer } from "node:http";
import { URL } from "node:url";
import { getSchemaVersion, openAutomatonState } from "./db.js";
import {
  getActivity,
  getEconomy,
  getMemory,
  getMission,
  getOverview,
  getPolicy,
  getSystem,
  getWorkers,
} from "./read-model.js";
import { getLiveUpstream, getObservability } from "./observability.js";
import {
  getControlAudit,
  getControlStatus,
  startManagedRuntime,
  stopManagedRuntime,
} from "./control-plane.js";

const dbPath = process.env.AUTOMATON_DB_PATH;
if (!dbPath) throw new Error("AUTOMATON_DB_PATH is required");

const host = process.env.ARYQEN_BRIDGE_HOST ?? "127.0.0.1";
const port = Number(process.env.ARYQEN_BRIDGE_PORT ?? 4777);
const allowedOrigin = process.env.ARYQEN_UI_ORIGIN ?? "http://127.0.0.1:5173";

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("ARYQEN_BRIDGE_PORT must be a valid TCP port");
}

const db = openAutomatonState(dbPath);

function overview() {
  const base = getOverview(db);
  const upstream = getLiveUpstream();
  const observability = getObservability(db);

  return {
    ...base,
    heartbeat: {
      healthy: observability.heartbeat.status === "HEALTHY",
      lastRunAt: observability.heartbeat.lastRunAt,
    },
    upstream: {
      status: upstream.status,
      guardStatus: upstream.guard.status,
      behind: upstream.behind,
      checkedAt: upstream.checkedAt,
      healthy: upstream.reachable,
    },
  };
}

const routes: Record<string, () => unknown> = {
  "/api/overview": overview,
  "/api/mission": () => getMission(db),
  "/api/workers": () => getWorkers(db),
  "/api/economy": () => getEconomy(db),
  "/api/policy": () => getPolicy(db),
  "/api/memory": () => getMemory(db),
  "/api/activity": () => getActivity(db),
  "/api/upstream": () => getLiveUpstream(),
  "/api/system": () => getSystem(db),
  "/api/observability": () => getObservability(db),
  "/api/control/status": () => getControlStatus(),
  "/api/control/audit": () => ({ entries: getControlAudit(40) }),
};

function responseHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-aryqen-confirm",
  };
}

function sendJson(res: import("node:http").ServerResponse, code: number, body: unknown) {
  res.writeHead(code, responseHeaders());
  res.end(JSON.stringify(body));
}

function controlRequestAllowed(req: import("node:http").IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin && origin !== allowedOrigin) return false;

  const contentType = req.headers["content-type"];
  if (typeof contentType !== "string" || !contentType.toLowerCase().startsWith("application/json")) {
    return false;
  }

  return true;
}

const server = createServer(async (req, res) => {
  try {
    if (!req.url) return sendJson(res, 400, { error: "missing_url" });
    const url = new URL(req.url, `http://${host}:${port}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, responseHeaders());
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/health") {
      const observability = getObservability(db);
      const control = getControlStatus();
      return sendJson(res, 200, {
        ok: true,
        mode: "read-only-db",
        controlMode: "bounded-local",
        controlPreflight: control.preflight.status,
        controlBlocker: control.preflight.blocker,
        schemaVersion: getSchemaVersion(db),
        heartbeat: observability.heartbeat.status,
        processUptimeSeconds: observability.bridge.processUptimeSeconds,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/control/start") {
      if (!controlRequestAllowed(req)) {
        return sendJson(res, 403, { error: "control_request_rejected" });
      }
      if (req.headers["x-aryqen-confirm"] !== "START_ARYQEN_RUNTIME") {
        return sendJson(res, 409, { error: "explicit_confirmation_required" });
      }

      const result = await startManagedRuntime();
      return sendJson(res, result.ok ? 200 : 409, result);
    }

    if (req.method === "POST" && url.pathname === "/api/control/stop") {
      if (!controlRequestAllowed(req)) {
        return sendJson(res, 403, { error: "control_request_rejected" });
      }
      if (req.headers["x-aryqen-confirm"] !== "STOP_ARYQEN_RUNTIME") {
        return sendJson(res, 409, { error: "explicit_confirmation_required" });
      }

      const result = await stopManagedRuntime();
      return sendJson(res, result.ok ? 200 : 409, result);
    }

    const handler = req.method === "GET" ? routes[url.pathname] : undefined;
    if (!handler) return sendJson(res, 404, { error: "not_found" });
    return sendJson(res, 200, handler());
  } catch (error) {
    return sendJson(res, 500, {
      error: "bridge_error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(`[ARYQEN bridge] http://${host}:${port}`);
  console.log("[ARYQEN bridge] Automaton DB is opened read-only + query_only");
  console.log("[ARYQEN bridge] Live Git upstream checks are read-only (ls-remote; no fetch/merge)");
  console.log("[ARYQEN bridge] V1.8 upstream compatibility guard: live SHA detection + promotion gate; no fetch/merge/checkout");
  console.log("[ARYQEN bridge] V1.7 dependency-aware control remains active: preflight-gated native --run + graceful SIGTERM");
  console.log("[ARYQEN bridge] Conway auth is inspected by presence only; API key values are never exposed.");
  console.log("[ARYQEN bridge] No direct Automaton DB writes. No force-kill. No TINOPRONO access.");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    db.close();
    server.close(() => process.exit(0));
  });
}
