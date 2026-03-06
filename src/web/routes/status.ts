import { Hono } from "hono";
import type { WebAppDeps } from "../app";
import { getAllSessions } from "../../store/sessions";
import { getProcessStatuses } from "../../process/health";
import { createLogger } from "../../logger";

const log = createLogger("web-status");
const startTime = Date.now();

export function createStatusRoutes(deps: WebAppDeps): Hono {
  const app = new Hono();

  app.get("/status", async (c) => {
    const sessions = await getAllSessions();
    const authEnabled = Boolean(process.env.OPENCROW_WEB_TOKEN);

    let channelStatus: Record<string, { status: string; type: string }> = {};
    let cronStatus: {
      running: boolean;
      jobCount: number;
      nextDueAt: number | null;
    } | null = null;

    // If running as standalone web, fetch live status from core
    if (deps.coreClient && deps.channels.size === 0) {
      try {
        const coreStatus = await deps.coreClient.getStatus();
        channelStatus = coreStatus.channels;
        cronStatus = coreStatus.cron;
      } catch (err) {
        log.warn("Failed to fetch core status", { error: err });
      }
    } else {
      for (const [name, channel] of deps.channels.entries()) {
        channelStatus[name] = {
          status: channel.isConnected() ? "connected" : "disconnected",
          type: name === "whatsapp" ? "whatsapp" : "telegram",
        };
      }
      cronStatus = deps.cronScheduler
        ? await deps.cronScheduler.getStatus()
        : null;
    }

    return c.json({
      uptime: Math.floor((Date.now() - startTime) / 1000),
      authEnabled,
      version: "0.2.0",
      sessions: sessions.length,
      channels: channelStatus,
      agents: deps.agentRegistry.agents.length,
      cron: cronStatus
        ? {
            running: cronStatus.running,
            jobCount: cronStatus.jobCount,
            nextDueAt: cronStatus.nextDueAt,
          }
        : null,
    });
  });

  // Process health (works in both monolith and distributed modes)
  app.get("/processes", async (c) => {
    // In standalone web mode, proxy to core
    if (deps.coreClient && deps.channels.size === 0) {
      try {
        // Fetch heartbeat data and orchestrator state in parallel
        const [heartbeatResult, orchestratorResult] = await Promise.all([
          deps.coreClient.listProcesses().catch(() => ({
            data: [] as ReadonlyArray<{
              name: string;
              pid: number;
              status: string;
              startedAt: number;
              lastHeartbeat: number;
              uptimeSeconds: number;
              metadata: Record<string, unknown>;
            }>,
          })),
          deps.coreClient.getOrchestratorState().catch(() => ({ data: null })),
        ]);

        const orchestratorState = orchestratorResult.data;

        if (orchestratorState) {
          // Merge orchestrator state with heartbeat data
          const heartbeatMap = new Map(
            heartbeatResult.data.map((p) => [p.name, p]),
          );

          const merged = orchestratorState.map((orch) => {
            const hb = heartbeatMap.get(orch.name);
            return {
              name: orch.name,
              pid: orch.pid ?? hb?.pid ?? 0,
              status:
                hb?.status ?? (orch.status === "running" ? "alive" : "dead"),
              startedAt: hb?.startedAt ?? 0,
              lastHeartbeat: hb?.lastHeartbeat ?? 0,
              uptimeSeconds: orch.uptimeSeconds ?? hb?.uptimeSeconds ?? 0,
              metadata: hb?.metadata ?? {},
              desired: orch.desired,
              syncStatus: orch.syncStatus,
              restartCount: orch.restartCount,
              backoffMs: orch.backoffMs ?? 0,
              nextRetryAt: orch.nextRetryAt ?? null,
              orchestrated: true,
            };
          });

          // Include any heartbeat-only processes not in orchestrator (e.g. core itself)
          for (const hb of heartbeatResult.data) {
            if (!orchestratorState.some((o) => o.name === hb.name)) {
              merged.push({
                ...hb,
                desired: true,
                syncStatus:
                  hb.status === "alive"
                    ? ("synced" as const)
                    : ("stopped" as const),
                restartCount: 0,
                backoffMs: 0,
                nextRetryAt: null,
                orchestrated: false,
              });
            }
          }

          return c.json({ data: merged });
        }

        return c.json(heartbeatResult);
      } catch (err) {
        log.warn("Failed to fetch processes from core", { error: err });
        return c.json({ data: [] });
      }
    }

    // In monolith mode, read directly from DB
    try {
      const statuses = await getProcessStatuses();
      return c.json({ data: statuses });
    } catch (err) {
      log.warn("Failed to fetch process statuses", { error: err });
      return c.json({ data: [] });
    }
  });

  app.post("/processes/:name/restart", async (c) => {
    const name = c.req.param("name");

    if (deps.coreClient && deps.channels.size === 0) {
      try {
        const result = await deps.coreClient.restartProcess(name);
        return c.json(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to restart process";
        return c.json({ error: message }, 500);
      }
    }

    // In monolith mode, send command directly
    try {
      const { sendCommand } = await import("../../process/commands");
      const commandId = await sendCommand(
        name as import("../../process/types").ProcessName,
        "restart",
      );
      return c.json({ ok: true, commandId });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send restart command";
      return c.json({ error: message }, 500);
    }
  });

  app.post("/processes/:name/stop", async (c) => {
    const name = c.req.param("name");

    if (deps.coreClient && deps.channels.size === 0) {
      try {
        const result = await deps.coreClient.stopProcess(name);
        return c.json(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to stop process";
        return c.json({ error: message }, 500);
      }
    }

    try {
      const { sendCommand } = await import("../../process/commands");
      const commandId = await sendCommand(
        name as import("../../process/types").ProcessName,
        "stop",
      );
      return c.json({ ok: true, commandId });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send stop command";
      return c.json({ error: message }, 500);
    }
  });

  app.post("/processes/:name/start", async (c) => {
    const name = c.req.param("name");

    if (deps.coreClient && deps.channels.size === 0) {
      try {
        const result = await deps.coreClient.startProcess(name);
        return c.json(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to start process";
        return c.json({ error: message }, 500);
      }
    }

    return c.json(
      { error: "Orchestrator not available in monolith mode" },
      503,
    );
  });

  return app;
}
