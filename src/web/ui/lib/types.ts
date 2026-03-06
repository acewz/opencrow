/** Shared types for the OpenCrow web UI. */

export interface MutationResponse {
  readonly success: boolean;
  readonly error?: string;
}

export interface ApiListResponse<T> {
  readonly success: boolean;
  readonly data: readonly T[];
}

export interface ApiDataResponse<T> {
  readonly success: boolean;
  readonly data: T;
}

export type AccountStatus = "active" | "paused" | "error" | "suspended";
