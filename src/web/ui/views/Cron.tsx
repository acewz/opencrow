import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../api";
import { cn } from "../lib/cn";
import {
  PageHeader,
  LoadingState,
  EmptyState,
  Button,
  Input,
  StatusBadge,
  Toggle,
} from "../components";

interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  deleteAfterRun: boolean;
  schedule: {
    kind: string;
    at?: string;
    everyMs?: number;
    expr?: string;
    tz?: string;
  };
  payload: {
    kind: string;
    message: string;
    agentId?: string;
    timeoutSeconds?: number;
  };
  delivery: { mode: string; channel?: string; chatId?: string };
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastStatus: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

interface CronProgressEntry {
  type: string;
  text: string;
  ts: number;
}

interface CronRun {
  id: string;
  jobId: string;
  status: string;
  resultSummary: string | null;
  error: string | null;
  durationMs: number | null;
  startedAt: number;
  endedAt: number | null;
  progress: CronProgressEntry[] | null;
}

interface CronStatus {
  running: boolean;
  jobCount: number;
  nextDueAt: number | null;
}

interface AgentOption {
  id: string;
  name: string;
}

function formatSchedule(s: CronJob["schedule"]): string {
  if (s.kind === "at") return `Once at ${s.at ?? "unknown"}`;
  if (s.kind === "every") {
    const sec = Math.floor((s.everyMs ?? 0) / 1000);
    if (sec < 60) return `Every ${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `Every ${min}m`;
    return `Every ${Math.floor(min / 60)}h`;
  }
  if (s.kind === "cron") return `${s.expr ?? ""}${s.tz ? ` (${s.tz})` : ""}`;
  return "Unknown";
}

function formatTs(ts: number | null): string {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString();
}

function formatProgressTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

const PROGRESS_ICON: Record<string, string> = {
  thinking: "thought",
  tool_start: "tool",
  tool_done: "result",
  iteration: "step",
  subagent_start: "agent",
  subagent_done: "done",
};

const selectClass =
  "w-full px-4 py-2.5 bg-bg border border-border rounded-lg text-foreground text-sm outline-none transition-colors duration-150 focus:border-accent";

const POLL_INTERVAL_MS = 3000;

export default function Cron() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [activeRuns, setActiveRuns] = useState<Record<string, CronRun>>({});
  const prevActiveJobIds = useRef<Set<string>>(new Set());
  const progressEndRef = useRef<HTMLDivElement>(null);

  const [formName, setFormName] = useState("");
  const [formScheduleKind, setFormScheduleKind] = useState<
    "every" | "cron" | "at"
  >("every");
  const [formAt, setFormAt] = useState("");
  const [formEveryMs, setFormEveryMs] = useState("3600000");
  const [formCronExpr, setFormCronExpr] = useState("0 * * * *");
  const [formTz, setFormTz] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formDeleteAfterRun, setFormDeleteAfterRun] = useState(false);
  const [formError, setFormError] = useState("");

  const loadJobs = useCallback(async () => {
    try {
      const [jobsRes, statusRes, activeRes] = await Promise.all([
        apiFetch<{ success: boolean; data: CronJob[] }>("/api/cron/jobs"),
        apiFetch<{ success: boolean; data: CronStatus }>("/api/cron/status"),
        apiFetch<{ success: boolean; data: CronRun[] }>(
          "/api/cron/active-runs",
        ),
      ]);
      if (jobsRes.success) setJobs(jobsRes.data);
      if (statusRes.success) setStatus(statusRes.data);

      if (activeRes.success) {
        const byJob: Record<string, CronRun> = {};
        for (const run of activeRes.data) {
          byJob[run.jobId] = run;
        }

        // Detect completed runs: was active before, now gone → reload runs if expanded
        const currentActiveJobIds = new Set(Object.keys(byJob));
        const prevIds = prevActiveJobIds.current;
        for (const jobId of prevIds) {
          if (!currentActiveJobIds.has(jobId) && expandedJobId === jobId) {
            // This job just finished — reload its runs
            apiFetch<{ success: boolean; data: CronRun[] }>(
              `/api/cron/jobs/${jobId}/runs`,
            )
              .then((res) => {
                if (res.success) setRuns(res.data);
              })
              .catch(() => {});
          }
        }
        prevActiveJobIds.current = currentActiveJobIds;

        setActiveRuns(byJob);
      }
    } catch {
      // cron might be disabled
    } finally {
      setLoading(false);
    }
  }, [expandedJobId]);

  // 3s polling
  useEffect(() => {
    loadJobs();
    const timer = setInterval(loadJobs, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadJobs]);

  // Load agents once
  useEffect(() => {
    apiFetch<{ success: boolean; data: AgentOption[] }>("/api/agents")
      .then((res) => {
        if (res.success) setAgents(res.data);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll progress
  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeRuns, expandedJobId]);

  async function toggleJob(id: string) {
    await apiFetch(`/api/cron/jobs/${id}/toggle`, { method: "POST" }).catch(
      () => null,
    );
    loadJobs();
  }

  async function runNow(id: string) {
    await apiFetch(`/api/cron/jobs/${id}/run`, { method: "POST" }).catch(
      () => null,
    );
    loadJobs();
  }

  async function deleteJob(id: string) {
    if (!confirm("Delete this cron job?")) return;
    await apiFetch(`/api/cron/jobs/${id}`, { method: "DELETE" }).catch(
      () => null,
    );
    loadJobs();
  }

  async function loadRuns(jobId: string) {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(jobId);
    setRunsLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; data: CronRun[] }>(
        `/api/cron/jobs/${jobId}/runs`,
      );
      if (res.success) setRuns(res.data);
    } catch {
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }

  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const schedule =
      formScheduleKind === "at"
        ? { kind: "at" as const, at: formAt }
        : formScheduleKind === "every"
          ? { kind: "every" as const, everyMs: Number(formEveryMs) }
          : {
              kind: "cron" as const,
              expr: formCronExpr,
              tz: formTz || undefined,
            };

    const body = {
      name: formName,
      schedule,
      payload: {
        kind: "agentTurn" as const,
        message: formMessage,
        agentId: formAgentId || undefined,
      },
      deleteAfterRun: formDeleteAfterRun,
    };

    try {
      const res = await apiFetch<{ success: boolean; error?: string }>(
        "/api/cron/jobs",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      if (res.success) {
        setShowForm(false);
        resetForm();
        loadJobs();
      } else {
        setFormError(
          typeof res.error === "string" ? res.error : JSON.stringify(res.error),
        );
      }
    } catch {
      setFormError("Failed to create job");
    }
  }

  function resetForm() {
    setFormName("");
    setFormScheduleKind("every");
    setFormAt("");
    setFormEveryMs("3600000");
    setFormCronExpr("0 * * * *");
    setFormTz("");
    setFormMessage("");
    setFormAgentId("");
    setFormDeleteAfterRun(false);
    setFormError("");
  }

  if (loading) {
    return <LoadingState message="Loading cron..." />;
  }

  if (status === null) {
    return (
      <EmptyState
        title="Cron Unavailable"
        description="Could not reach the cron scheduler. The cron process may still be starting."
      />
    );
  }

  return (
    <div className="p-6 max-w-[1200px]">
      <PageHeader
        title="Cron Jobs"
        subtitle={
          <>
            {status.running ? "Running" : "Stopped"} | {status.jobCount} jobs
            {status.nextDueAt ? ` | Next: ${formatTs(status.nextDueAt)}` : ""}
          </>
        }
        actions={
          <Button
            variant={showForm ? "secondary" : "primary"}
            size="sm"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "New Job"}
          </Button>
        }
      />

      {showForm && (
        <div className="bg-bg-1 border border-border rounded-lg p-6 mb-5">
          <h3 className="mb-4 text-strong font-semibold text-lg">Create Job</h3>
          {formError && <p className="text-danger mb-3 text-sm">{formError}</p>}
          <form onSubmit={handleCreateJob}>
            <div className="mb-5">
              <Input
                label="Name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Schedule Type
              </label>
              <select
                className={selectClass}
                value={formScheduleKind}
                onChange={(e) =>
                  setFormScheduleKind(e.target.value as "every" | "cron" | "at")
                }
              >
                <option value="every">Interval (every N ms)</option>
                <option value="cron">Cron Expression</option>
                <option value="at">One-time (at date)</option>
              </select>
            </div>

            {formScheduleKind === "at" && (
              <div className="mb-5">
                <Input
                  label="Date/Time (ISO)"
                  type="datetime-local"
                  value={formAt}
                  onChange={(e) => setFormAt(e.target.value)}
                  required
                />
              </div>
            )}
            {formScheduleKind === "every" && (
              <div className="mb-5">
                <Input
                  label="Interval (ms)"
                  type="number"
                  value={formEveryMs}
                  onChange={(e) => setFormEveryMs(e.target.value)}
                  min={1000}
                  required
                />
                <span className="text-sm text-faint mt-1 block">
                  {Number(formEveryMs) >= 60000
                    ? `${Math.floor(Number(formEveryMs) / 60000)}m`
                    : `${Math.floor(Number(formEveryMs) / 1000)}s`}
                </span>
              </div>
            )}
            {formScheduleKind === "cron" && (
              <>
                <div className="mb-5">
                  <Input
                    label="Cron Expression"
                    type="text"
                    value={formCronExpr}
                    onChange={(e) => setFormCronExpr(e.target.value)}
                    placeholder="0 * * * *"
                    required
                  />
                </div>
                <div className="mb-5">
                  <Input
                    label="Timezone (optional)"
                    type="text"
                    value={formTz}
                    onChange={(e) => setFormTz(e.target.value)}
                    placeholder="America/New_York"
                  />
                </div>
              </>
            )}

            <div className="mb-5">
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Message
              </label>
              <textarea
                className="w-full px-4 py-2.5 bg-bg border border-border rounded-lg text-foreground text-sm outline-none transition-colors duration-150 focus:border-accent placeholder:text-faint"
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                rows={3}
                placeholder="Task for the agent..."
                required
              />
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Agent (optional)
              </label>
              <select
                className={selectClass}
                value={formAgentId}
                onChange={(e) => setFormAgentId(e.target.value)}
              >
                <option value="">Default</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.id})
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-5">
              <Toggle
                label="Delete after first run"
                checked={formDeleteAfterRun}
                onChange={(v) => setFormDeleteAfterRun(v)}
              />
            </div>

            <Button type="submit" size="sm">
              Create
            </Button>
          </form>
        </div>
      )}

      {jobs.length === 0 ? (
        <EmptyState description="No cron jobs yet. Create one above or ask an agent to schedule a task." />
      ) : (
        <div className="bg-bg-1 border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                {[
                  "Name",
                  "Schedule",
                  "Next Run",
                  "Last Status",
                  "Enabled",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 bg-bg-2 text-faint text-xs font-semibold uppercase tracking-widest border-b border-border"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const isRunning = job.id in activeRuns;
                const activeRun = activeRuns[job.id];

                return (
                  <React.Fragment key={job.id}>
                    <tr className="transition-colors hover:bg-bg-2">
                      <td className="px-4 py-3 border-t border-border text-sm text-foreground">
                        <button
                          className="bg-transparent border-none text-accent cursor-pointer text-sm p-0 hover:text-accent-hover"
                          onClick={() => loadRuns(job.id)}
                        >
                          {job.name}
                        </button>
                        {job.deleteAfterRun && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-bg-3 text-muted ml-2">
                            one-shot
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 border-t border-border text-sm text-faint">
                        {formatSchedule(job.schedule)}
                      </td>
                      <td className="px-4 py-3 border-t border-border text-sm text-foreground">
                        {formatTs(job.nextRunAt)}
                      </td>
                      <td className="px-4 py-3 border-t border-border text-sm text-foreground">
                        {isRunning ? (
                          <StatusBadge
                            status="running"
                            colorMap={{ running: "blue" }}
                          />
                        ) : job.lastStatus ? (
                          <StatusBadge
                            status={job.lastStatus}
                            colorMap={{
                              ok: "green",
                              error: "red",
                              fail: "red",
                              running: "blue",
                            }}
                          />
                        ) : null}
                      </td>
                      <td className="px-4 py-3 border-t border-border text-sm text-foreground">
                        <Toggle
                          checked={job.enabled}
                          onChange={() => toggleJob(job.id)}
                        />
                      </td>
                      <td className="px-4 py-3 border-t border-border text-sm text-foreground">
                        <div className="flex gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => runNow(job.id)}
                            disabled={isRunning}
                          >
                            {isRunning ? (
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 border-2 border-faint border-t-accent rounded-full animate-spin inline-block" />
                                Running...
                              </span>
                            ) : (
                              "Run"
                            )}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => deleteJob(job.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expandedJobId === job.id && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-4 bg-bg-1 border-t border-border"
                        >
                          <div className="mb-3">
                            <strong className="text-sm text-muted">
                              Message:
                            </strong>{" "}
                            <span className="text-sm text-faint">
                              {job.payload.message}
                            </span>
                          </div>
                          {job.payload.agentId && (
                            <div className="mb-3">
                              <strong className="text-sm text-muted">
                                Agent:
                              </strong>{" "}
                              <span className="text-sm text-faint">
                                {job.payload.agentId}
                              </span>
                            </div>
                          )}

                          {/* Live progress for active run */}
                          {activeRun && (
                            <div className="mb-4">
                              <strong className="text-sm text-muted">
                                Live Progress:
                              </strong>
                              <div className="mt-2 bg-bg rounded-lg border border-border p-3 max-h-[200px] overflow-y-auto">
                                {!activeRun.progress ||
                                activeRun.progress.length === 0 ? (
                                  <div className="flex items-center gap-2 text-sm text-faint">
                                    <span className="w-3 h-3 border-2 border-faint border-t-accent rounded-full animate-spin inline-block" />
                                    Waiting for progress...
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    {activeRun.progress.map((entry, i) => (
                                      <div
                                        key={i}
                                        className="flex gap-2 text-xs font-mono"
                                      >
                                        <span className="text-faint shrink-0">
                                          {formatProgressTime(entry.ts)}
                                        </span>
                                        <span className="text-muted shrink-0">
                                          [
                                          {PROGRESS_ICON[entry.type] ??
                                            entry.type}
                                          ]
                                        </span>
                                        <span className="text-foreground break-all">
                                          {entry.text}
                                        </span>
                                      </div>
                                    ))}
                                    <div ref={progressEndRef} />
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <strong className="text-sm text-muted">
                            Recent Runs:
                          </strong>
                          {runsLoading ? (
                            <span className="w-4 h-4 border-2 border-border-2 border-t-accent rounded-full animate-spin inline-block ml-2" />
                          ) : runs.length === 0 ? (
                            <p className="text-sm text-faint">No runs yet</p>
                          ) : (
                            <table className="mt-2 w-full">
                              <thead>
                                <tr>
                                  {[
                                    "Started",
                                    "Status",
                                    "Duration",
                                    "Result",
                                  ].map((h) => (
                                    <th
                                      key={h}
                                      className="text-left px-4 py-2.5 bg-bg-2 text-faint text-xs font-semibold uppercase tracking-widest border-b border-border"
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {runs.map((run) => (
                                  <tr
                                    key={run.id}
                                    className="transition-colors hover:bg-bg-2"
                                  >
                                    <td className="px-4 py-2.5 border-t border-border text-sm text-foreground">
                                      {formatTs(run.startedAt)}
                                    </td>
                                    <td className="px-4 py-2.5 border-t border-border text-sm text-foreground">
                                      <StatusBadge
                                        status={run.status}
                                        colorMap={{
                                          ok: "green",
                                          error: "red",
                                          fail: "red",
                                          running: "blue",
                                          timeout: "yellow",
                                        }}
                                      />
                                    </td>
                                    <td className="px-4 py-2.5 border-t border-border text-sm text-foreground">
                                      {run.status === "running"
                                        ? "-"
                                        : run.durationMs != null
                                          ? `${run.durationMs}ms`
                                          : "-"}
                                    </td>
                                    <td className="px-4 py-2.5 border-t border-border text-sm text-foreground max-w-[300px] overflow-hidden text-ellipsis">
                                      {run.status === "running"
                                        ? "In progress..."
                                        : (run.error ??
                                          run.resultSummary?.slice(0, 100) ??
                                          "-")}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
