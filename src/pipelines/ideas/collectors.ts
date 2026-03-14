/**
 * Trend-intersection data collectors.
 *
 * Three focused collectors that produce STRUCTURED data:
 * 1. detectTrends() — what's moving in app store rankings
 * 2. clusterPainPoints() — what's broken in trending categories
 * 3. scanCapabilities() — what new tech/shifts enable solutions
 */

import { getDb } from "../../store/db";
import { createLogger } from "../../logger";
import type { TrendData, TrendingApp, CategoryTrend, ClusteredPains, PainCluster, CapabilityScan, Capability } from "./types";

const log = createLogger("pipeline:collectors");

// ── Step 1: Trend Detection ─────────────────────────────────────────────

export async function detectTrends(): Promise<TrendData> {
  const db = getDb();

  // Find apps that moved up the most in rankings (both stores)
  const risingApps: TrendingApp[] = [];

  try {
    // App Store: apps rising in rank
    const iosRising = (await db`
      WITH latest AS (
        SELECT app_id, list_type, rank, scraped_at
        FROM appstore_ranking_history
        WHERE scraped_at = (SELECT MAX(scraped_at) FROM appstore_ranking_history WHERE list_type != 'discovered')
          AND list_type != 'discovered'
      ),
      previous AS (
        SELECT DISTINCT ON (app_id, list_type) app_id, list_type, rank
        FROM appstore_ranking_history
        WHERE scraped_at < (SELECT MAX(scraped_at) FROM appstore_ranking_history WHERE list_type != 'discovered') - 43200
          AND list_type != 'discovered'
        ORDER BY app_id, list_type, scraped_at DESC
      )
      SELECT a.name, a.category, l.rank as new_rank, p.rank as old_rank,
             (p.rank - l.rank) as rank_change, l.list_type
      FROM latest l
      JOIN previous p ON l.app_id = p.app_id AND l.list_type = p.list_type
      JOIN appstore_apps a ON a.id = l.app_id
      WHERE p.rank - l.rank > 2
      ORDER BY (p.rank - l.rank) DESC
      LIMIT 20
    `) as Array<Record<string, unknown>>;

    for (const r of iosRising) {
      risingApps.push({
        name: r.name as string,
        category: r.category as string,
        rank: r.new_rank as number,
        rankChange: r.rank_change as number,
        listType: r.list_type as string,
        store: "appstore",
      });
    }

    // Play Store: same pattern
    const androidRising = (await db`
      WITH latest AS (
        SELECT app_id, list_type, rank, scraped_at
        FROM playstore_ranking_history
        WHERE scraped_at = (SELECT MAX(scraped_at) FROM playstore_ranking_history WHERE list_type != 'discovered')
          AND list_type != 'discovered'
      ),
      previous AS (
        SELECT DISTINCT ON (app_id, list_type) app_id, list_type, rank
        FROM playstore_ranking_history
        WHERE scraped_at < (SELECT MAX(scraped_at) FROM playstore_ranking_history WHERE list_type != 'discovered') - 43200
          AND list_type != 'discovered'
        ORDER BY app_id, list_type, scraped_at DESC
      )
      SELECT a.name, a.category, l.rank as new_rank, p.rank as old_rank,
             (p.rank - l.rank) as rank_change, l.list_type
      FROM latest l
      JOIN previous p ON l.app_id = p.app_id AND l.list_type = p.list_type
      JOIN playstore_apps a ON a.id = l.app_id
      WHERE p.rank - l.rank > 2
      ORDER BY (p.rank - l.rank) DESC
      LIMIT 20
    `) as Array<Record<string, unknown>>;

    for (const r of androidRising) {
      risingApps.push({
        name: r.name as string,
        category: r.category as string,
        rank: r.new_rank as number,
        rankChange: r.rank_change as number,
        listType: r.list_type as string,
        store: "playstore",
      });
    }
  } catch (err) {
    log.warn("Trend detection query failed", { err });
  }

  // Aggregate into category trends
  const catMap = new Map<string, { changes: number[]; apps: string[]; store: string }>();
  for (const app of risingApps) {
    const key = `${app.category}|${app.store}`;
    const existing = catMap.get(key) ?? { changes: [], apps: [], store: app.store };
    existing.changes.push(app.rankChange);
    existing.apps.push(app.name);
    catMap.set(key, existing);
  }

  const trendingCategories: CategoryTrend[] = [...catMap.entries()]
    .map(([key, val]) => ({
      category: key.split("|")[0]!,
      store: val.store as "appstore" | "playstore",
      newEntrants: val.apps.length,
      avgRankChange: val.changes.reduce((a, b) => a + b, 0) / val.changes.length,
      topApps: val.apps.slice(0, 5),
    }))
    .sort((a, b) => b.avgRankChange - a.avgRankChange)
    .slice(0, 10);

  // Build summary
  const summaryLines: string[] = [];
  if (risingApps.length > 0) {
    summaryLines.push(`=== RISING APPS (${risingApps.length} apps moving up in rankings) ===`);
    for (const app of risingApps.slice(0, 15)) {
      summaryLines.push(`  ${app.name} (${app.category}, ${app.store}) moved up ${app.rankChange} positions to #${app.rank}`);
    }
  }
  if (trendingCategories.length > 0) {
    summaryLines.push(`\n=== TRENDING CATEGORIES ===`);
    for (const cat of trendingCategories) {
      summaryLines.push(`  ${cat.category} (${cat.store}): ${cat.newEntrants} rising apps, avg +${cat.avgRankChange.toFixed(1)} rank change`);
    }
  }

  // Also include top apps by category to show what's dominating
  try {
    const topByCategory = (await db`
      SELECT a.name, a.category, r.rank, r.list_type
      FROM appstore_apps a
      JOIN (
        SELECT DISTINCT ON (app_id, list_type) app_id, list_type, rank
        FROM appstore_ranking_history
        ORDER BY app_id, list_type, scraped_at DESC
      ) r ON a.id = r.app_id
      WHERE r.list_type != 'discovered' AND r.rank <= 5
      ORDER BY r.list_type, r.rank
      LIMIT 50
    `) as Array<Record<string, unknown>>;

    if (topByCategory.length > 0) {
      summaryLines.push(`\n=== CURRENT TOP 5 BY CATEGORY ===`);
      const byCat = new Map<string, string[]>();
      for (const app of topByCategory) {
        const cat = app.list_type as string;
        const list = byCat.get(cat) ?? [];
        list.push(`#${app.rank} ${app.name}`);
        byCat.set(cat, list);
      }
      for (const [cat, apps] of byCat) {
        summaryLines.push(`  ${cat}: ${apps.join(", ")}`);
      }
    }
  } catch {
    // non-fatal
  }

  log.info("Trend detection complete", {
    risingApps: risingApps.length,
    trendingCategories: trendingCategories.length,
  });

  return {
    risingApps,
    trendingCategories,
    summary: summaryLines.join("\n"),
  };
}

// ── Step 2: Pain Point Clustering ───────────────────────────────────────

export async function clusterPainPoints(
  focusCategories?: readonly string[],
): Promise<ClusteredPains> {
  const db = getDb();
  const clusters: PainCluster[] = [];

  try {
    // Get complaints grouped by category and app
    // Focus on categories with the most complaints — or specified categories
    const complaints = focusCategories?.length
      ? (await db`
          SELECT a.category, a.name as app_name, r.title, r.content, r.rating
          FROM appstore_reviews r
          JOIN appstore_apps a ON a.id = r.app_id
          WHERE r.rating <= 2 AND a.category = ANY(${focusCategories as string[]})
          ORDER BY r.first_seen_at DESC
          LIMIT 300
        `) as Array<Record<string, unknown>>
      : (await db`
          SELECT a.category, a.name as app_name, r.title, r.content, r.rating
          FROM appstore_reviews r
          JOIN appstore_apps a ON a.id = r.app_id
          WHERE r.rating <= 2
          ORDER BY r.first_seen_at DESC
          LIMIT 300
        `) as Array<Record<string, unknown>>;

    // Also get Play Store complaints
    const playComplaints = focusCategories?.length
      ? (await db`
          SELECT a.category, a.name as app_name, r.title, r.content, r.rating
          FROM playstore_reviews r
          JOIN playstore_apps a ON a.id = r.app_id
          WHERE r.rating <= 2 AND a.category = ANY(${focusCategories as string[]})
          ORDER BY r.first_seen_at DESC
          LIMIT 300
        `) as Array<Record<string, unknown>>
      : (await db`
          SELECT a.category, a.name as app_name, r.title, r.content, r.rating
          FROM playstore_reviews r
          JOIN playstore_apps a ON a.id = r.app_id
          WHERE r.rating <= 2
          ORDER BY r.first_seen_at DESC
          LIMIT 300
        `) as Array<Record<string, unknown>>;

    // Combine and group by category
    const allComplaints = [...complaints, ...playComplaints];
    const byCat = new Map<string, Array<Record<string, unknown>>>();
    for (const c of allComplaints) {
      const cat = c.category as string;
      if (!cat) continue;
      const list = byCat.get(cat) ?? [];
      list.push(c);
      byCat.set(cat, list);
    }

    // For each category, create a pain cluster
    for (const [category, items] of byCat) {
      if (items.length < 3) continue;

      const apps = [...new Set(items.map((i) => i.app_name as string))];
      const samples = items
        .slice(0, 8)
        .map((i) => `[${i.rating}/5] "${i.app_name}": ${(i.content as string).slice(0, 150)}`);

      clusters.push({
        category,
        theme: category,
        complaintCount: items.length,
        sampleComplaints: samples,
        affectedApps: apps.slice(0, 5),
      });
    }

    clusters.sort((a, b) => b.complaintCount - a.complaintCount);
  } catch (err) {
    log.warn("Pain point clustering failed", { err });
  }

  const summaryLines = clusters.slice(0, 10).map((c) => {
    return [
      `=== ${c.category.toUpperCase()} (${c.complaintCount} complaints across ${c.affectedApps.length} apps) ===`,
      `Apps: ${c.affectedApps.join(", ")}`,
      ...c.sampleComplaints.map((s) => `  ${s}`),
    ].join("\n");
  });

  log.info("Pain point clustering complete", { clusters: clusters.length });

  return {
    clusters: clusters.slice(0, 15),
    summary: summaryLines.join("\n\n"),
  };
}

// ── Step 3: Capability Scan ─────────────────────────────────────────────

export async function scanCapabilities(): Promise<CapabilityScan> {
  const db = getDb();
  const capabilities: Capability[] = [];

  try {
    // Product Hunt: recent launches with high engagement
    const phProducts = (await db`
      SELECT name, tagline, description, url, website_url, votes_count, comments_count
      FROM ph_products
      ORDER BY (votes_count + comments_count * 3) DESC
      LIMIT 15
    `) as Array<Record<string, unknown>>;

    for (const p of phProducts) {
      capabilities.push({
        title: `${p.name}: ${p.tagline}`,
        source: "producthunt",
        url: (p.url as string) || (p.website_url as string) || "",
        description: (p.description as string)?.slice(0, 200) ?? "",
        type: "new_tech",
      });
    }

    // HN: top stories showing what tech community cares about
    const hnStories = (await db`
      SELECT title, url, hn_url, points, comment_count
      FROM hn_stories
      ORDER BY updated_at DESC, (points + comment_count * 2) DESC
      LIMIT 15
    `) as Array<Record<string, unknown>>;

    for (const s of hnStories) {
      capabilities.push({
        title: s.title as string,
        source: "hackernews",
        url: (s.url as string) || (s.hn_url as string) || "",
        description: `${s.points} points, ${s.comment_count} comments`,
        type: "new_tech",
      });
    }

    // GitHub: trending repos = building blocks available
    const repos = (await db`
      SELECT full_name, description, language, stars, stars_today, url
      FROM github_repos
      ORDER BY stars_today DESC, stars DESC
      LIMIT 15
    `) as Array<Record<string, unknown>>;

    for (const r of repos) {
      capabilities.push({
        title: `${r.full_name} (${r.language || "?"})`,
        source: "github",
        url: (r.url as string) || `https://github.com/${r.full_name}`,
        description: `${(r.description as string)?.slice(0, 150) ?? ""} — ${r.stars} stars (+${r.stars_today} today)`,
        type: "open_source",
      });
    }

    // Reddit: what real users discuss
    const posts = (await db`
      SELECT title, selftext, subreddit, score, num_comments, permalink
      FROM reddit_posts
      ORDER BY updated_at DESC, (score + num_comments * 3) DESC
      LIMIT 10
    `) as Array<Record<string, unknown>>;

    for (const p of posts) {
      capabilities.push({
        title: `r/${p.subreddit}: ${p.title}`,
        source: "reddit",
        url: p.permalink ? `https://reddit.com${p.permalink}` : "",
        description: `${p.score} pts, ${p.num_comments} comments${p.selftext ? `. ${(p.selftext as string).slice(0, 100)}` : ""}`,
        type: "behavior_shift",
      });
    }

    // News: recent market shifts
    const cutoff72h = Math.floor(Date.now() / 1000) - 72 * 3600;
    const articles = (await db`
      SELECT title, url, source_name, summary
      FROM news_articles
      WHERE scraped_at >= ${cutoff72h}
      ORDER BY scraped_at DESC
      LIMIT 10
    `) as Array<Record<string, unknown>>;

    for (const a of articles) {
      capabilities.push({
        title: a.title as string,
        source: "news",
        url: (a.url as string) || "",
        description: (a.summary as string)?.slice(0, 150) ?? "",
        type: "behavior_shift",
      });
    }

    // X/Twitter: real-time social signals
    const tweets = (await db`
      SELECT author_username, text, likes, retweets, views
      FROM x_scraped_tweets
      ORDER BY scraped_at DESC
      LIMIT 10
    `) as Array<Record<string, unknown>>;

    for (const t of tweets) {
      capabilities.push({
        title: `@${t.author_username}`,
        source: "x",
        url: "",
        description: (t.text as string)?.slice(0, 200) ?? "",
        type: "behavior_shift",
      });
    }
  } catch (err) {
    log.warn("Capability scan failed", { err });
  }

  const summaryLines: string[] = [];
  const bySource = new Map<string, Capability[]>();
  for (const c of capabilities) {
    const list = bySource.get(c.source) ?? [];
    list.push(c);
    bySource.set(c.source, list);
  }

  for (const [source, items] of bySource) {
    summaryLines.push(`=== ${source.toUpperCase()} (${items.length} items) ===`);
    for (const item of items) {
      summaryLines.push(`  ${item.title}${item.url ? `\n    URL: ${item.url}` : ""}\n    ${item.description}`);
    }
    summaryLines.push("");
  }

  log.info("Capability scan complete", { capabilities: capabilities.length });

  return {
    capabilities,
    summary: summaryLines.join("\n"),
  };
}
