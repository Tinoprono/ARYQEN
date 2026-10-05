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
  getUpstream,
  getWorkers,
} from "./read-model.js";

const dbPath = process.env.AUTOMATON_DB_PATH;
if (!dbPath) throw new Error("AUTOMATON_DB_PATH is required");

const host = process.env.ARYQEN_BRIDGE_HOST ?? "127.0.0.1";
const port = Number(process.env.ARYQEN_BRIDGE_PORT ?? 4777);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("ARYQEN_BRIDGE_PORT must be a valid TCP port");
}

const db = openAutomatonState(dbPath);

const routes: Record<string, () => unknown> = {
  "/api/overview": () => getOverview(db),
  "/api/mission": () => getMission(db),
  "/api/workers": () => getWorkers(db),
  "/api/economy": () => getEconomy(db),
  "/api/policy": () => getPolicy(db),
  "/api/memory": () => getMemory(db),
  "/api/activity": () => getActivity(db),
  "/api/upstream": () => getUpstream(db),
  "/api/system": () => getSystem(db),
};

function sendJson(res: import("node:http").ServerResponse, code: number, body: unknown) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": "http://127.0.0.1:5173",
  });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  try {
    if (!req.url) return sendJson(res, 400, { error: "missing_url" });
    const url = new URL(req.url, `http://${host}:${port}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, {
        ok: true,
        mode: "read-only",
        schemaVersion: getSchemaVersion(db),
      });
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
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    db.close();
    server.close(() => process.exit(0));
  });
}
