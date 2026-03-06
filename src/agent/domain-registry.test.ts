import { test, expect, describe } from "bun:test";
import {
  normalizeDomain,
  DOMAIN_TO_AGENT,
  AGENT_TO_DOMAIN,
  LEGACY_DOMAIN_MAP,
} from "./domain-registry";

describe("normalizeDomain", () => {
  test("returns canonical domain unchanged", () => {
    expect(normalizeDomain("backend")).toBe("backend");
    expect(normalizeDomain("frontend")).toBe("frontend");
    expect(normalizeDomain("architecture")).toBe("architecture");
    expect(normalizeDomain("debugging")).toBe("debugging");
    expect(normalizeDomain("security")).toBe("security");
    expect(normalizeDomain("testing")).toBe("testing");
  });

  test("maps legacy 'coding' to 'backend'", () => {
    expect(normalizeDomain("coding")).toBe("backend");
  });

  test("maps legacy 'debug' to 'debugging'", () => {
    expect(normalizeDomain("debug")).toBe("debugging");
  });

  test("maps legacy 'analysis' to 'architecture'", () => {
    expect(normalizeDomain("analysis")).toBe("architecture");
  });

  test("maps legacy 'writing' to 'content'", () => {
    expect(normalizeDomain("writing")).toBe("content");
  });

  test("maps legacy 'planning' to 'architecture'", () => {
    expect(normalizeDomain("planning")).toBe("architecture");
  });

  test("maps legacy 'refactor' to 'backend'", () => {
    expect(normalizeDomain("refactor")).toBe("backend");
  });

  test("returns 'general' for unknown domain", () => {
    expect(normalizeDomain("unknown")).toBe("general");
    expect(normalizeDomain("foobar")).toBe("general");
    expect(normalizeDomain("")).toBe("general");
  });
});

describe("DOMAIN_TO_AGENT", () => {
  test("maps all canonical domains to agents", () => {
    expect(DOMAIN_TO_AGENT.architecture).toBe("architect");
    expect(DOMAIN_TO_AGENT.backend).toBe("backend");
    expect(DOMAIN_TO_AGENT.frontend).toBe("frontend");
    expect(DOMAIN_TO_AGENT.debugging).toBe("debugger");
    expect(DOMAIN_TO_AGENT.security).toBe("security-reviewer");
    expect(DOMAIN_TO_AGENT.testing).toBe("tdd-guide");
    expect(DOMAIN_TO_AGENT.general).toBe("general-purpose");
  });
});

describe("AGENT_TO_DOMAIN", () => {
  test("reverse lookup works", () => {
    expect(AGENT_TO_DOMAIN["architect"]).toBe("architecture");
    expect(AGENT_TO_DOMAIN["backend"]).toBe("backend");
    expect(AGENT_TO_DOMAIN["debugger"]).toBe("debugging");
    expect(AGENT_TO_DOMAIN["tdd-guide"]).toBe("testing");
  });
});

describe("LEGACY_DOMAIN_MAP", () => {
  test("contains all known legacy names", () => {
    expect(LEGACY_DOMAIN_MAP["coding"]).toBe("backend");
    expect(LEGACY_DOMAIN_MAP["debug"]).toBe("debugging");
    expect(LEGACY_DOMAIN_MAP["analysis"]).toBe("architecture");
    expect(LEGACY_DOMAIN_MAP["writing"]).toBe("content");
    expect(LEGACY_DOMAIN_MAP["planning"]).toBe("architecture");
    expect(LEGACY_DOMAIN_MAP["refactor"]).toBe("backend");
  });
});
