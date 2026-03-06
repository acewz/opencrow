import React, { useState, useEffect } from "react";
import { apiFetch } from "../../api";
import { Button, LoadingState, EmptyState, PageHeader } from "../../components";
import BookmarkSharing from "../BookmarkSharing";
import AutoLikes from "../AutoLikes";
import AutoFollow from "../AutoFollow";
import TimelineScrape from "../TimelineScrape";
import type {
  XAccount,
  AccountsResponse,
  AccountResponse,
  MutationResponse,
} from "./types";
import { AccountCreateForm, AccountEditForm, AccountCard } from "./AccountCard";
import { CapabilitiesPanel } from "./CapabilitiesPanel";

export default function XAccounts() {
  const [accounts, setAccounts] = useState<XAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<XAccount | null>(null);
  const [configuringAccount, setConfiguringAccount] = useState<XAccount | null>(
    null,
  );
  const [bookmarkAccount, setBookmarkAccount] = useState<XAccount | null>(null);
  const [autolikeAccount, setAutolikeAccount] = useState<XAccount | null>(null);
  const [autofollowAccount, setAutofollowAccount] = useState<XAccount | null>(
    null,
  );
  const [timelineAccount, setTimelineAccount] = useState<XAccount | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  async function loadAccounts() {
    try {
      const res = await apiFetch<AccountsResponse>("/api/x/accounts");
      if (res.success) {
        setAccounts(res.data);
      } else {
        setError("Failed to load accounts");
      }
    } catch {
      setError("Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  async function handleVerify(id: string) {
    setVerifyingId(id);
    try {
      const res = await apiFetch<AccountResponse>(
        `/api/x/accounts/${id}/verify`,
        { method: "POST" },
      );
      if (res.success) {
        setAccounts((prev) => prev.map((a) => (a.id === id ? res.data : a)));
      }
    } catch {
      await loadAccounts();
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch<MutationResponse>(`/api/x/accounts/${id}`, {
        method: "DELETE",
      });
      await loadAccounts();
    } catch {
      await loadAccounts();
    }
  }

  if (loading) {
    return <LoadingState message="Loading X accounts..." />;
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  return (
    <div>
      <PageHeader
        title="X Accounts"
        subtitle={`${accounts.length} accounts configured`}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setShowCreateForm(true);
              setEditingAccount(null);
            }}
          >
            Add Account
          </Button>
        }
      />

      {showCreateForm && (
        <AccountCreateForm
          onCreated={() => {
            setShowCreateForm(false);
            loadAccounts();
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {editingAccount && (
        <AccountEditForm
          account={editingAccount}
          onSaved={() => {
            setEditingAccount(null);
            loadAccounts();
          }}
          onCancel={() => setEditingAccount(null)}
        />
      )}

      {configuringAccount && (
        <CapabilitiesPanel
          account={configuringAccount}
          onSaved={() => {
            setConfiguringAccount(null);
            loadAccounts();
          }}
          onCancel={() => setConfiguringAccount(null)}
        />
      )}

      {bookmarkAccount && (
        <BookmarkSharing
          accountId={bookmarkAccount.id}
          accountLabel={
            bookmarkAccount.username
              ? `@${bookmarkAccount.username}`
              : bookmarkAccount.label
          }
          onClose={() => setBookmarkAccount(null)}
        />
      )}

      {autolikeAccount && (
        <AutoLikes
          accountId={autolikeAccount.id}
          accountLabel={
            autolikeAccount.username
              ? `@${autolikeAccount.username}`
              : autolikeAccount.label
          }
          onClose={() => setAutolikeAccount(null)}
        />
      )}

      {autofollowAccount && (
        <AutoFollow
          accountId={autofollowAccount.id}
          accountLabel={
            autofollowAccount.username
              ? `@${autofollowAccount.username}`
              : autofollowAccount.label
          }
          onClose={() => setAutofollowAccount(null)}
        />
      )}

      {timelineAccount && (
        <TimelineScrape
          accountId={timelineAccount.id}
          accountLabel={
            timelineAccount.username
              ? `@${timelineAccount.username}`
              : timelineAccount.label
          }
          onClose={() => setTimelineAccount(null)}
        />
      )}

      {accounts.length === 0 ? (
        <EmptyState description="No X accounts configured. Add your first account to get started." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-5 max-md:grid-cols-1">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              verifying={verifyingId === account.id}
              onVerify={() => handleVerify(account.id)}
              onEdit={() => {
                setEditingAccount(account);
                setShowCreateForm(false);
                setConfiguringAccount(null);
                setBookmarkAccount(null);
                setAutolikeAccount(null);
                setAutofollowAccount(null);
                setTimelineAccount(null);
              }}
              onBookmarks={() => {
                setBookmarkAccount(account);
                setAutolikeAccount(null);
                setAutofollowAccount(null);
                setTimelineAccount(null);
                setShowCreateForm(false);
                setEditingAccount(null);
                setConfiguringAccount(null);
              }}
              onAutoLikes={() => {
                setAutolikeAccount(account);
                setAutofollowAccount(null);
                setBookmarkAccount(null);
                setTimelineAccount(null);
                setShowCreateForm(false);
                setEditingAccount(null);
                setConfiguringAccount(null);
              }}
              onAutoFollow={() => {
                setAutofollowAccount(account);
                setAutolikeAccount(null);
                setBookmarkAccount(null);
                setTimelineAccount(null);
                setShowCreateForm(false);
                setEditingAccount(null);
                setConfiguringAccount(null);
              }}
              onTimeline={() => {
                setTimelineAccount(account);
                setAutofollowAccount(null);
                setAutolikeAccount(null);
                setBookmarkAccount(null);
                setShowCreateForm(false);
                setEditingAccount(null);
                setConfiguringAccount(null);
              }}
              onConfigure={() => {
                setConfiguringAccount(account);
                setShowCreateForm(false);
                setEditingAccount(null);
                setBookmarkAccount(null);
                setAutolikeAccount(null);
                setAutofollowAccount(null);
                setTimelineAccount(null);
              }}
              onDelete={() => handleDelete(account.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
