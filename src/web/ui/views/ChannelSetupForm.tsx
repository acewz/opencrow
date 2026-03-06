import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { setupChannel, requestWhatsAppPairingCode, apiFetch } from "../api";
import { cn } from "../lib/cn";
import { Button, Input } from "../components";

interface ChannelSetupFormProps {
  channelId: string;
  snapshot: Record<string, unknown>;
  onSaved: () => void;
}

function TelegramSetupForm({
  snapshot,
  onSaved,
}: Omit<ChannelSetupFormProps, "channelId">) {
  const currentIds = (snapshot.allowedUserIds as number[]) ?? [];
  const [botToken, setBotToken] = useState("");
  const [allowedUserIds, setAllowedUserIds] = useState(currentIds.join(", "));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const input: Record<string, unknown> = {};
      if (botToken.trim()) {
        input.botToken = botToken.trim();
      }
      const parsed = allowedUserIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => !isNaN(n));
      input.allowedUserIds = parsed;
      await setupChannel("telegram", input);
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="text-danger text-sm font-mono px-4 py-3 bg-danger-subtle border border-border rounded-md break-words leading-relaxed">
          {error}
        </div>
      )}
      <div className="mb-4">
        <Input
          label="Bot Token"
          type="password"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder={
            snapshot.configured ? "(unchanged)" : "Enter bot token..."
          }
        />
      </div>
      <div className="mb-4">
        <Input
          label="Allowed User IDs (comma-separated)"
          type="text"
          value={allowedUserIds}
          onChange={(e) => setAllowedUserIds(e.target.value)}
          placeholder="Leave empty to allow all"
        />
      </div>
      <div>
        <Button type="submit" size="sm" loading={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

function WhatsAppSetupForm({
  snapshot: initialSnapshot,
  onSaved,
}: Omit<ChannelSetupFormProps, "channelId">) {
  const currentNumbers = (initialSnapshot.allowedNumbers as string[]) ?? [];
  const currentGroups = (initialSnapshot.allowedGroups as string[]) ?? [];
  const [liveSnapshot, setLiveSnapshot] = useState(initialSnapshot);

  const pairingState = (liveSnapshot.pairingState as string) ?? "disconnected";
  const qrCode = (liveSnapshot.qrCode as string) ?? null;
  const isConnected = pairingState === "connected";

  const [phoneNumber, setPhoneNumber] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [allowedNumbers, setAllowedNumbers] = useState(
    currentNumbers.join(", "),
  );
  const [allowedGroups, setAllowedGroups] = useState(currentGroups.join(", "));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [pairMode, setPairMode] = useState<"qr" | "code">("qr");

  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch<{
          success: boolean;
          data: { snapshot: Record<string, unknown> };
        }>("/api/channels/whatsapp");
        if (res.success && res.data?.snapshot) {
          setLiveSnapshot(res.data.snapshot);
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isConnected]);

  async function handlePair() {
    if (!phoneNumber.trim()) {
      setError("Enter your phone number (country code + number, no +)");
      return;
    }
    setRequesting(true);
    setError("");
    setPairingCode("");
    try {
      const res = await requestWhatsAppPairingCode(phoneNumber.trim());
      if (res.data?.code) {
        setPairingCode(res.data.code);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to request pairing code";
      setError(msg);
    } finally {
      setRequesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const parsed = allowedNumbers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const parsedGroups = allowedGroups
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await setupChannel("whatsapp", {
        allowedNumbers: parsed,
        allowedGroups: parsedGroups,
      });
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const statusColor = isConnected
    ? "text-success"
    : pairingState === "pairing" || pairingState === "waiting"
      ? "text-warning"
      : "text-faint";

  const statusLabel = isConnected
    ? "Connected"
    : pairingState === "pairing"
      ? "Pairing..."
      : pairingState === "waiting"
        ? "Waiting for scan"
        : "Disconnected";

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="text-danger text-sm font-mono px-4 py-3 bg-danger-subtle border border-border rounded-md break-words leading-relaxed">
          {error}
        </div>
      )}

      <div className="mb-4">
        <span className="font-heading text-xs font-semibold uppercase tracking-widest text-faint">
          Status
        </span>
        <span className={cn("ml-2 text-sm font-semibold", statusColor)}>
          {statusLabel}
        </span>
      </div>

      {!isConnected && (
        <>
          <div className="flex gap-2 mb-4">
            <Button
              variant={pairMode === "qr" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setPairMode("qr")}
            >
              QR Code
            </Button>
            <Button
              variant={pairMode === "code" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setPairMode("code")}
            >
              Pairing Code
            </Button>
          </div>

          {pairMode === "qr" && (
            <div className="p-5 bg-bg-2 border border-border rounded-lg mb-4 text-center">
              {qrCode ? (
                <>
                  <div className="inline-block p-3 bg-white rounded-lg">
                    <QRCodeSVG value={qrCode} size={200} />
                  </div>
                  <div className="text-sm text-faint mt-2.5">
                    Open WhatsApp &rarr; Linked Devices &rarr; Link a Device
                    &rarr; Scan this QR code
                  </div>
                </>
              ) : (
                <div className="text-faint text-base py-8">
                  Waiting for QR code...
                </div>
              )}
            </div>
          )}

          {pairMode === "code" && (
            <>
              <div className="mb-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      label="Phone Number"
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="491234567890"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      size="sm"
                      onClick={handlePair}
                      loading={requesting}
                    >
                      {requesting ? "Requesting..." : "Get Code"}
                    </Button>
                  </div>
                </div>
              </div>

              {pairingCode && (
                <div className="p-4 bg-bg-2 border border-border rounded-lg mb-4 text-center">
                  <div className="text-base text-faint mb-1.5">Pairing Code</div>
                  <div className="text-2xl font-bold tracking-widest font-mono text-foreground">
                    {pairingCode.slice(0, 4)}-{pairingCode.slice(4)}
                  </div>
                  <div className="text-sm text-faint mt-2.5">
                    Open WhatsApp &rarr; Linked Devices &rarr; Link a Device
                    &rarr; Link with phone number instead &rarr; Enter this code
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <form onSubmit={handleSave}>
        <div className="mb-4">
          <Input
            label="Allowed Numbers (comma-separated)"
            type="text"
            value={allowedNumbers}
            onChange={(e) => setAllowedNumbers(e.target.value)}
            placeholder="491234567890, 441234567890"
          />
        </div>
        <div className="mb-4">
          <Input
            label="Allowed Groups (comma-separated group JIDs, empty = all)"
            type="text"
            value={allowedGroups}
            onChange={(e) => setAllowedGroups(e.target.value)}
            placeholder="905067857210-1561807226@g.us"
          />
        </div>
        <div>
          <Button type="submit" size="sm" loading={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function ChannelSetupForm({
  channelId,
  snapshot,
  onSaved,
}: ChannelSetupFormProps) {
  if (channelId === "telegram") {
    return <TelegramSetupForm snapshot={snapshot} onSaved={onSaved} />;
  }
  if (channelId === "whatsapp") {
    return <WhatsAppSetupForm snapshot={snapshot} onSaved={onSaved} />;
  }
  return (
    <p className="text-faint text-base">
      No setup form available for this channel.
    </p>
  );
}
