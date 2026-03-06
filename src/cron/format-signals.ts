import type { ResearchSignal } from "../sources/ideas/signals-store";
import { escapeHtml } from "../channels/telegram/format";

const SIGNAL_TYPE_EMOJI: Record<string, string> = {
  trend: "\u{1F4C8}",
  pain_point: "\u{1F622}",
  capability: "\u26A1",
  gap: "\u{1F573}\uFE0F",
  catalyst: "\u{1F525}",
  competition: "\u2694\uFE0F",
};

const MAX_LENGTH = 3000;

function trimTo(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

function formatSignalBlock(signal: ResearchSignal, index: number): string {
  const emoji = SIGNAL_TYPE_EMOJI[signal.signal_type] ?? "\u{1F50D}";
  const title = escapeHtml(signal.title);
  const source = escapeHtml(signal.source);
  const strength = "\u2B50".repeat(Math.min(signal.strength, 5));

  return [
    `${emoji} <b>${index + 1}. ${title}</b>`,
    `<i>${escapeHtml(signal.signal_type.replace(/_/g, " "))}</i> | ${source} | ${strength}`,
  ].join("\n");
}

export function formatSignalsMessage(
  jobName: string,
  signals: readonly ResearchSignal[],
): string {
  if (signals.length === 0) {
    return `<b>${escapeHtml(jobName)}</b>\n\nNo new signals found this run.`;
  }

  const label = jobName.replace(/-/g, " ");
  const header = `\u{1F50D} <b>${escapeHtml(label)}</b> \u2014 ${signals.length} signal${signals.length !== 1 ? "s" : ""} saved`;

  const themeCounts = new Map<string, number>();
  for (const s of signals) {
    if (!s.themes) continue;
    for (const t of s.themes.split(",")) {
      const theme = t.trim();
      if (theme) themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
    }
  }

  const topThemes = [...themeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme, count]) => `${escapeHtml(theme)} (${count})`)
    .join(", ");

  const themeSection = topThemes
    ? `\n<i>Top themes: ${topThemes}</i>`
    : "";

  const blocks = signals.map((s, i) => formatSignalBlock(s, i));
  const full = [header + themeSection, ...blocks].join("\n\n");

  if (full.length <= MAX_LENGTH) return full;

  const budgetPerSignal = Math.floor(
    (MAX_LENGTH - header.length - themeSection.length - 100) / signals.length,
  );

  const shortBlocks = signals.map((s, i) => {
    const emoji = SIGNAL_TYPE_EMOJI[s.signal_type] ?? "\u{1F50D}";
    const title = trimTo(escapeHtml(s.title), Math.max(budgetPerSignal - 30, 40));
    return `${emoji} <b>${i + 1}. ${title}</b>`;
  });

  return [header + themeSection, ...shortBlocks]
    .join("\n\n")
    .slice(0, MAX_LENGTH);
}
