import React, { useState, useEffect } from "react";
import { apiFetch } from "../api";
import { PageHeader, LoadingState, EmptyState, FeedRow, Button } from "../components";

interface AppRankingRow {
  id: string;
  name: string;
  artist: string;
  category: string;
  rank: number;
  list_type: string;
  icon_url: string;
  store_url: string;
  updated_at: number;
  indexed_at: number | null;
}

interface AppReviewRow {
  id: string;
  app_id: string;
  app_name: string;
  author: string;
  rating: number;
  title: string;
  content: string;
  version: string;
  first_seen_at: number;
  indexed_at: number | null;
}

interface StatsData {
  total_apps: number;
  total_reviews: number;
  last_updated_at: number | null;
}

type Tab = "rankings" | "reviews";
type ListFilter = "all" | "top-free" | "top-paid";

function ratingStars(rating: number): string {
  return "\u2605".repeat(rating) + "\u2606".repeat(5 - rating);
}

function formatTime(epoch: number | null): string {
  if (!epoch) return "Never";
  return new Date(epoch * 1000).toLocaleString();
}

export default function AppStore() {
  const [tab, setTab] = useState<Tab>("rankings");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [rankings, setRankings] = useState<AppRankingRow[]>([]);
  const [reviews, setReviews] = useState<AppReviewRow[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [listFilter]);

  async function fetchAll() {
    try {
      const listParam = listFilter === "all" ? "" : `&list_type=${listFilter}`;
      const [rankingsRes, reviewsRes, statsRes] = await Promise.all([
        apiFetch<{ success: boolean; data: AppRankingRow[] }>(
          `/api/appstore/rankings?limit=100${listParam}`,
        ),
        apiFetch<{ success: boolean; data: AppReviewRow[] }>(
          "/api/appstore/reviews?limit=100",
        ),
        apiFetch<{ success: boolean; data: StatsData }>(
          "/api/appstore/stats",
        ),
      ]);
      if (rankingsRes.success) setRankings(rankingsRes.data);
      if (reviewsRes.success) setReviews(reviewsRes.data);
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

  return (
    <div>
      <PageHeader
        title="App Store"
        subtitle={
          stats &&
          `${stats.total_apps} apps | ${stats.total_reviews} reviews | Last updated: ${formatTime(stats.last_updated_at)}`
        }
        actions={
          <div className="flex gap-2 items-center">
            <Button
              size="sm"
              variant={tab === "rankings" ? "primary" : "ghost"}
              onClick={() => setTab("rankings")}
            >
              Rankings
            </Button>
            <Button
              size="sm"
              variant={tab === "reviews" ? "primary" : "ghost"}
              onClick={() => setTab("reviews")}
            >
              Reviews
            </Button>
          </div>
        }
      />

      {tab === "rankings" && (
        <>
          <div className="flex gap-2 mb-3">
            {(["all", "top-free", "top-paid"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={listFilter === f ? "primary" : "ghost"}
                onClick={() => setListFilter(f)}
              >
                {f === "all" ? "All" : f === "top-free" ? "Top Free" : "Top Paid"}
              </Button>
            ))}
          </div>

          {rankings.length === 0 ? (
            <EmptyState description="No rankings data yet." />
          ) : (
            <div className="flex flex-col gap-0.5">
              {rankings.map((app) => (
                <FeedRow
                  key={`${app.id}-${app.list_type}`}
                  rank={app.rank}
                  title={app.name}
                  url={app.store_url}
                  meta={
                    <>
                      <span>{app.artist}</span>
                      {app.category && <span> | {app.category}</span>}
                      <span> | {app.list_type}</span>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "reviews" && (
        <>
          {reviews.length === 0 ? (
            <EmptyState description="No low-rated reviews yet." />
          ) : (
            <div className="flex flex-col gap-0.5">
              {reviews.map((review) => (
                <FeedRow
                  key={review.id}
                  title={review.title || "(No title)"}
                  meta={
                    <>
                      <span>{review.app_name}</span>
                      {review.author && <span> | by {review.author}</span>}
                      {review.version && <span> | v{review.version}</span>}
                    </>
                  }
                  stats={
                    <span className="text-accent font-semibold font-mono">
                      {ratingStars(review.rating)}
                    </span>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
