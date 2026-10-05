export interface AryqenOverview {
  agent: {
    name: string;
    state: string;
    tier: string | null;
    uptimeSeconds: number | null;
  };
  mission: {
    id: string | null;
    title: string | null;
    progress: number;
    runningTasks: number;
  };
  workers: { active: number; total: number };
  economy: { creditsCents: number | null; todayInferenceCostCents: number };
  heartbeat: { healthy: boolean; lastRunAt: string | null };
  policy: { blockedLast24h: number };
  upstream: { behind: number | null; checkedAt: string | null; healthy: boolean };
}

export interface AryqenMission {
  goal: Record<string, unknown> | null;
  tasks: Record<string, unknown>[];
}

export interface AryqenWorkerView {
  workers: Record<string, unknown>[];
  lifecycle: Record<string, unknown>[];
}
