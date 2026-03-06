import { getDb } from "../store/db";
import type { ProcessName, ProcessRecord } from "./types";

export async function registerProcess(
  name: ProcessName,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const pid = process.pid;
  const metadataJson = JSON.stringify(metadata);

  await db`
    INSERT INTO process_registry (name, pid, started_at, last_heartbeat, metadata_json)
    VALUES (${name}, ${pid}, ${now}, ${now}, ${metadataJson})
    ON CONFLICT (name) DO UPDATE SET
      pid = ${pid},
      started_at = ${now},
      last_heartbeat = ${now},
      metadata_json = ${metadataJson}
  `;
}

export async function heartbeat(
  name: ProcessName,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const pid = process.pid;
  const metadataJson = JSON.stringify(metadata);

  await db`
    INSERT INTO process_registry (name, pid, started_at, last_heartbeat, metadata_json)
    VALUES (${name}, ${pid}, ${now}, ${now}, ${metadataJson})
    ON CONFLICT (name) DO UPDATE SET
      last_heartbeat = ${now},
      pid = ${pid}
  `;
}

export async function unregisterProcess(name: ProcessName): Promise<void> {
  const db = getDb();
  await db`DELETE FROM process_registry WHERE name = ${name}`;
}

export async function listProcesses(): Promise<readonly ProcessRecord[]> {
  const db = getDb();
  const rows = await db`SELECT * FROM process_registry ORDER BY name`;

  return rows.map((r: Record<string, unknown>) => ({
    name: r.name as ProcessName,
    pid: Number(r.pid),
    startedAt: Number(r.started_at),
    lastHeartbeat: Number(r.last_heartbeat),
    metadata: JSON.parse((r.metadata_json as string) || "{}"),
  }));
}

export async function getProcess(
  name: ProcessName,
): Promise<ProcessRecord | null> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM process_registry WHERE name = ${name}
  `;

  if (rows.length === 0) return null;

  const r = rows[0] as Record<string, unknown>;
  return {
    name: r.name as ProcessName,
    pid: Number(r.pid),
    startedAt: Number(r.started_at),
    lastHeartbeat: Number(r.last_heartbeat),
    metadata: JSON.parse((r.metadata_json as string) || "{}"),
  };
}
