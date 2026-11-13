import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { AlertTriangle, CheckCircle, Unplug } from "lucide-react";
import { connectWhatsApp, disconnectWhatsApp, fetchWhatsAppStatus } from "../../services/api";
import { Badge, Button, Card, Input, Skeleton } from "../ui";
import ConfirmDialog from "../common/ConfirmDialog";
import useAuthStore from "../../store/authStore";
import useWhatsAppNumbersStore, { numberLabel } from "../../store/whatsappNumbersStore";

const MONO_INPUT = "font-mono text-[14px]";

// Manual "paste your own credentials" connection — the method every company
// can use immediately, without waiting on Meta's Embedded Signup (Tech
// Provider) approval. A "Connect with Facebook" option will sit alongside
// this once that approval comes through; this stays useful afterward too,
// for anyone who prefers managing their own long-lived token.
//
// `bare` drops the card and heading so the form can sit inside the
// onboarding page's own step card; `onConnected` runs after a successful connect.
export default function ConnectWhatsAppPanel({ bare = false, onConnected } = {}) {
  const Wrapper = bare ? "div" : Card;
  const navigate = useNavigate();
  const numbers = useWhatsAppNumbersStore((s) => s.numbers);
  const loadNumbers = useWhatsAppNumbersStore((s) => s.load);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [form, setForm] = useState({ accessToken: "", phoneNumberId: "", wabaId: "", apiVersion: "v26.0" });

  useEffect(() => {
    load();
    loadNumbers();
  }, [loadNumbers]);

  async function load() {
    try {
      const res = await fetchWhatsAppStatus();
      setStatus(res.whatsapp);
    } catch {
      toast.error("Failed to load WhatsApp connection status");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(e) {
    e.preventDefault();
    if (!form.accessToken.trim() || !form.phoneNumberId.trim() || !form.wabaId.trim()) {
      toast.error("Access token, Phone Number ID, and WABA ID are all required");
      return;
    }

    try {
      setSaving(true);
      await connectWhatsApp(form);
      toast.success("WhatsApp Business Account connected");
      setForm({ accessToken: "", phoneNumberId: "", wabaId: "", apiVersion: "v26.0" });
      await load();
      await onConnected?.();
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          "WhatsApp didn't connect. Check that all three details were copied completely and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    try {
      setDisconnecting(true);
      await disconnectWhatsApp();
      setConfirmDisconnect(false);
      // The server moved the company back to the "connect WhatsApp" step;
      // mirror that here so the sidebar and route guards stop showing it as
      // connected, then go to the connect page.
      useAuthStore.getState().setSetupStatus("WHATSAPP_ONBOARDING_REQUIRED");
      useWhatsAppNumbersStore.getState().reset();
      toast.success("WhatsApp disconnected. Connect a number again to keep sending messages.");
      navigate("/onboarding/whatsapp", { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Couldn't disconnect. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <Wrapper aria-busy="true">
        <Skeleton className="h-6 w-64 max-w-full" />
        <Skeleton className="mt-2.5 h-4 w-full max-w-lg" />
        <Skeleton className="mt-6 h-[72px] w-full rounded-xl" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </Wrapper>
    );
  }

  const connected = Boolean(status?.connected);

  return (
    <Wrapper>
      {!bare && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-ink">WhatsApp Business Account</h2>
            <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
              Connect your own WhatsApp Business Account so this company can send and receive
              messages, run campaigns, and submit templates for approval.
            </p>
          </div>
          <Badge tone={connected ? "brand" : "warning"} dot className="text-[13px]">
            {connected ? "Connected" : "Not connected"}
          </Badge>
        </div>
      )}

      {connected ? (
        <div className="flex flex-col gap-4 rounded-xl border border-brand-100 bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-brand-700">
              <CheckCircle size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink">Your WhatsApp number is connected</p>
              <p className="mt-1 text-[14px] text-ink">
                {numbers.length
                  ? numbers.map((n) => `${numberLabel(n)}${n.verifiedName ? ` (${n.verifiedName})` : ""}`).join(", ")
                  : status.businessName || "Your business number"}
              </p>
              {status.businessName && numbers.length > 0 && (
                <p className="text-[13px] text-ink-muted">Business: {status.businessName}</p>
              )}
              <details className="mt-2 text-[13px] text-ink-muted">
                <summary className="cursor-pointer">Technical details (for support)</summary>
                <dl className="mt-1.5 space-y-1">
                  <div className="flex flex-wrap gap-x-2">
                    <dt>Phone Number ID:</dt>
                    <dd className="break-all font-mono text-ink">{status.phoneNumberId}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt>WhatsApp Business Account ID:</dt>
                    <dd className="break-all font-mono text-ink">{status.wabaId}</dd>
                  </div>
                </dl>
              </details>
            </div>
          </div>
          <Button
            variant="secondary"
            leftIcon={Unplug}
            onClick={() => setConfirmDisconnect(true)}
            disabled={disconnecting}
            className="self-start sm:self-center"
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <form onSubmit={handleConnect} className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl bg-warning-soft px-4 py-3.5">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-[14px] leading-relaxed text-ink">
              Not connected yet. Paste your WhatsApp Cloud API credentials below — get these from
              your Meta Business Settings → System Users, the same way you'd set up the API
              directly.
            </p>
          </div>

          <Input
            label="Access token"
            type="password"
            value={form.accessToken}
            onChange={(e) => setForm((prev) => ({ ...prev, accessToken: e.target.value }))}
            placeholder="EAAG..."
            inputClassName={MONO_INPUT}
            autoComplete="off"
            help="In Meta Business Settings, open Users → System users, pick your system user and click Generate new token. Starts with EAA."
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              label="Phone Number ID"
              type="text"
              value={form.phoneNumberId}
              onChange={(e) => setForm((prev) => ({ ...prev, phoneNumberId: e.target.value }))}
              placeholder="1234567890123"
              inputClassName={MONO_INPUT}
              help="In Meta for Developers, open your app → WhatsApp → API Setup. It is listed under your phone number."
            />
            <Input
              label="WhatsApp Business Account ID"
              type="text"
              value={form.wabaId}
              onChange={(e) => setForm((prev) => ({ ...prev, wabaId: e.target.value }))}
              placeholder="1234567890123"
              inputClassName={MONO_INPUT}
              help="Shown on the same API Setup page, or in Business Settings → Accounts → WhatsApp accounts."
            />
          </div>

          <details className="group rounded-xl border border-line px-4 py-3">
            <summary className="cursor-pointer text-[14px] font-medium text-ink-muted">
              Advanced settings (you can usually skip this)
            </summary>
            <Input
              label="Graph API version"
              type="text"
              value={form.apiVersion}
              onChange={(e) => setForm((prev) => ({ ...prev, apiVersion: e.target.value }))}
              placeholder="v26.0"
              className="mt-3 max-w-[220px]"
              inputClassName={MONO_INPUT}
              help="Leave as v26.0 unless told otherwise."
            />
          </details>

          <div className="flex justify-end border-t border-line pt-5">
            <Button type="submit" disabled={saving}>
              {saving ? "Connecting…" : "Connect WhatsApp"}
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect your WhatsApp number?"
        confirmLabel="Disconnect"
        danger
        busy={disconnecting}
        onConfirm={handleDisconnect}
        onCancel={() => setConfirmDisconnect(false)}
      >
        <p>Campaigns, the inbox and automatic replies stop working until you connect a number again.</p>
        <p>Your contacts, templates and past chats are kept.</p>
      </ConfirmDialog>
    </Wrapper>
  );
}
