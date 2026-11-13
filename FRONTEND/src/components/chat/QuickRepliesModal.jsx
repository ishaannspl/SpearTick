import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";
import { saveQuickReplies } from "../../services/api";
import { Button, Modal } from "../ui";

const inputCls =
  "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink placeholder:text-ink-subtle focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/12";

// Add, edit and remove the team's saved replies.
export default function QuickRepliesModal({ open, onClose, quickReplies, onSaved }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setRows(quickReplies.length ? quickReplies.map((r) => ({ ...r })) : [{ shortcut: "", text: "" }]);
  }, [open, quickReplies]);

  function update(index, patch) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    try {
      setSaving(true);
      const saved = await saveQuickReplies(rows.filter((r) => r.shortcut.trim() && r.text.trim()));
      onSaved(saved);
      toast.success("Quick replies saved. Type / in the message box to use them.");
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't save quick replies. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quick replies"
      description="Answers you send often. Type / and the short name in the message box to insert one. Shared with your whole team."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-xl border border-line p-3 sm:flex-row sm:items-start">
            <div className="sm:w-40">
              <input
                value={row.shortcut}
                onChange={(e) => update(index, { shortcut: e.target.value.replace(/\s+/g, "").replace(/^\//, "") })}
                placeholder="Short name, e.g. timings"
                aria-label="Short name"
                className={inputCls}
              />
            </div>
            <textarea
              value={row.text}
              onChange={(e) => update(index, { text: e.target.value })}
              placeholder="e.g. We're open 10 am to 9 pm, Monday to Saturday."
              aria-label="Reply text"
              rows={2}
              className="min-h-[40px] flex-1 resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-subtle focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/12"
            />
            <Button
              variant="danger-ghost"
              size="icon-sm"
              aria-label="Remove this reply"
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
              className="self-end sm:self-start"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
        <Button variant="secondary" leftIcon={Plus} onClick={() => setRows((prev) => [...prev, { shortcut: "", text: "" }])}>
          Add a quick reply
        </Button>
      </div>
    </Modal>
  );
}
