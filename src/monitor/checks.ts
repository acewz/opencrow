import { getDb } from "../store/db";
import type { CheckResult, MonitorThresholds } from "./types";

/**
 * Check if any registered process has a stale heartbeat.
 */
export async function checkProcessHealth(
  thresholds: MonitorThresholds,
): Promise<readonly CheckResult[]> {
  const db = getDb();
  const rows = await db`SELECT name, last_heartbeat FROM process_registry ORDER BY name`;
  const now = Math.floor(Date.now() / 1000);
  const results: CheckResult[] = [];

  for (const row of rows) {
    const age = now - Number(row.last_heartbeat);
    if (age > thresholds.processHeartbeatStaleSec) {
      const isDead = age > thresholds.processHeartbeatStaleSec * 2;
      results.push({
        category: "process",
        level: isDead ? "critical" : "warning",
        title: `Process ${row.name} is ${isDead ? "dead" : "stale"}`,
        detail: `No heartbeat for ${age}s (threshold: ${thresholds.processHeartbeatStaleSec}s)`,
        metric: age,
        threshold: thresholds.processHeartbeatStaleSec,
      });
    }
  }

  return results;
}

/**
 * Check error count and rate in recent logs.
 */
export async function checkErrorRate(
  thresholds: MonitorThresholds,
): Promise<readonly CheckResult[]> {
  const db = getDb();
  const since = Math.floor(Date.now() / 1000) - thresholds.errorWindowMinutes * 60;

  const [stats] = await db`
    SELECT
      COUNT(*) FILTER (WHERE level = 'error') AS error_count,
      COUNT(*) AS total_count
    FROM process_logs
    WHERE created_at >= ${since}
  `;

  const errorCount = Number(stats?.error_count ?? 0);
  const totalCount = Number(stats?.total_count ?? 0);
  const errorRate = totalCount > 0 ? (errorCount / totalCount) * 100 : 0;
  const results: CheckResult[] = [];

  if (errorCount >= thresholds.errorCountWindow) {
    results.push({
      category: "error_rate",
      level: errorCount >= thresholds.errorCountWindow * 2 ? "critical" : "warning",
      title: `High error count: ${errorCount} errors in ${thresholds.errorWindowMinutes}m`,
      detail: `${errorCount} errors / ${totalCount} total (${errorRate.toFixed(1)}%)`,
      metric: errorCount,
      threshold: thresholds.errorCountWindow,
    });
  } else if (errorRate >= thresholds.errorRatePercent && totalCount > 10) {
    results.push({
      category: "error_rate",
      level: "warning",
      title: `Elevated error rate: ${errorRate.toFixed(1)}%`,
      detail: `${errorCount} errors / ${totalCount} total in ${thresholds.errorWindowMinutes}m`,
      metric: errorRate,
      threshold: thresholds.errorRatePercent,
    });
  }

  return results;
}

/**
 * Check for cron jobs with consecutive failures.
 */
export async function checkCronFailures(
  thresholds: MonitorThresholds,
): Promise<readonly CheckResult[]> {
  const db = getDb();
  const since = Math.floor(Date.now() / 1000) - 1800;

  const rows = await db`
    SELECT cr.job_id, cr.status, cr.error, cj.name AS job_name
    FROM cron_runs cr
    JOIN cron_jobs cj ON cj.id = cr.job_id
    WHERE cr.started_at >= ${since}
    ORDER BY cr.job_id, cr.started_at DESC
  `;

  const jobRuns = new Map<string, { name: string; runs: Array<{ status: string; error: string | null }> }>();
  for (const row of rows) {
    const jobId = row.job_id as string;
    if (!jobRuns.has(jobId)) {
      jobRuns.set(jobId, { name: row.job_name as string, runs: [] });
    }
    jobRuns.get(jobId)!.runs.push({
      status: row.status as string,
      error: row.error as string | null,
    });
  }

  const results: CheckResult[] = [];
  for (const [, job] of jobRuns) {
    let consecutive = 0;
    for (const run of job.runs) {
      if (run.status === "error" || run.status === "timeout") {
        consecutive++;
      } else {
        break;
      }
    }

    if (consecutive >= thresholds.cronConsecutiveFailures) {
      const lastError = job.runs[0]?.error ?? "unknown";
      results.push({
        category: "cron",
        level: consecutive >= thresholds.cronConsecutiveFailures * 2 ? "critical" : "warning",
        title: `Cron job "${job.name}" failing`,
        detail: `${consecutive} consecutive failures. Last error: ${lastError.slice(0, 200)}`,
        metric: consecutive,
        threshold: thresholds.cronConsecutiveFailures,
      });
    }
  }

  return results;
}

/**
 * Check disk usage on root partition.
 */
export async function checkDiskUsage(
  thresholds: MonitorThresholds,
): Promise<readonly CheckResult[]> {
  const proc = Bun.spawn(["df", "--output=pcent", "/"], { stdout: "pipe", stderr: "pipe" });
  const output = (await new Response(proc.stdout).text()).trim();
  await proc.exited;

  const lines = output.split("\n");
  const pctStr = lines[lines.length - 1]?.trim().replace("%", "");
  const pct = parseInt(pctStr ?? "0", 10);

  if (pct >= thresholds.diskUsagePercent) {
    return [{
      category: "disk",
      level: pct >= 95 ? "critical" : "warning",
      title: `Disk usage at ${pct}%`,
      detail: `Root partition is ${pct}% full (threshold: ${thresholds.diskUsagePercent}%)`,
      metric: pct,
      threshold: thresholds.diskUsagePercent,
    }];
  }

  return [];
}

/**
 * Check system memory usage.
 */
export async function checkMemoryUsage(
  thresholds: MonitorThresholds,
): Promise<readonly CheckResult[]> {
  const proc = Bun.spawn(["free", "-m"], { stdout: "pipe", stderr: "pipe" });
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  const memLine = output.split("\n").find((l) => l.startsWith("Mem:"));
  if (!memLine) return [];

  const parts = memLine.split(/\s+/);
  const total = parseInt(parts[1] ?? "0", 10);
  const available = parseInt(parts[6] ?? "0", 10);
  const usedEffective = total - available;
  const pct = total > 0 ? Math.round((usedEffective / total) * 100) : 0;

  if (pct >= thresholds.memoryUsagePercent) {
    return [{
      category: "memory",
      level: pct >= 95 ? "critical" : "warning",
      title: `Memory usage at ${pct}%`,
      detail: `${usedEffective}MB / ${total}MB used (threshold: ${thresholds.memoryUsagePercent}%)`,
      metric: pct,
      threshold: thresholds.memoryUsagePercent,
    }];
  }

  return [];
}

/**
 * Run all checks in parallel and collect results.
 * Individual check failures don't prevent other checks from running.
 */
export async function runAllChecks(
  thresholds: MonitorThresholds,
): Promise<readonly CheckResult[]> {
  const settled = await Promise.allSettled([
    checkProcessHealth(thresholds),
    checkErrorRate(thresholds),
    checkCronFailures(thresholds),
    checkDiskUsage(thresholds),
    checkMemoryUsage(thresholds),
  ]);

  const results: CheckResult[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      results.push(...result.value);
    }
  }

  return results;
}
