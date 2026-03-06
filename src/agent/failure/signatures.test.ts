import { test, expect, describe } from "bun:test";
import {
  generateErrorSignature,
  extractErrorParams,
  computeSignatureSimilarity,
} from "./signatures";

describe("generateErrorSignature", () => {
  test("categorizes network errors", () => {
    const sig = generateErrorSignature("ECONNREFUSED: connect failed");
    expect(sig.category).toBe("network");
    expect(sig.subCategory).toBe("connection_refused");
  });

  test("categorizes timeout errors", () => {
    // "timed out" matches network/timeout pattern first (first-match-wins)
    const sig = generateErrorSignature("Request timed out after 30s");
    expect(sig.category).toBe("network");
    expect(sig.subCategory).toBe("timeout");
  });

  test("categorizes permission errors", () => {
    const sig = generateErrorSignature("EACCES: permission denied /var/log");
    expect(sig.category).toBe("permission");
    expect(sig.subCategory).toBe("access_denied");
  });

  test("categorizes filesystem errors", () => {
    const sig = generateErrorSignature("ENOENT: no such file or directory");
    expect(sig.category).toBe("filesystem");
    expect(sig.subCategory).toBe("file_not_found");
  });

  test("categorizes API errors", () => {
    // "HTTP 429" matches HTTP 4xx client_error pattern first (first-match-wins)
    const sig = generateErrorSignature("HTTP 429: rate limit exceeded");
    expect(sig.category).toBe("api");
    expect(sig.subCategory).toBe("client_error");
  });

  test("categorizes auth errors", () => {
    const sig = generateErrorSignature("401 Unauthorized");
    expect(sig.category).toBe("api");
    expect(sig.subCategory).toBe("auth_error");
  });

  test("categorizes database errors", () => {
    const sig = generateErrorSignature("SQL query failed: syntax error");
    expect(sig.category).toBe("database");
    expect(sig.subCategory).toBe("query_error");
  });

  test("categorizes runtime errors", () => {
    const sig = generateErrorSignature(
      "TypeError: undefined is not a function",
    );
    expect(sig.category).toBe("runtime");
    expect(sig.subCategory).toBe("type_error");
  });

  test("categorizes memory errors", () => {
    const sig = generateErrorSignature("ENOMEM: out of memory");
    expect(sig.category).toBe("memory");
    expect(sig.subCategory).toBe("oom");
  });

  test("returns 'unknown' for unrecognized errors", () => {
    const sig = generateErrorSignature("Something totally weird happened");
    expect(sig.category).toBe("unknown");
  });

  test("normalizes file paths in signature", () => {
    const sig = generateErrorSignature(
      "Failed to read /home/user/data/file.json",
    );
    expect(sig.normalized).toContain("<path>");
    expect(sig.normalized).not.toContain("/home/user");
  });

  test("normalizes numbers in signature", () => {
    const sig = generateErrorSignature("Error on port 8080 at line 42");
    expect(sig.normalized).toContain("<num>");
  });

  test("preserves raw error message", () => {
    const msg = "ECONNREFUSED at 127.0.0.1:5432";
    const sig = generateErrorSignature(msg);
    expect(sig.raw).toBe(msg);
  });

  test("truncates long messages to 500 chars", () => {
    const longMsg = "Error: " + "x".repeat(1000);
    const sig = generateErrorSignature(longMsg);
    expect(sig.normalized.length).toBeLessThanOrEqual(500);
  });
});

describe("extractErrorParams", () => {
  test("extracts file paths", () => {
    const params = extractErrorParams("Failed at /home/user/app.ts");
    expect(params.path).toBe("/home/user/app.ts");
  });

  test("extracts port numbers", () => {
    const params = extractErrorParams("Connection refused on port: 5432");
    expect(params.port).toBe("5432");
  });

  test("extracts hostnames", () => {
    const params = extractErrorParams(
      "Cannot resolve hostname: api.example.com",
    );
    expect(params.host).toBe("api.example.com");
  });

  test("extracts HTTP status codes", () => {
    const params = extractErrorParams("HTTP 503 Service Unavailable");
    expect(params.httpStatus).toBe("503");
  });

  test("extracts line numbers", () => {
    const params = extractErrorParams("SyntaxError at line: 42");
    expect(params.line).toBe("42");
  });

  test("extracts column numbers", () => {
    const params = extractErrorParams("Error at column: 15");
    expect(params.column).toBe("15");
  });

  test("returns empty object for no extractable params", () => {
    const params = extractErrorParams("Generic error occurred");
    expect(Object.keys(params)).toHaveLength(0);
  });
});

describe("computeSignatureSimilarity", () => {
  test("returns 1.0 for identical strings", () => {
    expect(computeSignatureSimilarity("hello", "hello")).toBe(1.0);
  });

  test("returns 1.0 for both empty strings", () => {
    expect(computeSignatureSimilarity("", "")).toBe(1.0);
  });

  test("is case insensitive", () => {
    expect(computeSignatureSimilarity("Hello", "hello")).toBe(1.0);
  });

  test("returns high similarity for similar strings", () => {
    const sim = computeSignatureSimilarity(
      "connection refused on port 5432",
      "connection refused on port 3000",
    );
    expect(sim).toBeGreaterThan(0.8);
  });

  test("returns low similarity for very different strings", () => {
    const sim = computeSignatureSimilarity(
      "timeout error",
      "permission denied",
    );
    expect(sim).toBeLessThan(0.5);
  });

  test("returns 0 for completely disjoint strings", () => {
    const sim = computeSignatureSimilarity("abc", "xyz");
    expect(sim).toBeLessThan(0.5);
  });
});
