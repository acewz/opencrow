import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api";
import { LoadingState, PageHeader, Toggle, Button } from "../components";
import { useToast } from "../components/Toast";

interface ScraperMeta {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

interface FeaturesResponse {
  readonly scrapers: {
    readonly available: readonly ScraperMeta[];
    readonly enabled: readonly string[];
  };
  readonly qdrant: { readonly enabled: boolean };
  readonly market: { readonly enabled: boolean };
}

function SectionCard({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="bg-bg-1 border border-border rounded-xl p-6 mb-5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-strong">{title}</h2>
        <p className="text-sm text-muted mt-1">{description}</p>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { success, error: toastError } = useToast();

  const [features, setFeatures] = useState<FeaturesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Local draft state for scrapers (enabled set)
  const [enabledScrapers, setEnabledScrapers] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [scrapersDirty, setScrapersDirty] = useState(false);
  const [scrapersSaving, setScrapersSaving] = useState(false);

  const [qdrantSaving, setQdrantSaving] = useState(false);
  const [marketSaving, setMarketSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: FeaturesResponse }>("/api/features");
      setFeatures(res.data);
      setEnabledScrapers(new Set(res.data.scrapers.enabled));
      setScrapersDirty(false);
    } catch {
      toastError("Failed to load feature settings.");
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    load();
  }, [load]);

  function handleScraperToggle(id: string, checked: boolean) {
    setEnabledScrapers((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
    setScrapersDirty(true);
  }

  async function handleSaveScrapers() {
    setScrapersSaving(true);
    try {
      await apiFetch("/api/features/scrapers", {
        method: "PUT",
        body: JSON.stringify({ enabled: [...enabledScrapers] }),
      });
      setScrapersDirty(false);
      success("Scraper settings saved.");
    } catch {
      toastError("Failed to save scraper settings.");
    } finally {
      setScrapersSaving(false);
    }
  }

  async function handleQdrantToggle(checked: boolean) {
    if (!features) return;
    setQdrantSaving(true);
    try {
      await apiFetch("/api/features/qdrant", {
        method: "PUT",
        body: JSON.stringify({ enabled: checked }),
      });
      setFeatures((prev) =>
        prev ? { ...prev, qdrant: { enabled: checked } } : prev,
      );
      success(`Qdrant ${checked ? "enabled" : "disabled"}.`);
    } catch {
      toastError("Failed to update Qdrant setting.");
    } finally {
      setQdrantSaving(false);
    }
  }

  async function handleMarketToggle(checked: boolean) {
    if (!features) return;
    setMarketSaving(true);
    try {
      await apiFetch("/api/features/market", {
        method: "PUT",
        body: JSON.stringify({ enabled: checked }),
      });
      setFeatures((prev) =>
        prev ? { ...prev, market: { enabled: checked } } : prev,
      );
      success(`Market data ${checked ? "enabled" : "disabled"}.`);
    } catch {
      toastError("Failed to update market data setting.");
    } finally {
      setMarketSaving(false);
    }
  }

  if (loading) return <LoadingState message="Loading settings..." />;

  if (!features) return null;

  return (
    <div className="max-w-[760px]">
      <PageHeader
        title="Settings"
        subtitle="Manage infrastructure features and integrations"
      />

      {/* Scrapers */}
      <SectionCard
        title="Scrapers"
        description="Enable or disable individual data scrapers. Changes take effect on the next scraper run."
      >
        {features.scrapers.available.length === 0 ? (
          <p className="text-sm text-muted">No scrapers available.</p>
        ) : (
          <div className="flex flex-col gap-0">
            {features.scrapers.available.map((scraper, i) => (
              <div
                key={scraper.id}
                className={`flex items-center justify-between py-3 ${
                  i < features.scrapers.available.length - 1
                    ? "border-b border-border"
                    : ""
                }`}
              >
                <div className="min-w-0 pr-4">
                  <div className="text-sm font-medium text-foreground">
                    {scraper.name}
                  </div>
                  {scraper.description && (
                    <div className="text-xs text-muted mt-0.5">
                      {scraper.description}
                    </div>
                  )}
                </div>
                <Toggle
                  checked={enabledScrapers.has(scraper.id)}
                  onChange={(checked) =>
                    handleScraperToggle(scraper.id, checked)
                  }
                />
              </div>
            ))}
          </div>
        )}

        {scrapersDirty && (
          <div className="mt-5 flex justify-end">
            <Button
              variant="primary"
              onClick={handleSaveScrapers}
              disabled={scrapersSaving}
            >
              {scrapersSaving ? "Saving..." : "Save Scrapers"}
            </Button>
          </div>
        )}
      </SectionCard>

      {/* Qdrant */}
      <SectionCard
        title="Qdrant (RAG Memory)"
        description="Vector database for agent long-term memory and semantic search. Disabling this turns off RAG retrieval for all agents."
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">
              Enable Qdrant
            </div>
            <div className="text-xs text-muted mt-0.5">
              {features.qdrant.enabled
                ? "Qdrant is active — agents can read and write memory."
                : "Qdrant is disabled — RAG memory is unavailable."}
            </div>
          </div>
          <Toggle
            checked={features.qdrant.enabled}
            onChange={handleQdrantToggle}
            disabled={qdrantSaving}
          />
        </div>
      </SectionCard>

      {/* Market Data */}
      <SectionCard
        title="Market Data (QuestDB)"
        description="Time-series market data pipeline powered by QuestDB. Disabling this stops market data ingestion and the Markets view."
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">
              Enable Market Data
            </div>
            <div className="text-xs text-muted mt-0.5">
              {features.market.enabled
                ? "Market data is active — candlestick and futures data are live."
                : "Market data is disabled — the Markets view will be empty."}
            </div>
          </div>
          <Toggle
            checked={features.market.enabled}
            onChange={handleMarketToggle}
            disabled={marketSaving}
          />
        </div>
      </SectionCard>
    </div>
  );
}
