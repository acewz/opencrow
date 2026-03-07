import React, { useState } from "react";
import { Modal, Button, Input } from "../../components";
import { apiFetch } from "../../api";
import type { AccountResponse } from "./types";

interface AddAccountModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: () => void;
}

export function AddAccountModal({ open, onClose, onCreated }: AddAccountModalProps) {
  const [label, setLabel] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [ct0, setCt0] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    setLabel("");
    setAuthToken("");
    setCt0("");
    setError("");
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!authToken.trim() || !ct0.trim()) {
      setError("Auth Token and CT0 are required");
      return;
    }
    setSaving(true);
    setError("");

    try {
      await apiFetch<AccountResponse>("/api/x/accounts", {
        method: "POST",
        body: JSON.stringify({
          label: label.trim() || undefined,
          auth_token: authToken.trim(),
          ct0: ct0.trim(),
        }),
      });
      setLabel("");
      setAuthToken("");
      setCt0("");
      onCreated();
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add X Account">
      <form onSubmit={handleSubmit}>
        {error && (
          <p className="text-danger text-sm mb-4">{error}</p>
        )}

        <div className="flex flex-col gap-4">
          <Input
            label="Label (optional)"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Main Account, Brand Account..."
            maxLength={100}
          />
          <div>
            <Input
              label="Auth Token"
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="Paste auth_token cookie value..."
              required
              autoComplete="off"
            />
            <p className="text-faint text-xs mt-1">
              Find this in browser DevTools &gt; Application &gt; Cookies &gt; x.com
            </p>
          </div>
          <Input
            label="CT0"
            type="password"
            value={ct0}
            onChange={(e) => setCt0(e.target.value)}
            placeholder="Paste ct0 cookie value..."
            required
            autoComplete="off"
          />
        </div>

        <div className="flex gap-2 mt-6">
          <Button type="submit" size="sm" loading={saving}>
            {saving ? "Adding..." : "Add Account"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
