import { createLogger } from "../../logger";
import type { DefiProtocolForIndex } from "../../memory/types";
import { upsertProtocols } from "./store";
import {
  fetchJson,
  delay,
  formatTvl,
  formatChange,
  PROTOCOLS_URL,
  DEX_VOLUMES_URL,
  REQUEST_DELAY_MS,
} from "./api";
import type { RawProtocol, RawDexProtocol, ProtocolRow } from "./types";

const log = createLogger("defillama-protocols");

const MIN_TVL_USD = 100_000;

// --- Mappers ---

export function rawProtocolToRow(raw: RawProtocol): ProtocolRow {
  const now = Math.floor(Date.now() / 1000);
  const chains = raw.chains ?? [];
  const primaryChain =
    chains.length === 1
      ? (chains[0] ?? "unknown")
      : chains.length > 1
        ? "multi"
        : (raw.chain ?? "unknown");

  return {
    id: raw.slug,
    name: raw.name ?? "",
    category: raw.category ?? "Unknown",
    chain: primaryChain,
    chains_json: JSON.stringify(chains),
    tvl: raw.tvl ?? 0,
    tvl_prev: null,
    change_1d: raw.change_1d ?? null,
    change_7d: raw.change_7d ?? null,
    url: raw.url ?? `https://defillama.com/protocol/${raw.slug}`,
    description: raw.description ?? "",
    first_seen_at: now,
    updated_at: now,
    indexed_at: null,
  };
}

export function protocolToDefiProtocolForIndex(p: ProtocolRow): DefiProtocolForIndex {
  return {
    id: `defillama-${p.id}`,
    name: p.name,
    category: p.category,
    chain: p.chain,
    tvl: p.tvl,
    change1d: p.change_1d,
    change7d: p.change_7d,
    description: p.description ?? "",
    url: p.url,
    updatedAt: p.updated_at,
  };
}

// --- Fetchers ---

export async function fetchProtocols(): Promise<readonly ProtocolRow[]> {
  const raw = await fetchJson<readonly RawProtocol[]>(PROTOCOLS_URL);
  if (raw === null) return [];
  return raw
    .filter((p) => p.slug && p.tvl !== undefined && p.tvl >= MIN_TVL_USD)
    .map(rawProtocolToRow);
}

export async function fetchDexVolumesGlobal(): Promise<
  ReadonlyMap<string, { total24h: number; change1d: number | null }>
> {
  const url = `${DEX_VOLUMES_URL}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`;
  const raw = await fetchJson<{
    readonly protocols?: readonly RawDexProtocol[];
  }>(url);

  if (raw === null) return new Map();

  const map = new Map<string, { total24h: number; change1d: number | null }>();

  if (raw.protocols) {
    for (const dex of raw.protocols) {
      if (dex.slug && dex.total24h) {
        map.set(dex.slug, {
          total24h: dex.total24h,
          change1d: dex.change_1d ?? null,
        });
      }
    }
  }

  return map;
}

// --- Orchestrator ---

export async function scrapeProtocols(): Promise<{ protocols: number }> {
  const protocolRows = await fetchProtocols();
  await delay(REQUEST_DELAY_MS);

  const dexVolumes = await fetchDexVolumesGlobal();

  const enrichedProtocols = protocolRows.map((p) => {
    const dexData = dexVolumes.get(p.id);
    if (!dexData) return p;

    const enrichedDescription = p.description
      ? `${p.description} | 24h Volume: ${formatTvl(dexData.total24h)}`
      : `24h Volume: ${formatTvl(dexData.total24h)}`;

    return { ...p, description: enrichedDescription };
  });

  const protocols = await upsertProtocols(enrichedProtocols);
  return { protocols };
}
