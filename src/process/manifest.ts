import type { OpenCrowConfig, ProcessSpec } from "../config/schema";
import type { ResolvedAgent } from "../agents/types";

/**
 * Builds the desired process list from config + dynamic agent/scraper discovery.
 *
 * Static processes come from config.processes.static.
 * Agent processes are dynamically discovered from agents with telegramBotToken + the default agent.
 * Scraper processes are one-per-scraper-id from config.
 */
export function resolveManifest(
  config: OpenCrowConfig,
  agents: readonly ResolvedAgent[],
): readonly ProcessSpec[] {
  const processesConfig = config.processes;
  if (!processesConfig) return [];

  const specs: ProcessSpec[] = [];

  // Static processes from config (user-defined extras)
  for (const s of processesConfig.static) {
    if (s.enabled) {
      specs.push(s);
    }
  }

  // Built-in infrastructure processes (always spawned when processes enabled)
  const builtins: ProcessSpec[] = [
    {
      name: "cron",
      entry: "src/entries/cron.ts",
      enabled: true,
      restartPolicy: "always",
      maxRestarts: 10,
      restartWindowSec: 300,
    },
    {
      name: "web",
      entry: "src/web-index.ts",
      enabled: config.web.enabled,
      restartPolicy: "always",
      maxRestarts: 10,
      restartWindowSec: 300,
    },
    {
      name: "market",
      entry: "src/entries/market.ts",
      enabled: config.market.enabled,
      restartPolicy: "always",
      maxRestarts: 10,
      restartWindowSec: 300,
    },
  ];
  for (const b of builtins) {
    // Skip if already defined in static (user override)
    if (b.enabled && !specs.some((s) => s.name === b.name)) {
      specs.push(b);
    }
  }

  // Agent processes
  if (processesConfig.agentProcesses.enabled) {
    const agentEntry = processesConfig.agentProcesses.entry;
    const agentRestartPolicy = processesConfig.agentProcesses.restartPolicy;

    // Spawn a process for each agent that has a telegramBotToken or owns WhatsApp.
    // No special-casing — every agent is treated the same.
    for (const agent of agents) {
      const ownsWhatsApp =
        config.channels.whatsapp.enabled &&
        config.channels.whatsapp.defaultAgent === agent.id;

      if (!agent.telegramBotToken && !ownsWhatsApp) continue;

      specs.push({
        name: `agent:${agent.id}`,
        entry: agentEntry,
        enabled: true,
        env: { OPENCROW_AGENT_ID: agent.id },
        restartPolicy: agentRestartPolicy,
        maxRestarts: 10,
        restartWindowSec: 300,
      });
    }
  }

  // Scraper processes — one per scraper ID
  if (processesConfig.scraperProcesses.enabled) {
    const scraperEntry = processesConfig.scraperProcesses.entry;
    const scraperRestartPolicy = processesConfig.scraperProcesses.restartPolicy;

    for (const scraperId of processesConfig.scraperProcesses.scraperIds) {
      specs.push({
        name: `scraper:${scraperId}`,
        entry: scraperEntry,
        enabled: true,
        env: { OPENCROW_SCRAPER_ID: scraperId },
        restartPolicy: scraperRestartPolicy,
        maxRestarts: 10,
        restartWindowSec: 300,
      });
    }
  }

  return specs;
}
