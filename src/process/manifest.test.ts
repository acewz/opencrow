import { test, expect, describe } from "bun:test";
import { resolveManifest } from "./manifest";
import type { OpenCrowConfig } from "../config/schema";
import type { ResolvedAgent } from "../agents/types";

function makeConfig(overrides: Partial<OpenCrowConfig> = {}): OpenCrowConfig {
  const base: OpenCrowConfig = {
    agent: {
      model: "claude-opus-4-6",
      systemPrompt: "test",
      retry: { attempts: 3, minDelayMs: 500, maxDelayMs: 30000, jitter: 0.15 },
      compaction: {
        enabled: true,
        maxContextTokens: 180000,
        targetHistoryTokens: 60000,
        summaryMaxTokens: 2048,
        stripToolResultsAfterTurns: 3,
      },
      failover: { enabled: false, fallbackModels: [], tokenCooldownMs: 60000 },
    },
    agents: [],
    channels: {
      telegram: { enabled: true, allowedUserIds: [] },
      whatsapp: {
        enabled: true,
        allowedNumbers: [],
        allowedGroups: [],
        defaultAgent: "opencrow",
      },
    },
    web: { enabled: true, port: 48080, host: "0.0.0.0" },
    internalApi: { port: 48081, host: "127.0.0.1" },
    tools: {
      enabled: true,
      allowedDirectories: ["$HOME"],
      blockedCommands: [],
      maxBashTimeout: 600000,
      maxFileSize: 10485760,
      maxIterations: 200,
    },
    cron: { defaultTimeoutSeconds: 300, tickIntervalMs: 10000 },
    postgres: { url: "postgres://test:test@localhost/test", max: 20 },
    memorySearch: {
      enabled: true,
      autoIndex: true,
      shared: true,
      vectorWeight: 0.7,
      textWeight: 0.3,
      defaultLimit: 5,
      minScore: 0.3,
      chunkTokens: 400,
      chunkOverlap: 80,
      temporalDecayHalfLifeDays: 30,
      mmrLambda: 0.7,
      qdrant: { url: "http://localhost:6333", collection: "test" },
    },
    observations: {
      enabled: true,
      model: "claude-haiku-4-5-20251001",
      minMessages: 4,
      maxPerConversation: 3,
      maxRecentInPrompt: 10,
      debounceSec: 300,
    },
    market: {
      enabled: false,
      questdbIlpUrl: "",
      questdbHttpUrl: "",
      exchange: "binance",
      marketTypes: [],
      symbols: [],
      backfill: { enabled: false, timeframes: [], fullHistory: false },
      stream: {
        enabled: false,
        timeframes: [],
        reconnectDelayMs: 5000,
        maxReconnectAttempts: 20,
      },
    },
    monitor: {
      enabled: false,
      thresholds: {
        maxCrashCount: 5,
        maxCrashWindowSec: 300,
        maxMemoryMb: 512,
        maxCpuPercent: 90,
        healthCheckIntervalSec: 60,
        healthCheckTimeoutSec: 10,
      },
    },
    logLevel: "info",
    ...overrides,
  } as OpenCrowConfig;
  return base;
}

function makeAgent(overrides: Partial<ResolvedAgent> = {}): ResolvedAgent {
  return {
    id: "test-agent",
    name: "Test Agent",
    description: "A test agent",
    default: false,
    provider: "agent-sdk",
    model: "claude-opus-4-6",
    systemPrompt: "test prompt",
    toolFilter: { mode: "all", tools: [] },
    subagents: { allowAgents: [], maxSpawnDepth: 1, maxChildren: 5 },
    mcpServers: {},
    skills: [],
    ...overrides,
  };
}

describe("resolveManifest", () => {
  test("returns empty when processes not configured", () => {
    const config = makeConfig({ processes: undefined });
    expect(resolveManifest(config, [])).toEqual([]);
  });

  test("returns empty when processes disabled", () => {
    const config = makeConfig({ processes: undefined });
    expect(resolveManifest(config, [])).toEqual([]);
  });

  test("includes enabled static processes", () => {
    const config = makeConfig({
      processes: {
        static: [
          {
            name: "custom",
            entry: "custom.ts",
            enabled: true,
            restartPolicy: "always",
            maxRestarts: 10,
            restartWindowSec: 300,
          },
        ],
        agentProcesses: {
          enabled: false,
          entry: "src/entries/agent.ts",
          restartPolicy: "always",
        },
        scraperProcesses: {
          enabled: false,
          entry: "src/entries/scraper.ts",
          restartPolicy: "always",
          scraperIds: [],
        },
      },
    });
    const specs = resolveManifest(config, []);
    expect(specs.some((s) => s.name === "custom")).toBe(true);
  });

  test("excludes disabled static processes", () => {
    const config = makeConfig({
      processes: {
        static: [
          {
            name: "disabled-proc",
            entry: "disabled.ts",
            enabled: false,
            restartPolicy: "always",
            maxRestarts: 10,
            restartWindowSec: 300,
          },
        ],
        agentProcesses: {
          enabled: false,
          entry: "src/entries/agent.ts",
          restartPolicy: "always",
        },
        scraperProcesses: {
          enabled: false,
          entry: "src/entries/scraper.ts",
          restartPolicy: "always",
          scraperIds: [],
        },
      },
    });
    const specs = resolveManifest(config, []);
    expect(specs.some((s) => s.name === "disabled-proc")).toBe(false);
  });

  test("includes builtin cron process", () => {
    const config = makeConfig({
      processes: {
        static: [],
        agentProcesses: {
          enabled: false,
          entry: "src/entries/agent.ts",
          restartPolicy: "always",
        },
        scraperProcesses: {
          enabled: false,
          entry: "src/entries/scraper.ts",
          restartPolicy: "always",
          scraperIds: [],
        },
      },
    });
    const specs = resolveManifest(config, []);
    expect(specs.some((s) => s.name === "cron")).toBe(true);
  });

  test("includes web process when web enabled", () => {
    const config = makeConfig({
      web: { enabled: true, port: 48080, host: "0.0.0.0" },
      processes: {
        static: [],
        agentProcesses: {
          enabled: false,
          entry: "src/entries/agent.ts",
          restartPolicy: "always",
        },
        scraperProcesses: {
          enabled: false,
          entry: "src/entries/scraper.ts",
          restartPolicy: "always",
          scraperIds: [],
        },
      },
    });
    const specs = resolveManifest(config, []);
    expect(specs.some((s) => s.name === "web")).toBe(true);
  });

  test("excludes web process when web disabled", () => {
    const config = makeConfig({
      web: { enabled: false, port: 48080, host: "0.0.0.0" },
      processes: {
        static: [],
        agentProcesses: {
          enabled: false,
          entry: "src/entries/agent.ts",
          restartPolicy: "always",
        },
        scraperProcesses: {
          enabled: false,
          entry: "src/entries/scraper.ts",
          restartPolicy: "always",
          scraperIds: [],
        },
      },
    });
    const specs = resolveManifest(config, []);
    expect(specs.some((s) => s.name === "web")).toBe(false);
  });

  test("spawns agent processes for agents with telegram tokens", () => {
    const config = makeConfig({
      processes: {
        static: [],
        agentProcesses: {
          enabled: true,
          entry: "src/entries/agent.ts",
          restartPolicy: "always",
        },
        scraperProcesses: {
          enabled: false,
          entry: "src/entries/scraper.ts",
          restartPolicy: "always",
          scraperIds: [],
        },
      },
    });
    const agents = [
      makeAgent({ id: "bot1", telegramBotToken: "token-123" }),
      makeAgent({ id: "bot2" }), // no token, no WhatsApp
    ];
    const specs = resolveManifest(config, agents);
    expect(specs.some((s) => s.name === "agent:bot1")).toBe(true);
    expect(specs.some((s) => s.name === "agent:bot2")).toBe(false);
  });

  test("spawns agent process for WhatsApp default agent", () => {
    const config = makeConfig({
      channels: {
        telegram: { enabled: true, allowedUserIds: [] },
        whatsapp: {
          enabled: true,
          allowedNumbers: [],
          allowedGroups: [],
          defaultAgent: "wa-agent",
        },
      },
      processes: {
        static: [],
        agentProcesses: {
          enabled: true,
          entry: "src/entries/agent.ts",
          restartPolicy: "always",
        },
        scraperProcesses: {
          enabled: false,
          entry: "src/entries/scraper.ts",
          restartPolicy: "always",
          scraperIds: [],
        },
      },
    });
    const agents = [makeAgent({ id: "wa-agent" })];
    const specs = resolveManifest(config, agents);
    expect(specs.some((s) => s.name === "agent:wa-agent")).toBe(true);
  });

  test("skips agent processes when agentProcesses disabled", () => {
    const config = makeConfig({
      processes: {
        static: [],
        agentProcesses: {
          enabled: false,
          entry: "src/entries/agent.ts",
          restartPolicy: "always",
        },
        scraperProcesses: {
          enabled: false,
          entry: "src/entries/scraper.ts",
          restartPolicy: "always",
          scraperIds: [],
        },
      },
    });
    const agents = [
      makeAgent({ id: "bot1", telegramBotToken: "token-123" }),
    ];
    const specs = resolveManifest(config, agents);
    expect(specs.some((s) => s.name === "agent:bot1")).toBe(false);
  });

  test("spawns scraper processes", () => {
    const config = makeConfig({
      processes: {
        static: [],
        agentProcesses: {
          enabled: false,
          entry: "src/entries/agent.ts",
          restartPolicy: "always",
        },
        scraperProcesses: {
          enabled: true,
          entry: "src/entries/scraper.ts",
          restartPolicy: "always",
          scraperIds: ["hackernews", "reddit"],
        },
      },
    });
    const specs = resolveManifest(config, []);
    expect(specs.some((s) => s.name === "scraper:hackernews")).toBe(true);
    expect(specs.some((s) => s.name === "scraper:reddit")).toBe(true);
  });

  test("scraper processes have correct env", () => {
    const config = makeConfig({
      processes: {
        static: [],
        agentProcesses: {
          enabled: false,
          entry: "src/entries/agent.ts",
          restartPolicy: "always",
        },
        scraperProcesses: {
          enabled: true,
          entry: "src/entries/scraper.ts",
          restartPolicy: "always",
          scraperIds: ["github"],
        },
      },
    });
    const specs = resolveManifest(config, []);
    const github = specs.find((s) => s.name === "scraper:github");
    expect(github?.env?.OPENCROW_SCRAPER_ID).toBe("github");
  });

  test("agent processes have correct env", () => {
    const config = makeConfig({
      processes: {
        static: [],
        agentProcesses: {
          enabled: true,
          entry: "src/entries/agent.ts",
          restartPolicy: "always",
        },
        scraperProcesses: {
          enabled: false,
          entry: "src/entries/scraper.ts",
          restartPolicy: "always",
          scraperIds: [],
        },
      },
    });
    const agents = [
      makeAgent({ id: "my-bot", telegramBotToken: "tok" }),
    ];
    const specs = resolveManifest(config, agents);
    const bot = specs.find((s) => s.name === "agent:my-bot");
    expect(bot?.env?.OPENCROW_AGENT_ID).toBe("my-bot");
  });
});
