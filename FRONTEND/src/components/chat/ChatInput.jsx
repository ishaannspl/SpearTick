import { FileText, LayoutTemplate, Paperclip, Send, Smile, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { cn } from "../../utils/cn";

const EMOJIS = ["😊", "🙏", "👍", "🎉", "❤️", "😀", "😂", "👌", "🙂", "✅", "⭐", "🔥", "🛍️", "📦", "🚚", "💰", "📞", "⏰", "🎁", "👋"];

// WhatsApp's own limits for files sent in a chat.
const MAX_FILE_MB = 16;
const ACCEPT = "image/jpeg,image/png,video/mp4,video/3gpp,application/pdf";

export function ChatInput({
  value,
  onChange,
  onSend,
  sending,
  onSendFile,
  onOpenTemplates,
  quickReplies = [],
  onManageQuickReplies,
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [activeReply, setActiveReply] = useState(0);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [value]);

  // Typing "/" at the start opens the quick replies, filtered by what follows.
  const slashQuery = /^\/(\S*)$/.exec(value)?.[1];
  const replyMatches = useMemo(() => {
    if (slashQuery === undefined) return [];
    const q = slashQuery.toLowerCase();
    return quickReplies.filter((r) => r.shortcut.toLowerCase().includes(q) || r.text.toLowerCase().includes(q)).slice(0, 8);
  }, [slashQuery, quickReplies]);
  const showReplies = slashQuery !== undefined;

  function insertReply(reply) {
    onChange(reply.text);
    setActiveReply(0);
    textareaRef.current?.focus();
  }

  function insertEmoji(emoji) {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + emoji + value.slice(end));
    setEmojiOpen(false);
    setTimeout(() => {
      ta?.focus();
      ta?.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  }

  function pickFile(f) {
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`That file is too big. WhatsApp allows up to ${MAX_FILE_MB} MB.`);
      return;
    }
    setFile(f);
    textareaRef.current?.focus();
  }

  async function submit() {
    if (sending) return;
    if (file) {
      const ok = await onSendFile?.(file, value.trim());
      if (ok) {
        setFile(null);
        onChange("");
      }
      return;
    }
    if (!value.trim()) return;
    onSend();
  }

  const handleKeyDown = (event) => {
    if (showReplies && replyMatches.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveReply((i) => (i + 1) % replyMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveReply((i) => (i - 1 + replyMatches.length) % replyMatches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertReply(replyMatches[Math.min(activeReply, replyMatches.length - 1)]);
        return;
      }
    }
    if (event.key === "Escape") setEmojiOpen(false);
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="sticky bottom-0 border-t border-line bg-surface px-3 py-3 sm:px-4"
    >
      {file && (
        <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-brand-700" />
          <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{file.name}</span>
          <span className="shrink-0 text-[13px] text-ink-muted">Add a caption below (optional), then press Send</span>
          <button type="button" onClick={() => setFile(null)} aria-label="Remove file" className="rounded-md p-1 text-ink-muted hover:bg-surface hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="relative flex items-end gap-1.5">
        {/* Quick replies popover */}
        {showReplies && (
          <div className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface py-1.5 shadow-[var(--shadow-pop)]">
            <div className="flex items-center justify-between px-3.5 pb-1.5 pt-1">
              <span className="text-[13px] text-ink-muted">Quick replies — ↑↓ to choose, Enter to insert</span>
              {onManageQuickReplies && (
                <button type="button" onClick={onManageQuickReplies} className="text-[13px] font-medium text-brand-700 hover:underline">
                  Manage
                </button>
              )}
            </div>
            {replyMatches.length ? (
              replyMatches.map((reply, i) => (
                <button
                  key={`${reply.shortcut}-${i}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertReply(reply);
                  }}
                  className={cn("block w-full px-3.5 py-2 text-left hover:bg-canvas", i === activeReply && "bg-brand-50")}
                >
                  <span className="text-[13px] font-semibold text-brand-800">/{reply.shortcut}</span>
                  <span className="ml-2 line-clamp-1 text-[14px] text-ink-muted">{reply.text}</span>
                </button>
              ))
            ) : (
              <p className="px-3.5 py-2 text-[14px] text-ink-muted">
                {quickReplies.length ? "No quick reply matches." : "No quick replies yet."}{" "}
                {onManageQuickReplies && (
                  <button type="button" onClick={onManageQuickReplies} className="font-medium text-brand-700 underline">
                    Add one
                  </button>
                )}
              </p>
            )}
          </div>
        )}

        {/* Emoji popover */}
        {emojiOpen && (
          <div className="absolute bottom-full left-0 z-30 mb-2 grid w-[248px] grid-cols-5 gap-1 rounded-xl border border-line bg-surface p-2 shadow-[var(--shadow-pop)]">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="flex h-10 items-center justify-center rounded-lg text-[20px] hover:bg-canvas"
                aria-label={`Insert ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <ToolButton title="Emoji" onClick={() => setEmojiOpen((o) => !o)} active={emojiOpen}>
          <Smile className="h-5 w-5" />
        </ToolButton>
        {onSendFile && (
          <ToolButton title="Send a photo, video or PDF" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-5 w-5" />
          </ToolButton>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <ToolButton title="Quick replies (or type /)" onClick={() => onChange(value ? value : "/")} className="hidden sm:inline-flex">
          <Zap className="h-5 w-5" />
        </ToolButton>
        {onOpenTemplates && (
          <ToolButton title="Send an approved template" onClick={onOpenTemplates} className="hidden sm:inline-flex">
            <LayoutTemplate className="h-5 w-5" />
          </ToolButton>
        )}

        <div className="relative flex-1">
          <label htmlFor="inbox-composer" className="sr-only">
            Type a message
          </label>
          <textarea
            id="inbox-composer"
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              setActiveReply(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={file ? "Add a caption (optional)…" : "Type a message, or / for quick replies…"}
            rows={1}
            className="block min-h-[44px] w-full resize-none rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-[15px] leading-[1.5] text-ink outline-none transition-colors placeholder:text-ink-subtle hover:border-ink-subtle focus:border-brand-600 focus:ring-4 focus:ring-brand-600/12"
          />
        </div>

        <button
          type="submit"
          disabled={sending || (!file && !value.trim())}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-900 px-4 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(11,59,46,0.2)] transition-colors hover:bg-brand-800 active:bg-brand-950 disabled:cursor-not-allowed disabled:opacity-55"
          title="Send"
          aria-label="Send message"
        >
          {sending ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>
    </form>
  );
}

function ToolButton({ title, onClick, active, className, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex h-11 w-10 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-canvas hover:text-ink",
        active && "bg-canvas text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}
