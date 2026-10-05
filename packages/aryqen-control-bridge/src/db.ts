import Database from "better-sqlite3";

export type AutomatonStateDb = Database.Database;

export function openAutomatonState(dbPath: string): AutomatonStateDb {
  const db = new Database(dbPath, {
    readonly: true,
    fileMustExist: true,
  });

  // Keep the bridge observational only. query_only also protects against
  // accidental writes introduced by future bridge code.
  db.pragma("query_only = ON");
  return db;
}

export function safeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function hasTable(db: AutomatonStateDb, table: string): boolean {
  const row = db
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) as { present: number } | undefined;
  return Boolean(row?.present);
}

export function getTableColumns(db: AutomatonStateDb, table: string): Set<string> {
  if (!hasTable(db, table)) return new Set();
  // Table names come only from ARYQEN's hard-coded allowlist.
  if (!/^[a-zA-Z0-9_]+$/.test(table)) return new Set();
  const result = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(result.map((column) => column.name));
}

export function getSchemaVersion(db: AutomatonStateDb): number | null {
  if (!hasTable(db, "schema_version")) return null;
  const row = db.prepare("SELECT MAX(version) AS version FROM schema_version").get() as
    | { version: number | null }
    | undefined;
  return row?.version ?? null;
}
