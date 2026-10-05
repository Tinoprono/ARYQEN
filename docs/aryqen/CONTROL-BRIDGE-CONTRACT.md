# ARYQEN Control Bridge V1

Default bind: `127.0.0.1:4777`.

Read endpoints:

- `GET /health`
- `GET /api/overview`
- `GET /api/mission`
- `GET /api/workers`
- `GET /api/economy`
- `GET /api/policy`
- `GET /api/memory`
- `GET /api/activity`
- `GET /api/upstream`
- `GET /api/system`

## Boundary

The bridge is observational in V1. It opens Automaton SQLite with `readonly: true` and `PRAGMA query_only = ON`.

`/api/activity` intentionally excludes raw `turns.thinking`, tool arguments and tool results. The UI receives operational telemetry, not hidden reasoning.

`/api/system` exposes schema/capability detection so ARYQEN can tolerate an upstream table being absent without forcing a core fork.
