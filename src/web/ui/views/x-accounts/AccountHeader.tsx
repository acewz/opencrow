import React, { useState } from "react";
import { Button, StatusBadge } from "../../components";
import type { XAccount } from "./types";

const statusColorMap: Record<string, string> = {
  active: "green",
  unverified: "yellow",
  expired: "red",
  error: "red",
};

interface AccountHeaderProps {
  readonly account: XAccount;
  readonly onVerify: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly verifying?: boolean;
}

export function AccountHeader({
  account,
  onVerify,
  onEdit,
  onDelete,
  verifying = false,
}: AccountHeaderProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const displayName = account.display_name ?? account.label;
  const initials = (account.username ?? displayName)
    .replace(/^@/, "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="border-b border-border bg-bg-1">
      <div className="flex items-center justify-between px-6 py-4 gap-4 flex-wrap">
        {/* Left: avatar + identity */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-heading font-bold text-sm shrink-0 bg-accent-subtle text-accent border border-border overflow-hidden">
            {account.profile_image_url ? (
              <img
                src={account.profile_image_url}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div>
            <div className="font-heading font-semibold text-base text-strong tracking-tight">
              {displayName}
            </div>
            <div className="font-mono text-sm text-muted">
              {account.username ? `@${account.username}` : account.label}
            </div>
          </div>
          <StatusBadge status={account.status} colorMap={statusColorMap} />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="primary" size="sm" onClick={onVerify} loading={verifying}>
            {verifying ? "Verifying..." : "Verify"}
          </Button>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Edit
          </Button>
          {confirmDelete ? (
            <>
              <span className="text-sm text-danger self-center">Delete?</span>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete();
                }}
              >
                Confirm
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {account.error_message && (
        <div className="px-6 py-2 bg-danger-subtle border-t border-border text-danger text-sm font-mono break-words">
          {account.error_message}
        </div>
      )}
    </div>
  );
}
