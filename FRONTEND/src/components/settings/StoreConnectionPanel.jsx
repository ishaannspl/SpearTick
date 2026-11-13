import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { AlertTriangle, CheckCircle, RefreshCw, Unplug } from "lucide-react";
import {
  connectStore,
  disconnectStore,
  fetchStoreConnection,
  testStoreConnection,
} from "../../services/api";
import { Badge, Button, Card, Input, Skeleton } from "../ui";
import ConfirmDialog from "../common/ConfirmDialog";
import { formatRelativeDate } from "../../utils/date";

const MONO_INPUT = "font-mono text-[14px]";
const EMPTY_FORM = { storeUrl: "", consumerKey: "", consumerSecret: "" };

// Connects the company's WooCommerce store so its products can be shown and
// sent from SpearTick. Only the store address and a read-only key are needed.
export default function StoreConnectionPanel() {
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetchStoreConnection()
      .then((res) => setStore(res.store))
      .catch(() => toast.error("Couldn't load your store connection. Refresh the page to try again."))
      .finally(() => setLoading(false));
  }, []);

  const update = (field) => (event) => {
    setFormError("");
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  async function handleConnect(event) {
    event.preventDefault();
    setFormError("");
    if (!form.storeUrl.trim() || !form.consumerKey.trim() || !form.consumerSecret.trim()) {
      setFormError("Enter the store address, the Consumer key and the Consumer secret.");
      return;
    }
    try {
      setSaving(true);
      const res = await connectStore(form);
      setStore(res.store);
      setForm(EMPTY_FORM);
      toast.success(`Connected to ${res.store.storeName || res.store.storeUrl}.`);
    } catch (error) {
      setFormError(
        error?.response?.data?.message ||
          "We couldn't connect to your store. Check your internet connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCheck() {
    try {
      setChecking(true);
      const res = await testStoreConnection();
      setStore(res.store);
      if (res.store.connected) toast.success("Your store is connected and working.");
      else toast.error("The connection has a problem. See the message on this page.");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Couldn't check the connection. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  async function handleDisconnect() {
    try {
      setDisconnecting(true);
      const res = await disconnectStore();
      setStore(res.store);
      setConfirmDisconnect(false);
      toast.success("Store disconnected.");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Couldn't disconnect. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <Card aria-busy="true">
        <Skeleton className="h-6 w-64 max-w-full" />
        <Skeleton className="mt-2.5 h-4 w-full max-w-lg" />
        <Skeleton className="mt-6 h-[72px] w-full rounded-xl" />
      </Card>
    );
  }

  const hasConnection = Boolean(store?.storeUrl);

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-ink">WooCommerce store</h2>
          <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
            Connect your online store so you can find your products here and send them to customers on WhatsApp.
            SpearTick only reads your products. It can't change your store.
          </p>
        </div>
        <Badge tone={store?.connected ? "brand" : hasConnection ? "danger" : "warning"} dot className="text-[13px]">
          {store?.connected ? "Connected" : hasConnection ? "Needs attention" : "Not connected"}
        </Badge>
      </div>

      {hasConnection ? (
        <div className="space-y-4">
          <div
            className={
              store.connected
                ? "rounded-xl border border-brand-100 bg-brand-50 p-4"
                : "rounded-xl border border-danger/20 bg-danger-soft p-4"
            }
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface">
                {store.connected ? (
                  <CheckCircle size={18} className="text-brand-700" />
                ) : (
                  <AlertTriangle size={18} className="text-danger" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">
                  {store.storeName || store.storeUrl}
                </p>
                <p className="break-all text-[14px] text-ink-muted">{store.storeUrl}</p>
                {store.connected ? (
                  <p className="mt-1.5 text-[14px] text-ink">
                    <strong className="font-semibold tabular-nums">{store.productCount}</strong>{" "}
                    {store.productCount === 1 ? "product" : "products"} found
                  </p>
                ) : (
                  <p className="mt-1.5 text-[14px] text-danger">{store.lastError}</p>
                )}
                <p className="mt-1.5 text-[13px] text-ink-muted">
                  Key {store.keyHint}
                  {store.lastCheckedAt && ` · last checked ${formatRelativeDate(store.lastCheckedAt)}`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" leftIcon={RefreshCw} onClick={handleCheck} loading={checking} disabled={checking}>
              Check connection
            </Button>
            <Button variant="secondary" leftIcon={Unplug} onClick={() => setConfirmDisconnect(true)} disabled={checking}>
              Disconnect
            </Button>
          </div>
          {!store.connected && (
            <p className="text-[14px] text-ink-muted">
              To use a new key, disconnect first and connect again.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={handleConnect} className="space-y-5">
          <details className="rounded-xl border border-line px-4 py-3">
            <summary className="cursor-pointer text-[14px] font-medium text-ink">
              Where do I find these details?
            </summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] text-ink-muted">
              <li>Sign in to your WordPress dashboard as an Administrator.</li>
              <li>
                Go to <strong className="font-semibold text-ink">WooCommerce → Settings → Advanced → REST API</strong>{" "}
                and click <strong className="font-semibold text-ink">Add key</strong>.
              </li>
              <li>
                Give it a name like &ldquo;SpearTick&rdquo;, choose yourself as the user, and set Permissions to{" "}
                <strong className="font-semibold text-ink">Read</strong>.
              </li>
              <li>Click Generate API key, then copy the Consumer key and Consumer secret. WooCommerce shows the secret only once.</li>
              <li>
                Your store needs <strong className="font-semibold text-ink">https://</strong> in its address, and in WordPress,
                Settings → Permalinks must not be set to &ldquo;Plain&rdquo;.
              </li>
            </ol>
          </details>

          <Input
            label="Store address"
            type="text"
            value={form.storeUrl}
            onChange={update("storeUrl")}
            placeholder="https://yourshop.com"
            autoComplete="off"
            help="The address customers use to visit your shop."
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              label="Consumer key"
              type="text"
              value={form.consumerKey}
              onChange={update("consumerKey")}
              placeholder="ck_..."
              inputClassName={MONO_INPUT}
              autoComplete="off"
            />
            <Input
              label="Consumer secret"
              type="password"
              value={form.consumerSecret}
              onChange={update("consumerSecret")}
              placeholder="cs_..."
              inputClassName={MONO_INPUT}
              autoComplete="new-password"
            />
          </div>

          {formError && (
            <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {formError}
            </p>
          )}

          <div className="flex justify-end border-t border-line pt-5">
            <Button type="submit" loading={saving} disabled={saving}>
              {saving ? "Connecting…" : "Connect store"}
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect your store?"
        confirmLabel="Disconnect"
        danger
        busy={disconnecting}
        onConfirm={handleDisconnect}
        onCancel={() => setConfirmDisconnect(false)}
      >
        <p>SpearTick will forget your store address and keys. Your store and its products are not touched.</p>
        <p>You can connect again any time with a key from WooCommerce.</p>
      </ConfirmDialog>
    </Card>
  );
}
