import { describe, it, expect } from "bun:test";
import { resolveAllowedDirs, expandHome, isPathAllowed, isPathAllowedSync } from "./path-utils";

describe("expandHome", () => {
  it("should expand ~ to home directory", () => {
    const home = process.env.HOME || "/home/user";
    const result = expandHome("~/test");
    expect(result).toBe(`${home}/test`);
  });

  it("should expand ~ alone to home directory", () => {
    const home = process.env.HOME || "/home/user";
    const result = expandHome("~");
    expect(result).toBe(home);
  });

  it("should not modify paths without ~", () => {
    const result = expandHome("/absolute/path");
    expect(result).toBe("/absolute/path");
  });

  it("should handle empty string", () => {
    const result = expandHome("");
    expect(result).toBe("");
  });

  it("should handle paths with ~ in the middle (not expanded)", () => {
    const result = expandHome("/path/~/test");
    expect(result).toBe("/path/~/test");
  });

  it("should expand $HOME syntax", () => {
    const home = process.env.HOME || "/home/user";
    const result = expandHome("$HOME/test");
    expect(result).toBe(`${home}/test`);
  });
});

describe("resolveAllowedDirs", () => {
  it("should resolve relative paths to absolute", () => {
    const cwd = process.cwd();
    const result = resolveAllowedDirs(["./test"]);
    expect(result[0]).toBe(`${cwd}/test`);
  });

  it("should expand $HOME in paths", () => {
    const home = process.env.HOME || "/home/user";
    const result = resolveAllowedDirs(["$HOME/test"]);
    expect(result[0]).toBe(`${home}/test`);
  });

  it("should keep absolute paths as-is", () => {
    const result = resolveAllowedDirs(["/tmp/test"]);
    expect(result[0]).toBe("/tmp/test");
  });

  it("should handle empty array", () => {
    const result = resolveAllowedDirs([]);
    expect(result).toEqual([]);
  });

  it("should handle multiple paths", () => {
    const result = resolveAllowedDirs(["/tmp", "/var"]);
    expect(result).toEqual(["/tmp", "/var"]);
  });
});

describe("isPathAllowed", () => {
  it("should allow paths within allowed directories", async () => {
    const allowedDirs = ["/tmp/test", "/var"];
    expect(await isPathAllowed("/tmp/test/file.txt", allowedDirs)).toBe(true);
    expect(await isPathAllowed("/tmp/test/subdir/file.txt", allowedDirs)).toBe(true);
  });

  it("should reject paths outside allowed directories", async () => {
    const allowedDirs = ["/tmp/test"];
    expect(await isPathAllowed("/etc/passwd", allowedDirs)).toBe(false);
    expect(await isPathAllowed("/var/file.txt", allowedDirs)).toBe(false);
  });

  it("should allow file within allowed directory", async () => {
    const allowedDirs = ["/tmp/test"];
    expect(await isPathAllowed("/tmp/test/file.txt", allowedDirs)).toBe(true);
  });

  it("should handle trailing slashes", async () => {
    const allowedDirs = ["/tmp"];
    expect(await isPathAllowed("/tmp/file.txt", allowedDirs)).toBe(true);
  });

  it("should reject path traversal attempts", async () => {
    const allowedDirs = ["/tmp/test"];
    expect(await isPathAllowed("/tmp/test/../etc/passwd", allowedDirs)).toBe(false);
  });
});

describe("isPathAllowedSync", () => {
  it("should allow paths within allowed directories", () => {
    const allowedDirs = ["/tmp/test", "/var"];
    expect(isPathAllowedSync("/tmp/test/file.txt", allowedDirs)).toBe(true);
    expect(isPathAllowedSync("/tmp/test/subdir/file.txt", allowedDirs)).toBe(true);
  });

  it("should reject paths outside allowed directories", () => {
    const allowedDirs = ["/tmp/test"];
    expect(isPathAllowedSync("/etc/passwd", allowedDirs)).toBe(false);
    expect(isPathAllowedSync("/var/file.txt", allowedDirs)).toBe(false);
  });

  it("should allow file within allowed directory", () => {
    const allowedDirs = ["/tmp/test"];
    expect(isPathAllowedSync("/tmp/test/file.txt", allowedDirs)).toBe(true);
  });

  it("should handle trailing slashes", () => {
    const allowedDirs = ["/tmp"];
    expect(isPathAllowedSync("/tmp/file.txt", allowedDirs)).toBe(true);
  });

  it("should reject path traversal attempts", () => {
    const allowedDirs = ["/tmp/test"];
    expect(isPathAllowedSync("/tmp/test/../etc/passwd", allowedDirs)).toBe(false);
  });
});
