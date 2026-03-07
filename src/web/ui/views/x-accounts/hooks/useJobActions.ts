import { useState, useCallback } from "react";
import { apiFetch } from "../../../api";

export interface JobActionsConfig {
  readonly startUrl: string;
  readonly stopUrl: string;
  readonly runNowUrl: string;
  readonly accountId: string;
  readonly startBody?: Record<string, unknown>;
  readonly onSuccess?: () => void;
}

export interface JobActionsResult {
  readonly handleStart: (extraBody?: Record<string, unknown>) => Promise<void>;
  readonly handleStop: () => Promise<void>;
  readonly handleRunNow: () => Promise<void>;
  readonly actionLoading: boolean;
  readonly error: string | null;
  readonly clearError: () => void;
}

interface RunNowData {
  readonly ok: boolean;
  readonly detail?: string;
  readonly reason?: string;
}

/**
 * Generic hook for start / stop / run-now job API actions.
 * Each handler sets actionLoading while the request is in flight and
 * surfaces any failure through the error field.
 */
export function useJobActions(config: JobActionsConfig): JobActionsResult {
  const { startUrl, stopUrl, runNowUrl, accountId, startBody, onSuccess } = config;
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const handleStart = useCallback(
    async (extraBody?: Record<string, unknown>) => {
      setError(null);
      setActionLoading(true);
      try {
        await apiFetch(startUrl, {
          method: "POST",
          body: JSON.stringify({
            account_id: accountId,
            ...startBody,
            ...extraBody,
          }),
        });
        onSuccess?.();
      } catch (err: unknown) {
        const apiErr = err as { message?: string };
        setError(apiErr.message ?? "Failed to start");
      } finally {
        setActionLoading(false);
      }
    },
    [startUrl, accountId, startBody, onSuccess],
  );

  const handleStop = useCallback(async () => {
    setError(null);
    setActionLoading(true);
    try {
      await apiFetch(stopUrl, {
        method: "POST",
        body: JSON.stringify({ account_id: accountId }),
      });
      onSuccess?.();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? "Failed to stop");
    } finally {
      setActionLoading(false);
    }
  }, [stopUrl, accountId, onSuccess]);

  const handleRunNow = useCallback(async () => {
    setError(null);
    setActionLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; data: RunNowData }>(
        runNowUrl,
        {
          method: "POST",
          body: JSON.stringify({ account_id: accountId }),
        },
      );
      if (res.success && !res.data.ok) {
        setError(res.data.detail ?? res.data.reason ?? "Run failed");
      } else {
        onSuccess?.();
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? "Run failed");
    } finally {
      setActionLoading(false);
    }
  }, [runNowUrl, accountId, onSuccess]);

  return { handleStart, handleStop, handleRunNow, actionLoading, error, clearError };
}
