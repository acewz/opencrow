/**
 * Canonical domain taxonomy for the agent orchestration system.
 * Single source of truth used by task classifier, prediction engine,
 * decomposer, and router.
 */

export type AgentDomain =
  | "architecture"
  | "backend"
  | "frontend"
  | "debugging"
  | "review"
  | "security"
  | "testing"
  | "performance"
  | "research"
  | "content"
  | "devops"
  | "ux"
  | "data"
  | "prompt-engineering"
  | "api-design"
  | "monitoring"
  | "general";

/** Maps each domain to its primary agent */
export const DOMAIN_TO_AGENT: Readonly<Record<AgentDomain, string>> = {
  architecture: "architect",
  backend: "backend",
  frontend: "frontend",
  debugging: "debugger",
  review: "reviewer",
  security: "security-reviewer",
  testing: "tdd-guide",
  performance: "performance-engineer",
  research: "researcher",
  content: "writer",
  devops: "devops",
  ux: "ux-advisor",
  data: "data-analyst",
  "prompt-engineering": "prompt-engineer",
  "api-design": "api-designer",
  monitoring: "monitor",
  general: "general-purpose",
};

/** Maps each agent ID to its primary domain (reverse lookup) */
export const AGENT_TO_DOMAIN: Readonly<Record<string, AgentDomain>> =
  Object.fromEntries(
    Object.entries(DOMAIN_TO_AGENT).map(([domain, agent]) => [
      agent,
      domain as AgentDomain,
    ]),
  ) as Record<string, AgentDomain>;

/** Maps old task-classifier domain names to canonical domains */
export const LEGACY_DOMAIN_MAP: Readonly<Record<string, AgentDomain>> = {
  coding: "backend",
  debug: "debugging",
  analysis: "architecture",
  writing: "content",
  planning: "architecture",
  refactor: "backend",
  // These already match canonical names:
  research: "research",
  devops: "devops",
  testing: "testing",
  "api-design": "api-design",
  review: "review",
  general: "general",
};

/** Normalize any domain string (legacy or canonical) to canonical */
export function normalizeDomain(domain: string): AgentDomain {
  if (domain in DOMAIN_TO_AGENT) return domain as AgentDomain;
  return LEGACY_DOMAIN_MAP[domain] ?? "general";
}
