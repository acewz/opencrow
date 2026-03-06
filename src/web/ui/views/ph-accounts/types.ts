export type AccountStatus = "unverified" | "active" | "expired" | "error";

export interface FeedCap {
  enabled: boolean;
  schedule: string;
  max_pages: number;
  target_topics: string[];
  target_products: string[];
}

export interface UpvotingCap {
  enabled: boolean;
  auto_upvote: boolean;
  daily_upvote_limit: number;
  upvote_keywords: string[];
  upvote_topics: string[];
}

export interface CommentingCap {
  enabled: boolean;
  auto_comment: boolean;
  daily_comment_limit: number;
  comment_keywords: string[];
  comment_template: string;
}

export interface Capabilities {
  feed?: FeedCap;
  upvoting?: UpvotingCap;
  commenting?: CommentingCap;
}

export const DEFAULT_CAPABILITIES: Required<Capabilities> = {
  feed: {
    enabled: false,
    schedule: "0 */4 * * *",
    max_pages: 3,
    target_topics: [],
    target_products: [],
  },
  upvoting: {
    enabled: false,
    auto_upvote: false,
    daily_upvote_limit: 20,
    upvote_keywords: [],
    upvote_topics: [],
  },
  commenting: {
    enabled: false,
    auto_comment: false,
    daily_comment_limit: 5,
    comment_keywords: [],
    comment_template: "",
  },
};

export interface PHAccount {
  id: string;
  label: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  cookie_count: number;
  session_preview: string;
  status: AccountStatus;
  verified_at: number | null;
  error_message: string | null;
  capabilities: Capabilities;
  created_at: number;
  updated_at: number;
}

export interface AccountsResponse {
  success: boolean;
  data: PHAccount[];
}

export interface AccountResponse {
  success: boolean;
  data: PHAccount;
}

export interface MutationResponse {
  success: boolean;
  message?: string;
  error?: string;
}
