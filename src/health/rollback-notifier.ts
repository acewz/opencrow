import { join } from "path"
import { homedir } from "os"
import { rename } from "fs/promises"
import { createLogger } from "../logger"

const log = createLogger("health:rollback")

const ROLLBACK_LOG = join(homedir(), ".opencrow", "rollback.log")

export interface RollbackEvent {
  timestamp: string
  from: string
  to: string
  reason: string
}

export async function consumeRollbackEvents(): Promise<RollbackEvent[]> {
  const file = Bun.file(ROLLBACK_LOG)
  if (!(await file.exists())) return []

  // Atomic rename-then-read to avoid race with guardian writing new events
  const consumePath = ROLLBACK_LOG + ".consuming"
  try {
    await rename(ROLLBACK_LOG, consumePath)
  } catch {
    return []
  }

  const raw = (await Bun.file(consumePath).text()).trim()
  if (!raw) {
    await Bun.write(consumePath, "")
    return []
  }

  const events: RollbackEvent[] = []
  for (const line of raw.split("\n")) {
    try {
      const parsed = JSON.parse(line) as RollbackEvent
      events.push(parsed)
    } catch {
      log.warn("Skipping malformed rollback log line", { line })
    }
  }

  // Clear the consumed file
  await Bun.write(consumePath, "")
  log.info("Consumed rollback events", { count: events.length })

  return events
}
