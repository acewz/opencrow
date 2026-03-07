import React, { useState } from "react";
import { cn } from "../../lib/cn";
import { apiFetch } from "../../api";
import { Button, Toggle, Input } from "../../components";
import type {
  XAccount,
  AccountResponse,
  TimelineCap,
  PostingCap,
  InteractionsCap,
  NotificationsCap,
} from "./types";
import {
  DEFAULT_CAPABILITIES,
  TIMELINE_SCHEDULES,
  POSTING_SCHEDULES,
  NOTIFICATION_SCHEDULES,
  PAGE_PRESETS,
} from "./types";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScheduleChips({
  presets,
  value,
  onChange,
  label,
}: {
  readonly presets: ReadonlyArray<{ readonly label: string; readonly cron: string | null }>;
  readonly value: string | null;
  readonly onChange: (cron: string | null) => void;
  readonly label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-heading text-[0.68rem] font-semibold uppercase tracking-widest text-faint">
        {label}
      </span>
      <div className="flex gap-1.5 flex-wrap">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            className={cn(
              "py-2 px-4 rounded-full border font-mono text-sm font-medium cursor-pointer transition-colors",
              value === p.cron
                ? "bg-accent-subtle border-accent text-accent font-semibold"
                : "bg-bg-2 border-border text-muted hover:bg-accent-subtle hover:border-accent hover:text-accent",
            )}
            onClick={() => onChange(p.cron)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PageChips({
  value,
  onChange,
  label,
}: {
  readonly value: number;
  readonly onChange: (n: number) => void;
  readonly label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-heading text-[0.68rem] font-semibold uppercase tracking-widest text-faint">
        {label}
      </span>
      <div className="flex gap-1.5 flex-wrap">
        {PAGE_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            className={cn(
              "py-1.5 px-4 rounded-full border font-mono text-xs font-medium cursor-pointer transition-colors",
              value === n
                ? "bg-accent-subtle border-accent text-accent font-semibold"
                : "bg-bg-2 border-border text-muted hover:bg-accent-subtle hover:border-accent hover:text-accent",
            )}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function LimitSlider({
  value,
  onChange,
  label,
  max,
}: {
  readonly value: number;
  readonly onChange: (n: number) => void;
  readonly label: string;
  readonly max: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-muted whitespace-nowrap min-w-[100px]">
        {label}
      </span>
      <div className="flex items-center gap-2.5 flex-1">
        <input
          type="range"
          className="flex-1 appearance-none h-1 rounded-sm bg-bg-3 outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent-subtle [&::-webkit-slider-thumb]:cursor-pointer"
          min={0}
          max={max}
          step={max <= 200 ? 5 : 10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="font-mono text-sm font-semibold text-foreground min-w-8 text-right">
          {value}
        </span>
      </div>
    </div>
  );
}

function CapSection({
  icon,
  label,
  enabled,
  onToggle,
  children,
}: {
  readonly icon: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly onToggle: (v: boolean) => void;
  readonly children: React.ReactNode;
}) {
  const [open, setOpen] = useState(enabled);

  return (
    <div
      className={cn(
        "border rounded-lg mb-2.5 overflow-hidden transition-colors last:mb-0",
        enabled ? "border-accent" : "border-border",
      )}
    >
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer bg-bg-2 select-none transition-colors hover:bg-bg-3"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "text-xs text-faint transition-transform mr-2",
              open && "rotate-90",
            )}
          >
            {"▶"}
          </span>
          <span className="text-base w-6 text-center">{icon}</span>
          <span className="font-heading text-sm font-semibold text-strong tracking-tight">
            {label}
          </span>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle checked={enabled} onChange={onToggle} />
        </div>
      </div>
      <div
        className={cn(
          "flex flex-col gap-4 px-5 pt-3.5 pb-5",
          !open && "hidden",
          !enabled && "opacity-35 pointer-events-none",
        )}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CapabilitiesSectionProps {
  readonly account: XAccount;
  readonly onSaved: () => void;
}

export function CapabilitiesSection({ account, onSaved }: CapabilitiesSectionProps) {
  const merged = {
    timeline: {
      ...DEFAULT_CAPABILITIES.timeline,
      ...account.capabilities.timeline,
    },
    posting: {
      ...DEFAULT_CAPABILITIES.posting,
      ...account.capabilities.posting,
    },
    interactions: {
      ...DEFAULT_CAPABILITIES.interactions,
      ...account.capabilities.interactions,
    },
    notifications: {
      ...DEFAULT_CAPABILITIES.notifications,
      ...account.capabilities.notifications,
    },
  };

  const [timeline, setTimeline] = useState<TimelineCap>(merged.timeline);
  const [posting, setPosting] = useState<PostingCap>(merged.posting);
  const [interactions, setInteractions] = useState<InteractionsCap>(merged.interactions);
  const [notifications, setNotifications] = useState<NotificationsCap>(merged.notifications);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await apiFetch<AccountResponse>(`/api/x/accounts/${account.id}/capabilities`, {
        method: "PUT",
        body: JSON.stringify({ timeline, posting, interactions, notifications }),
      });
      onSaved();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? "Failed to save capabilities");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-bg-1 rounded-lg p-4 border border-border mb-6">
      <div className="font-heading text-xs font-bold uppercase tracking-widest text-faint mb-4">
        Capabilities
      </div>

      {error && (
        <div className="text-danger text-sm font-mono px-4 py-2.5 bg-danger-subtle border border-border rounded-md mb-4 break-words">
          {error}
        </div>
      )}

      <CapSection
        icon={"📰"}
        label="Timeline Scraping"
        enabled={timeline.enabled}
        onToggle={(v) => setTimeline({ ...timeline, enabled: v })}
      >
        <ScheduleChips
          label="Frequency"
          presets={TIMELINE_SCHEDULES}
          value={timeline.schedule}
          onChange={(cron) =>
            setTimeline({ ...timeline, schedule: cron ?? "0 */2 * * *" })
          }
        />
        <PageChips
          label="Depth (pages)"
          value={timeline.max_pages}
          onChange={(n) => setTimeline({ ...timeline, max_pages: n })}
        />
        <div className="flex flex-col gap-2">
          <span className="font-heading text-[0.68rem] font-semibold uppercase tracking-widest text-faint">
            Target users
          </span>
          <Input
            type="text"
            value={timeline.target_users.join(", ")}
            onChange={(e) =>
              setTimeline({
                ...timeline,
                target_users: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Empty = home feed, or: elonmusk, openai"
          />
        </div>
      </CapSection>

      <CapSection
        icon={"✍️"}
        label="Posting"
        enabled={posting.enabled}
        onToggle={(v) => setPosting({ ...posting, enabled: v })}
      >
        <ScheduleChips
          label="Frequency"
          presets={POSTING_SCHEDULES}
          value={posting.schedule}
          onChange={(cron) => setPosting({ ...posting, schedule: cron })}
        />
        <Toggle
          label="Auto Reply"
          checked={posting.auto_reply}
          onChange={(v) => setPosting({ ...posting, auto_reply: v })}
        />
        <div className="flex flex-col gap-2">
          <span className="font-heading text-[0.68rem] font-semibold uppercase tracking-widest text-faint">
            Reply keywords
          </span>
          <Input
            type="text"
            value={posting.reply_keywords.join(", ")}
            onChange={(e) =>
              setPosting({
                ...posting,
                reply_keywords: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="AI, machine learning, crypto"
          />
        </div>
      </CapSection>

      <CapSection
        icon={"🤝"}
        label="Interactions"
        enabled={interactions.enabled}
        onToggle={(v) => setInteractions({ ...interactions, enabled: v })}
      >
        <div className="flex flex-col gap-1">
          <Toggle
            label="Auto Like"
            checked={interactions.auto_like}
            onChange={(v) => setInteractions({ ...interactions, auto_like: v })}
          />
          <Toggle
            label="Auto Retweet"
            checked={interactions.auto_retweet}
            onChange={(v) => setInteractions({ ...interactions, auto_retweet: v })}
          />
          <Toggle
            label="Auto Follow Back"
            checked={interactions.auto_follow_back}
            onChange={(v) =>
              setInteractions({ ...interactions, auto_follow_back: v })
            }
          />
        </div>
        <LimitSlider
          label="Daily likes"
          value={interactions.daily_like_limit}
          max={500}
          onChange={(n) => setInteractions({ ...interactions, daily_like_limit: n })}
        />
        <LimitSlider
          label="Daily retweets"
          value={interactions.daily_retweet_limit}
          max={200}
          onChange={(n) =>
            setInteractions({ ...interactions, daily_retweet_limit: n })
          }
        />
      </CapSection>

      <CapSection
        icon={"🔔"}
        label="Notifications"
        enabled={notifications.enabled}
        onToggle={(v) => setNotifications({ ...notifications, enabled: v })}
      >
        <ScheduleChips
          label="Frequency"
          presets={NOTIFICATION_SCHEDULES}
          value={notifications.schedule}
          onChange={(cron) =>
            setNotifications({
              ...notifications,
              schedule: cron ?? "*/30 * * * *",
            })
          }
        />
        <div className="flex flex-col gap-2">
          <span className="font-heading text-[0.68rem] font-semibold uppercase tracking-widest text-faint">
            Type
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "mentions"] as const).map((type) => (
              <button
                key={type}
                type="button"
                className={cn(
                  "py-2 px-4 rounded-full border font-mono text-sm font-medium cursor-pointer transition-colors",
                  notifications.type === type
                    ? "bg-accent-subtle border-accent text-accent font-semibold"
                    : "bg-bg-2 border-border text-muted hover:bg-accent-subtle hover:border-accent hover:text-accent",
                )}
                onClick={() => setNotifications({ ...notifications, type })}
              >
                {type === "all" ? "All" : "Mentions"}
              </button>
            ))}
          </div>
        </div>
        <PageChips
          label="Depth (pages)"
          value={notifications.max_pages}
          onChange={(n) => setNotifications({ ...notifications, max_pages: n })}
        />
      </CapSection>

      <div className="flex gap-3 mt-5 pt-4 border-t border-border">
        <Button size="sm" onClick={handleSave} loading={saving}>
          {saving ? "Saving..." : "Save Capabilities"}
        </Button>
      </div>
    </div>
  );
}
