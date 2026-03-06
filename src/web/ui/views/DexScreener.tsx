import React, { useState, useEffect } from "react";
import { cn } from "../lib/cn";
import { apiFetch } from "../api";
import { PageHeader, LoadingState, EmptyState, FilterTabs } from "../components";

interface TokenRecord {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly address: string;
  readonly chainId: string;
  readonly priceUsd: string;
  readonly priceChange24h: number;
  readonly volume24h: number;
  readonly liquidityUsd?: number;
  readonly marketCap?: number;
  readonly pairUrl: string;
  readonly imageUrl?: string;
  readonly boostAmount: number;
  readonly isTrending: boolean;
  readonly isNew: boolean;
  readonly scrapedAt: number;
}

interface ChainStats {
  readonly chainId: string;
  readonly trendingCount: number;
  readonly newCount: number;
  readonly latestScrape: number;
}

type TabKey = "trending" | "new";

const CHAIN_LABELS: Readonly<Record<string, string>> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
};

const CHAIN_COLORS: Readonly<Record<string, string>> = {
  solana: "bg-purple/15 text-purple",
  ethereum: "bg-accent-subtle text-accent",
  base: "bg-cyan-subtle text-cyan",
};

const TH = "text-[10px] font-semibold text-faint uppercase tracking-[0.1em] px-4 py-2.5 whitespace-nowrap";
const TD = "px-4 py-3 whitespace-nowrap";

function formatPrice(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "$0";
  if (num >= 1_000) return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (num >= 1) return `$${num.toFixed(2)}`;
  if (num >= 0.01) return `$${num.toFixed(4)}`;
  return `$${num.toFixed(6)}`;
}

function formatCompact(value: number | null | undefined): string {
  if (value == null || value === 0) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function TokenIcon({ url, symbol }: { readonly url?: string; readonly symbol: string }) {
  if (!url) {
    return (
      <div className="w-7 h-7 rounded-full bg-bg-3 flex items-center justify-center text-[9px] font-bold text-muted shrink-0">
        {symbol.slice(0, 2)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="w-7 h-7 rounded-full bg-bg-3 shrink-0 object-cover"
      loading="lazy"
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );
}

function TokenRow({ token, rank, style }: {
  readonly token: TokenRecord;
  readonly rank: number;
  readonly style?: React.CSSProperties;
}) {
  const change = token.priceChange24h;
  const isUp = change >= 0;

  return (
    <tr
      className="border-b border-border/50 transition-colors hover:bg-bg-1 cursor-pointer group"
      style={style}
      onClick={() => window.open(token.pairUrl, "_blank", "noopener,noreferrer")}
    >
      <td className={cn(TD, "text-right text-faint font-mono text-xs w-10")}>
        {rank}
      </td>
      <td className={cn(TD, "text-left")}>
        <div className="flex items-center gap-2.5">
          <TokenIcon url={token.imageUrl} symbol={token.symbol} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-strong font-semibold text-[13px] group-hover:text-accent transition-colors">
                {token.symbol}
              </span>
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider leading-none",
                CHAIN_COLORS[token.chainId] ?? "bg-bg-3 text-muted",
              )}>
                {CHAIN_LABELS[token.chainId] ?? token.chainId}
              </span>
            </div>
            <span className="text-muted text-[11px] truncate block max-w-[180px]">
              {token.name}
            </span>
          </div>
        </div>
      </td>
      <td className={cn(TD, "text-right font-mono text-[13px] text-foreground tabular-nums")}>
        {formatPrice(token.priceUsd)}
      </td>
      <td className={cn(TD, "text-right")}>
        <span className={cn(
          "font-mono text-[13px] font-semibold tabular-nums",
          isUp ? "text-success" : "text-danger",
        )}>
          {isUp ? "+" : ""}{change.toFixed(2)}%
        </span>
      </td>
      <td className={cn(TD, "text-right font-mono text-[13px] text-muted tabular-nums")}>
        {formatCompact(token.volume24h)}
      </td>
      <td className={cn(TD, "text-right font-mono text-[13px] text-muted tabular-nums max-md:hidden")}>
        {formatCompact(token.liquidityUsd)}
      </td>
      <td className={cn(TD, "text-right font-mono text-[13px] text-muted tabular-nums max-md:hidden")}>
        {formatCompact(token.marketCap)}
      </td>
    </tr>
  );
}

export default function DexScreener() {
  const [tab, setTab] = useState<TabKey>("trending");
  const [chain, setChain] = useState("all");
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [stats, setStats] = useState<ChainStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [tab, chain]);

  async function fetchAll() {
    try {
      const chainParam = chain === "all" ? "" : `&chain=${chain}`;

      const [statsRes, dataRes] = await Promise.all([
        apiFetch<{ success: boolean; data: ChainStats[] }>("/api/dex/stats"),
        tab === "trending"
          ? apiFetch<{ success: boolean; data: TokenRecord[] }>(
              `/api/dex/pairs?limit=100${chainParam}`,
            )
          : apiFetch<{ success: boolean; data: TokenRecord[] }>(
              `/api/dex/new-pairs?limit=100${chainParam}`,
            ),
      ]);

      if (statsRes.success) setStats(statsRes.data);
      if (dataRes.success) setTokens(dataRes.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  const totalTrending = stats.reduce((s, c) => s + Number(c.trendingCount || 0), 0);
  const totalNew = stats.reduce((s, c) => s + Number(c.newCount || 0), 0);

  const chainOptions = [
    { id: "all", label: "All Chains" },
    ...stats.map((s) => ({
      id: s.chainId,
      label: CHAIN_LABELS[s.chainId] ?? s.chainId,
      count: Number(tab === "trending" ? s.trendingCount : s.newCount),
    })),
  ];

  return (
    <div>
      <PageHeader
        title="DexScreener"
        subtitle={`${totalTrending} trending · ${totalNew} new tokens`}
      />

      <FilterTabs
        tabs={[
          { id: "trending", label: "Trending", count: totalTrending },
          { id: "new", label: "New Tokens", count: totalNew },
        ]}
        active={tab}
        onChange={(id) => setTab(id as TabKey)}
      />

      {stats.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-5">
          {chainOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setChain(opt.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors duration-150 border",
                chain === opt.id
                  ? "bg-bg-2 border-border-hover text-strong"
                  : "bg-transparent border-border text-muted hover:bg-bg-1 hover:text-foreground",
              )}
            >
              {opt.label}
              {"count" in opt && opt.count !== undefined && (
                <span className="ml-1.5 text-faint">{opt.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <LoadingState message="Loading tokens..." />
      ) : tokens.length === 0 ? (
        <EmptyState description="No tokens found for this filter." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-bg-1/50">
                <th className={cn(TH, "text-right w-10")}>#</th>
                <th className={cn(TH, "text-left")}>Token</th>
                <th className={cn(TH, "text-right")}>Price</th>
                <th className={cn(TH, "text-right")}>24h %</th>
                <th className={cn(TH, "text-right")}>Volume</th>
                <th className={cn(TH, "text-right max-md:hidden")}>Liquidity</th>
                <th className={cn(TH, "text-right max-md:hidden")}>MCap</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token, idx) => (
                <TokenRow
                  key={token.id}
                  token={token}
                  rank={idx + 1}
                  style={{ animationDelay: `${Math.min(idx * 20, 400)}ms` }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
