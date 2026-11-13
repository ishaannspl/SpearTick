import { useState } from "react";
import { Tag, Trash2, Download, Send, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { bulkDeleteContacts, bulkUpdateContactTags } from "../../services/api";
import { Button } from "../ui";
import ConfirmDialog from "../common/ConfirmDialog";

export default function BulkActionsBar({ selectedContacts, onClearSelection, onChanged, onBroadcast }) {
  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(null); // "add" | "remove" | null
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (selectedContacts.length === 0) return null;

  const ids = selectedContacts.map((c) => c._id);

  async function handleTagAction(action) {
    const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) return;

    try {
      setBusy(true);
      await bulkUpdateContactTags({ ids, tags, action });
      toast.success(action === "add" ? "Tags added" : "Tags removed");
      setTagInput("");
      setShowTagInput(null);
      onChanged();
    } catch {
      toast.error("Failed to update tags");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setConfirmDelete(false);
    try {
      setBusy(true);
      const res = await bulkDeleteContacts(ids);
      if (res.skipped?.length > 0) {
        toast.error(
          `${res.skipped.length} contact${res.skipped.length === 1 ? " has" : "s have"} chat history, so ${res.skipped.length === 1 ? "it was" : "they were"} kept. To stop messaging them, opt them out from their chat instead.`,
          { duration: 8000 },
        );
      }
      if (res.deletedCount > 0) {
        toast.success(`${res.deletedCount} contact(s) deleted`);
      }
      onChanged();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Couldn't delete the contacts. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleExport() {
    const header = "name,phone,tags";
    const rows = selectedContacts.map(
      (c) => `${c.name || ""},${c.phone},"${(c.tags || []).join(",")}"`,
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts-export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="sticky top-[68px] z-20 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 shadow-[var(--shadow-pop)] sm:px-5 lg:top-4">
      <span className="inline-flex items-center gap-2 text-[14px] font-medium text-ink">
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-900 px-2 text-[13px] font-semibold tabular-nums text-white">
          {selectedContacts.length}
        </span>
        selected
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {showTagInput ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleTagAction(showTagInput); }}
              placeholder="tag1, tag2"
              aria-label={showTagInput === "add" ? "Tags to add" : "Tags to remove"}
              className="h-9 w-44 rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink outline-none transition placeholder:text-ink-subtle focus:border-brand-600 focus:ring-4 focus:ring-brand-600/12"
            />
            <Button
              size="sm"
              variant={showTagInput === "add" ? "primary" : "danger"}
              disabled={busy}
              onClick={() => handleTagAction(showTagInput)}
              className="h-9"
            >
              {showTagInput === "add" ? "Add" : "Remove"}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => { setShowTagInput(null); setTagInput(""); }}
              aria-label="Cancel"
            >
              <X size={16} />
            </Button>
          </div>
        ) : (
          <>
            <Button size="sm" variant="secondary" leftIcon={Tag} onClick={() => setShowTagInput("add")}>
              Add tag
            </Button>
            <Button size="sm" variant="secondary" leftIcon={Tag} onClick={() => setShowTagInput("remove")}>
              Remove tag
            </Button>
            <Button size="sm" variant="secondary" leftIcon={Download} onClick={handleExport}>
              Export
            </Button>
            <Button size="sm" leftIcon={Send} onClick={() => onBroadcast(selectedContacts)}>
              Broadcast
            </Button>
            <Button size="sm" variant="danger-ghost" leftIcon={Trash2} disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onClearSelection}
              title="Clear selection"
              aria-label="Clear selection"
            >
              <X size={16} />
            </Button>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${ids.length} contact${ids.length === 1 ? "" : "s"}?`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>This can&apos;t be undone. Contacts who already have chats with you are kept.</p>
      </ConfirmDialog>
    </div>
  );
}
