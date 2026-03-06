import React, { useState, useEffect } from "react";
import { apiFetch } from "../api";
import { PageHeader, LoadingState, EmptyState, FeedRow } from "../components";

interface ProtocolRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly chain: string;
  readonly tvl: number;
  readonly tvl_prev: number | null;
  readonly change_1d: number | null;
  readonly change_7d: number | null;
  readonly url: string;
  readonly description: string;
  readonly first_seen_at: number;
  readonly updated_at: number;
}

interface ChainTvlRow {
  readonly id: string;
  readonly name: string;
  readonly tvl: number;
  readonly tvl_prev: number | null;
  readonly protocols_count: number;
  readonly updated_at: number;
}

interface StatsData {
  readonly total_protocols: number;
  readonly last_updated_at: number | null;
  readonly chains: number;
  readonly categories: number;
}

type Tab = "Protocols" | "Top Movers" | "Chains";

function formatTvl(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatChange(value: number | null): React.ReactNode {
  if (value == null) return <span className="text-faint">--</span>;
  const sign = value >= 0 ? "+" : "";
  const color = value >= 0 ? "text-success" : "text-danger";
  return (
    <span className={color}>
      {sign}
      {value.toFixed(2)}%
    </span>
  );
}

function formatTime(epoch: number | null): string {
  if (!epoch) return "Never";
  return new Date(epoch * 1000).toLocaleString();
}

export default function DefiLlama() {
  const [tab, setTab] = useState<Tab>("Protocols");
  const [protocols, setProtocols] = useState<ProtocolRow[]>([]);
  const [movers, setMovers] = useState<ProtocolRow[]>([]);
  const [chains, setChains] = useState<ChainTvlRow[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    try {
      const [protocolsRes, moversRes, chainsRes, statsRes] = await Promise.all([
        apiFetch<{ success: boolean; data: ProtocolRow[] }>(
          "/api/defi/protocols?limit=100",
        ),
        apiFetch<{ success: boolean; data: ProtocolRow[] }>(
          "/api/defi/movers?limit=50",
        ),
        apiFetch<{ success: boolean; data: ChainTvlRow[] }>(
          "/api/defi/chains?limit=100",
        ),
        apiFetch<{ success: boolean; data: StatsData }>("/api/defi/stats"),
      ]);
      if (protocolsRes.success) setProtocols(protocolsRes.data);
      if (moversRes.success) setMovers(moversRes.data);
      if (chainsRes.success) setChains(chainsRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingState message="Loading..." />;
  }

  const tabs: readonly Tab[] = ["Protocols", "Top Movers", "Chains"];

  return (
    <div>
      <PageHeader
        title="DefiLlama"
        subtitle={
          stats &&
          `${stats.total_protocols} protocols | ${stats.chains} chains | Last updated: ${formatTime(stats.last_updated_at)}`
        }
      />

      <div className="flex gap-1 mb-4">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === t
                ? "bg-accent text-white"
                : "bg-surface text-faint hover:text-primary"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Protocols" && <ProtocolsList protocols={protocols} />}
      {tab === "Top Movers" && <MoversList movers={movers} />}
      {tab === "Chains" && <ChainsList chains={chains} />}
    </div>
  );
}

function ProtocolsList({
  protocols,
}: {
  readonly protocols: readonly ProtocolRow[];
}) {
  if (protocols.length === 0) {
    return <EmptyState description="No protocols found." />;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {protocols.map((p, i) => (
        <FeedRow
          key={p.id}
          rank={i + 1}
          title={p.name}
          url={p.url}
          meta={
            <>
              <span>TVL: {formatTvl(p.tvl)}</span>
              <span> | 24h: {formatChange(p.change_1d)}</span>
              <span> | 7d: {formatChange(p.change_7d)}</span>
            </>
          }
          stats={
            <>
              <span className="text-faint">{p.category}</span>
              <span className="text-faint"> | {p.chain}</span>
            </>
          }
        />
      ))}
    </div>
  );
}

function MoversList({ movers }: { readonly movers: readonly ProtocolRow[] }) {
  if (movers.length === 0) {
    return <EmptyState description="No movers found." />;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {movers.map((p, i) => (
        <FeedRow
          key={p.id}
          rank={i + 1}
          title={p.name}
          url={p.url}
          meta={
            <>
              <span>TVL: {formatTvl(p.tvl)}</span>
              <span> | 24h: {formatChange(p.change_1d)}</span>
              <span> | 7d: {formatChange(p.change_7d)}</span>
            </>
          }
          stats={
            <>
              <span className="text-faint">{p.category}</span>
              <span className="text-faint"> | {p.chain}</span>
            </>
          }
        />
      ))}
    </div>
  );
}

function ChainsList({ chains }: { readonly chains: readonly ChainTvlRow[] }) {
  if (chains.length === 0) {
    return <EmptyState description="No chain data found." />;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {chains.map((c, i) => (
        <FeedRow
          key={c.id}
          rank={i + 1}
          title={c.name}
          meta={<span>TVL: {formatTvl(c.tvl)}</span>}
          stats={
            <span className="text-faint">{c.protocols_count} protocols</span>
          }
        />
      ))}
    </div>
  );
}
