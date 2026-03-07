/** Account verification utilities — replaces Python verify scripts. */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type VerifyResult =
  | {
      readonly ok: true;
      readonly username: string;
      readonly display_name: string;
      readonly profile_image_url?: string;
      readonly avatar_url?: string;
    }
  | {
      readonly ok: false;
      readonly error: string;
    };

// ── X/Twitter ────────────────────────────────────────────────────────────────

const X_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

export async function verifyXAccount(
  authToken: string,
  ct0: string,
): Promise<VerifyResult> {
  try {
    const resp = await fetch(
      "https://api.x.com/1.1/account/verify_credentials.json",
      {
        headers: {
          Authorization: `Bearer ${X_BEARER}`,
          "x-csrf-token": ct0,
          Cookie: `auth_token=${authToken}; ct0=${ct0}`,
          "User-Agent": USER_AGENT,
        },
      },
    );

    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, error: "Credentials expired or invalid" };
    }

    if (!resp.ok) {
      return { ok: false, error: `X API returned ${resp.status}` };
    }

    const data = (await resp.json()) as Record<string, unknown>;
    return {
      ok: true,
      username: String(data.screen_name ?? ""),
      display_name: String(data.name ?? ""),
      profile_image_url: String(
        data.profile_image_url_https ?? "",
      ).replace("_normal", ""),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Verification failed",
    };
  }
}

// ── Reddit ───────────────────────────────────────────────────────────────────

interface CookieEntry {
  readonly name: string;
  readonly value: string;
  readonly domain?: string;
  readonly [key: string]: unknown;
}

function buildCookieHeader(cookiesJson: string, domainFilter: string): string {
  try {
    const cookies = JSON.parse(cookiesJson) as CookieEntry[];
    if (!Array.isArray(cookies)) return "";
    return cookies
      .filter((c) => c.name && c.value && c.domain?.includes(domainFilter))
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  } catch {
    return "";
  }
}

export async function verifyRedditAccount(
  cookiesJson: string,
): Promise<VerifyResult> {
  try {
    const cookieHeader = buildCookieHeader(cookiesJson, "reddit.com");
    if (!cookieHeader) {
      return { ok: false, error: "No valid Reddit cookies found" };
    }

    const resp = await fetch("https://www.reddit.com/api/me.json", {
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader,
        "User-Agent": USER_AGENT,
      },
      redirect: "manual",
    });

    if (!resp.ok) {
      return { ok: false, error: `Reddit API returned ${resp.status}` };
    }

    const data = (await resp.json()) as Record<string, unknown>;
    const userKind = data.kind as string | undefined;

    if (userKind !== "t2" && !data.name) {
      return { ok: false, error: "Cookies expired or invalid" };
    }

    const snoo = (data.subreddit ?? data.data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      username: String(data.name ?? ""),
      display_name: String(
        snoo.display_name_prefixed ?? snoo.title ?? data.name ?? "",
      ),
      avatar_url: String(snoo.icon_img ?? data.icon_img ?? ""),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Verification failed",
    };
  }
}

// ── Product Hunt ─────────────────────────────────────────────────────────────

export async function verifyPHAccount(
  cookiesJson: string,
): Promise<VerifyResult> {
  try {
    const cookieHeader = buildCookieHeader(cookiesJson, "producthunt.com");
    if (!cookieHeader) {
      return { ok: false, error: "No valid Product Hunt cookies found" };
    }

    const resp = await fetch("https://www.producthunt.com/frontend/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookieHeader,
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        operationName: "Viewer",
        variables: {},
        query: "query Viewer { viewer { user { id username name headline profileImage } } }",
      }),
    });

    if (!resp.ok) {
      return { ok: false, error: `Product Hunt API returned ${resp.status}` };
    }

    const body = (await resp.json()) as Record<string, unknown>;
    const gqlData = (body.data ?? {}) as Record<string, unknown>;
    const viewer = (gqlData.viewer ?? {}) as Record<string, unknown>;
    const user = (viewer.user ?? null) as Record<string, unknown> | null;

    if (!user) {
      return { ok: false, error: "Cookies expired or invalid" };
    }

    return {
      ok: true,
      username: String(user.username ?? ""),
      display_name: String(user.name ?? ""),
      avatar_url: String(user.profileImage ?? ""),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Verification failed",
    };
  }
}
