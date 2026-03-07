import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../api";
import { FeatureStatusCard } from "./FeatureStatusCard";
import type { FeatureTab } from "./types";

interface JobStatus {
  readonly status: "running" | "stopped";
  readonly total_scraped?: number;
  readonly total_liked?: number;
  readonly total_followed?: number;
  readonly total_tweets?: number;
  readonly total_errors?: number;
  readonly last_error?: string | null;
}

interface StatusResult {
  readonly success: boolean;
  readonly data: JobStatus | null;
}

interface TabStatus {
  readonly job: JobStatus | null;
  readonly error: boolean;
}

interface OverviewTabProps {
  readonly accountId: string;
  readonly onNavigate: (tab: FeatureTab) => void;
}

/**
 * Overview dashboard for an X account — shows 4 feature status cards in a 2×2 grid.
 * Each card links to the corresponding feature tab.
 */
export function OverviewTab({ accountId, onNavigate }: OverviewTabProps) {
  const [statuses, setStatuses] = useState<{
    likes: TabStatus;
    follow: TabStatus;
    bookmarks: TabStatus;
    timeline: TabStatus;
  }>({
    likes: { job: null, error: false },
    follow: { job: null, error: false },
    bookmarks: { job: null, error: false },
    timeline: { job: null, error: false },
  });
  const [loading, setLoading] = useState(true);

  const loadStatuses = useCallback(async () => {
    const settle = async (url: string): Promise<TabStatus> => {
      try {
        const res = await apiFetch<StatusResult>(url);
        return { job: res.success ? res.data : null, error: !res.success };
      } catch {
        return { job: null, error: true };
      }
    };

    const [likes, follow, bookmarks, timeline] = await Promise.all([
      settle(`/api/x/interactions/status?account_id=${accountId}`),
      settle(`/api/x/follow/status?account_id=${accountId}`),
      settle(`/api/x/bookmarks/status?account_id=${accountId}`),
      settle(`/api/x/timeline/status?account_id=${accountId}`),
    ]);

    setStatuses({ likes, follow, bookmarks, timeline });
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="w-4 h-4 border-2 border-border-2 border-t-accent rounded-full animate-spin inline-block" />
      </div>
    );
  }

  const isRunning = (s: TabStatus): boolean | null =>
    s.error ? null : s.job !== null && s.job?.status === "running";

  return (
    <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
      <FeatureStatusCard
        title="Auto Likes"
        isRunning={isRunning(statuses.likes)}
        stats={[
          { label: "scraped", value: statuses.likes.job?.total_scraped ?? 0 },
          { label: "liked", value: statuses.likes.job?.total_liked ?? 0 },
        ]}
        lastError={statuses.likes.job?.last_error}
        onClick={() => onNavigate("auto-likes")}
      />
      <FeatureStatusCard
        title="Auto Follow"
        isRunning={isRunning(statuses.follow)}
        stats={[
          { label: "followed", value: statuses.follow.job?.total_followed ?? 0 },
        ]}
        lastError={statuses.follow.job?.last_error}
        onClick={() => onNavigate("auto-follow")}
      />
      <FeatureStatusCard
        title="Bookmarks"
        isRunning={isRunning(statuses.bookmarks)}
        stats={[]}
        lastError={statuses.bookmarks.job?.last_error}
        onClick={() => onNavigate("bookmarks")}
      />
      <FeatureStatusCard
        title="Timeline"
        isRunning={isRunning(statuses.timeline)}
        stats={[
          { label: "tweets", value: statuses.timeline.job?.total_tweets ?? 0 },
        ]}
        lastError={statuses.timeline.job?.last_error}
        onClick={() => onNavigate("timeline")}
      />
    </div>
  );
}
