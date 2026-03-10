import { createLogger } from "../logger";

const log = createLogger("secrets");

/**
 * Retrieve a secret by key. Checks the DB secrets namespace first, then falls
 * back to the process environment. Returns undefined when neither source has a
 * value.
 *
 * Handles the case where the DB is not yet initialized: if `getOverride` throws
 * (e.g. because initDb() has not been called yet) we silently fall back to the
 * environment variable.
 */
export async function getSecret(key: string): Promise<string | undefined> {
  try {
    // Lazy import so that this module can be imported before initDb() is called
    // without triggering the "DB not initialized" error at import time.
    const { getOverride } = await import("../store/config-overrides");
    const dbValue = await getOverride("secrets", key);
    if (dbValue !== null && typeof dbValue === "string" && dbValue !== "") {
      return dbValue;
    }
  } catch (err) {
    // DB not yet initialized or query failed — fall through to env
    log.debug("getSecret: DB lookup failed, using env fallback", { key, err });
  }

  return process.env[key] || undefined;
}
