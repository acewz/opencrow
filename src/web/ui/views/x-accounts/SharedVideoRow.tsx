import { timeAgo } from "../../lib/format";

interface SharedVideoRowProps {
  readonly id: string;
  readonly sourceTweetId: string;
  readonly sourceAuthor: string;
  readonly sourceUrl: string;
  readonly sharedAt: number;
}

/**
 * A single row card for a shared bookmark video, extracted from BookmarkSharing.tsx.
 * Shows the tweet author, a link to the source tweet, and the time it was shared.
 */
export function SharedVideoRow({
  sourceTweetId,
  sourceAuthor,
  sourceUrl,
  sharedAt,
}: SharedVideoRowProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-md transition-colors hover:bg-bg-2 max-sm:flex-col max-sm:items-start max-sm:gap-1.5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-mono text-sm font-semibold text-foreground whitespace-nowrap">
          @{sourceAuthor || "unknown"}
        </span>
        {sourceUrl ? (
          <a
            className="font-sans text-xs text-accent no-underline transition-colors hover:text-accent-hover"
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View tweet
          </a>
        ) : (
          <span className="font-mono text-xs text-faint">{sourceTweetId}</span>
        )}
      </div>
      <span className="font-sans text-xs text-faint whitespace-nowrap shrink-0">
        {timeAgo(sharedAt)}
      </span>
    </div>
  );
}
