export type AccountStatus = "unverified" | "active" | "expired" | "error";

export interface TimelineCap {
  enabled: boolean;
  schedule: string;
  target_users: string[];
  max_pages: number;
}

export interface PostingCap {
  enabled: boolean;
  schedule: string | null;
  auto_reply: boolean;
  reply_keywords: string[];
}

export interface InteractionsCap {
  enabled: boolean;
  auto_like: boolean;
  auto_retweet: boolean;
  auto_follow_back: boolean;
  daily_like_limit: number;
  daily_retweet_limit: number;
}

export interface NotificationsCap {
  enabled: boolean;
  schedule: string;
  type: "all" | "mentions";
  max_pages: number;
}

export interface Capabilities {
  timeline?: TimelineCap;
  posting?: PostingCap;
  interactions?: InteractionsCap;
  notifications?: NotificationsCap;
}

export const DEFAULT_CAPABILITIES: Required<Capabilities> = {
  timeline: {
    enabled: false,
    schedule: "0 */2 * * *",
    target_users: [],
    max_pages: 3,
  },
  posting: {
    enabled: false,
    schedule: null,
    auto_reply: false,
    reply_keywords: [],
  },
  interactions: {
    enabled: false,
    auto_like: false,
    auto_retweet: false,
    auto_follow_back: false,
    daily_like_limit: 50,
    daily_retweet_limit: 20,
  },
  notifications: {
    enabled: false,
    schedule: "*/30 * * * *",
    type: "all",
    max_pages: 2,
  },
};

// Schedule presets: human-readable label <-> cron expression
export const TIMELINE_SCHEDULES = [
  { label: "30m", cron: "*/30 * * * *" },
  { label: "1h", cron: "0 * * * *" },
  { label: "2h", cron: "0 */2 * * *" },
  { label: "4h", cron: "0 */4 * * *" },
  { label: "6h", cron: "0 */6 * * *" },
  { label: "12h", cron: "0 */12 * * *" },
] as const;

export const POSTING_SCHEDULES = [
  { label: "Manual", cron: null },
  { label: "1h", cron: "0 * * * *" },
  { label: "2h", cron: "0 */2 * * *" },
  { label: "4h", cron: "0 */4 * * *" },
  { label: "6h", cron: "0 */6 * * *" },
] as const;

export const NOTIFICATION_SCHEDULES = [
  { label: "15m", cron: "*/15 * * * *" },
  { label: "30m", cron: "*/30 * * * *" },
  { label: "1h", cron: "0 * * * *" },
  { label: "2h", cron: "0 */2 * * *" },
  { label: "4h", cron: "0 */4 * * *" },
] as const;

export const PAGE_PRESETS = [1, 2, 3, 5, 10] as const;

export interface XAccount {
  id: string;
  label: string;
  username: string | null;
  display_name: string | null;
  profile_image_url: string | null;
  auth_token: string;
  ct0: string;
  status: AccountStatus;
  verified_at: number | null;
  error_message: string | null;
  capabilities: Capabilities;
  created_at: number;
  updated_at: number;
}

export interface AccountsResponse {
  success: boolean;
  data: XAccount[];
}

export interface AccountResponse {
  success: boolean;
  data: XAccount;
}

export interface MutationResponse {
  success: boolean;
  message?: string;
  error?: string;
}
