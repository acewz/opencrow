import React, { useState, useCallback } from "react";
import { z } from "zod";
import { cn } from "../../lib/cn";
import { apiFetch } from "../../api";
import { Button, Input, FormField } from "../../components";
import { useZodForm } from "../../hooks/useZodForm";
import { CapabilitiesSection } from "./CapabilitiesSection";
import type { XAccount, AccountResponse } from "./types";

const credentialsSchema = z.object({
  authToken: z.string().min(1, "Auth token is required"),
  ct0: z.string().min(1, "CT0 is required"),
});

// ---------------------------------------------------------------------------
// Credentials section
// ---------------------------------------------------------------------------

function CredentialsSection({
  account,
  onSaved,
}: {
  readonly account: XAccount;
  readonly onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [apiError, setApiError] = useState("");
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useZodForm(credentialsSchema, {
    defaultValues: { authToken: "", ct0: "" },
  });

  const redact = useCallback((raw: string) => {
    if (raw.length <= 8) return raw;
    return `${raw.slice(0, 8)}...`;
  }, []);

  async function onSubmit(values: z.infer<typeof credentialsSchema>) {
    setApiError("");
    setSaved(false);
    try {
      await apiFetch<AccountResponse>(`/api/x/accounts/${account.id}`, {
        method: "PUT",
        body: JSON.stringify({ auth_token: values.authToken.trim(), ct0: values.ct0.trim() }),
      });
      setSaved(true);
      reset();
      onSaved();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setApiError(apiErr.message ?? "Failed to update credentials");
    }
  }

  return (
    <div className="bg-bg-1 rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3.5 bg-bg-2 hover:bg-bg-3 transition-colors cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="font-heading text-xs font-bold uppercase tracking-widest text-faint">
          Credentials
        </span>
        <span
          className={cn(
            "text-xs text-faint transition-transform",
            expanded && "rotate-180",
          )}
        >
          ▼
        </span>
      </button>

      {expanded && (
        <div className="px-4 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="font-heading text-[0.68rem] font-semibold uppercase tracking-widest text-faint w-24 shrink-0">
                auth_token
              </span>
              <span className="font-mono text-xs text-muted bg-bg-2 px-2 py-1 rounded">
                {redact(account.auth_token)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-heading text-[0.68rem] font-semibold uppercase tracking-widest text-faint w-24 shrink-0">
                ct0
              </span>
              <span className="font-mono text-xs text-muted bg-bg-2 px-2 py-1 rounded">
                {redact(account.ct0)}
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="border-t border-border pt-4 flex flex-col gap-3">
            <div className="font-heading text-[0.68rem] font-semibold uppercase tracking-widest text-faint">
              Update Credentials
            </div>

            {apiError && (
              <div className="text-danger text-sm font-mono px-3 py-2 bg-danger-subtle border border-border rounded-md break-words">
                {apiError}
              </div>
            )}
            {saved && (
              <div className="text-success text-sm font-mono px-3 py-2 bg-success-subtle border border-border rounded-md">
                Credentials updated successfully
              </div>
            )}

            <FormField error={errors.authToken}>
              <label className="font-heading text-[0.68rem] font-semibold uppercase tracking-widest text-faint">
                auth_token
              </label>
              <Input
                type="password"
                {...register("authToken")}
                placeholder="New auth_token value"
              />
            </FormField>
            <FormField error={errors.ct0}>
              <label className="font-heading text-[0.68rem] font-semibold uppercase tracking-widest text-faint">
                ct0
              </label>
              <Input
                type="password"
                {...register("ct0")}
                placeholder="New ct0 value"
              />
            </FormField>

            <div className="flex gap-3 pt-1">
              <Button type="submit" size="sm" loading={isSubmitting}>
                {isSubmitting ? "Saving..." : "Update Credentials"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  setExpanded(false);
                  reset();
                  setApiError("");
                  setSaved(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface SettingsTabProps {
  readonly account: XAccount;
  readonly onSaved: () => void;
}

export function SettingsTab({ account, onSaved }: SettingsTabProps) {
  return (
    <div className="flex flex-col gap-0">
      <CapabilitiesSection account={account} onSaved={onSaved} />
      <CredentialsSection account={account} onSaved={onSaved} />
    </div>
  );
}
