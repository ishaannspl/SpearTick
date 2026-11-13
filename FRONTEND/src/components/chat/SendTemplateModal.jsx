import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Send } from "lucide-react";
import api, { sendInboxTemplate } from "../../services/api";
import { Button, Modal } from "../ui";
import WhatsAppPreview from "../templates/WhatsAppPreview";
import { META_CATEGORY_LABELS, extractVariableTokens, fillExamples } from "../../constants/templates";

const controlCls =
  "h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[14px] text-ink placeholder:text-ink-subtle transition-colors hover:border-ink-subtle focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/12";

/**
 * Pick an approved template, fill its blanks and send it in a chat. Used when
 * the 24-hour reply window has closed (the only thing WhatsApp allows then)
 * and to start a new chat from the Contacts page.
 * Pass `conversationId` for an existing chat, or `phone` to start a new one.
 */
export default function SendTemplateModal({ open, onClose, conversationId, phone, contactName, onSent }) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [values, setValues] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Never carry the last chat's choice or values over to another customer.
    setSelectedId("");
    setValues([]);
    api
      .get("api/templates")
      .then((r) => setTemplates((r.data.templates || []).filter((t) => t.metaStatus === "APPROVED")))
      .catch(() => setTemplates([]));
  }, [open]);

  const selected = (templates || []).find((t) => t._id === selectedId);
  const tokens = selected ? extractVariableTokens(selected.description) : [];
  const needsButtonValue = (selected?.buttons || []).some((b) => b.type === "URL" && /\{\{1\}\}/.test(b.url || ""));

  function choose(id) {
    setSelectedId(id);
    const t = (templates || []).find((x) => x._id === id);
    // The customer's name is filled in for them; everything else is typed.
    setValues(t ? extractVariableTokens(t.description).map((tok) => (tok === "name" || tok === "1" ? contactName || "" : "")) : []);
  }

  async function handleSend() {
    if (!selected) return toast.error("Choose a template first.");
    if (tokens.some((_, i) => !values[i]?.trim())) return toast.error("Fill in every blank before sending.");
    try {
      setSending(true);
      const res = await sendInboxTemplate({
        conversationId,
        phone,
        templateId: selected._id,
        variables: values.slice(0, tokens.length),
      });
      toast.success("Template sent. The chat is open again once the customer replies.");
      onSent?.(res);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || "The template couldn't be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={sending ? undefined : onClose}
      title="Send a template"
      description="WhatsApp only allows approved templates when a customer hasn't messaged you in the last 24 hours."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button leftIcon={Send} onClick={handleSend} loading={sending} disabled={sending || !selected || needsButtonValue}>
            Send template
          </Button>
        </>
      }
    >
      {templates === null ? (
        <p className="text-[14px] text-ink-muted">Loading your templates…</p>
      ) : templates.length === 0 ? (
        <div className="rounded-xl bg-canvas px-4 py-5 text-center text-[14px]">
          <p className="font-medium text-ink">You don&apos;t have an approved template yet.</p>
          <p className="mt-1 text-ink-muted">Create one (ready-made ones are available) and WhatsApp will check it.</p>
          <Button className="mt-3" onClick={() => navigate("/templates/approved/create")}>
            Create a template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink">Template</span>
              <select value={selectedId} onChange={(e) => choose(e.target.value)} className={`${controlCls} cursor-pointer`}>
                <option value="">Choose a template…</option>
                {templates.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name} · {META_CATEGORY_LABELS[t.metaCategory] || "Marketing"}
                  </option>
                ))}
              </select>
            </label>

            {tokens.map((token, i) => (
              <label key={token} className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-ink">{`{{${token}}}`}</span>
                <input
                  value={values[i] || ""}
                  onChange={(e) => {
                    const next = [...values];
                    next[i] = e.target.value;
                    setValues(next);
                  }}
                  className={controlCls}
                  placeholder={token === "name" ? "Customer's name" : "Type the value"}
                />
              </label>
            ))}

            {needsButtonValue && (
              <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
                This template has a personalised link button, which can only be sent from a campaign. Choose another
                template.
              </p>
            )}
          </div>

          <WhatsAppPreview
            name={contactName}
            headerType={selected?.headerType || "NONE"}
            headerText={selected?.headerText || ""}
            headerMediaUrl={selected?.headerMediaUrl || selected?.mediaUrl || ""}
            body={selected ? fillExamples(selected.description, values) : ""}
            buttons={selected?.buttons || []}
          />
        </div>
      )}
    </Modal>
  );
}
