import { Fragment, useState } from "react";
import { Check, CheckCheck, AlertCircle, FileText } from "lucide-react";
import { cn } from "../../utils/cn";
import { resolveMediaUrl } from "../../utils/media";
import { explainWhatsAppFailure } from "../../utils/whatsappErrors";

function formatTime(value) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function highlightText(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  const lower = query.toLowerCase();
  return parts.map((part, i) =>
    part.toLowerCase() === lower ? (
      <mark key={i} className="rounded-sm bg-accent px-0.5 text-ink">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function renderFormattedContent(text, searchQuery) {
  if (!text) return "";

  // Regex matching code blocks, bold (**text** or *text*), italic (_text_), strike (~text~), and urls
  const regex = /(```[\s\S]*?```|\*\*[^*\n]+?\*\*|\*[^*\n\s](?:[^*\n]*?[^*\n\s])?\*|_[^_\n\s](?:[^_\n]*?[^_\n\s])?_|~[^~\n\s](?:[^~\n]*?[^~\n\s])?~|https?:\/\/[^\s]+)/g;

  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Code block
    if (part.startsWith("```") && part.endsWith("```") && part.length >= 6) {
      const codeContent = part.slice(3, -3);
      return (
        <code key={index} className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[13px]">
          {codeContent}
        </code>
      );
    }

    // Bold (**text** or *text*)
    if (
      (part.startsWith("**") && part.endsWith("**") && part.length >= 4) ||
      (part.startsWith("*") && part.endsWith("*") && part.length >= 2)
    ) {
      const inner = part.startsWith("**") ? part.slice(2, -2) : part.slice(1, -1);
      return (
        <strong key={index} className="font-semibold text-ink">
          {highlightText(inner.trim(), searchQuery)}
        </strong>
      );
    }

    // Italic (_text_)
    if (part.startsWith("_") && part.endsWith("_") && part.length >= 2) {
      const inner = part.slice(1, -1);
      return (
        <em key={index} className="italic">
          {highlightText(inner.trim(), searchQuery)}
        </em>
      );
    }

    // Strikethrough (~text~)
    if (part.startsWith("~") && part.endsWith("~") && part.length >= 2) {
      const inner = part.slice(1, -1);
      return (
        <del key={index} className="line-through text-ink-muted">
          {highlightText(inner.trim(), searchQuery)}
        </del>
      );
    }

    // Plain text / url
    if (/^https?:\/\/[^\s]+$/i.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 underline hover:text-brand-700"
        >
          {highlightText(part, searchQuery)}
        </a>
      );
    }

    return <Fragment key={index}>{highlightText(part, searchQuery)}</Fragment>;
  });
}

function getSenderLabel(message) {
  if (message.sender === "ai") return "AI Assistant";
  if (message.sender === "agent") return message.senderName || "Agent";
  return null;
}

// Shows a message's attachment the way WhatsApp would: photos inline,
// videos and voice notes with a player, anything else as a file link.
function MessageMedia({ url, type = "" }) {
  const kind = type.startsWith("video")
    ? "video"
    : type.startsWith("audio")
      ? "audio"
      : type && !type.startsWith("image")
        ? "file"
        : "image";

  if (kind === "video") {
    return (
      <video src={url} controls preload="metadata" className="mb-2 block max-h-[420px] w-full rounded-lg bg-black/5" />
    );
  }
  if (kind === "audio") {
    return <audio src={url} controls preload="metadata" className="mb-2 block w-full min-w-[240px]" />;
  }
  if (kind === "file") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mb-2 flex items-center gap-2.5 rounded-lg border border-black/10 bg-white/60 px-3 py-2.5 text-[14px] font-medium text-ink hover:bg-white"
      >
        <FileText className="h-5 w-5 shrink-0 text-brand-700" />
        <span className="truncate">{type === "application/pdf" ? "Open PDF" : "Open file"}</span>
      </a>
    );
  }
  return (
    <div className="mb-2 overflow-hidden rounded-lg bg-black/5">
      <img
        src={url}
        alt=""
        className="block h-auto max-h-[420px] w-full cursor-pointer rounded-lg object-contain transition-transform hover:opacity-95"
        loading="lazy"
        onClick={() => window.open(url, "_blank")}
        title="Click to view full image"
      />
    </div>
  );
}

export function MessageBubble({ message, searchQuery, isCurrentMatch, showSenderLabel }) {
  const isIncoming = message.sender === "user";
  const senderLabel = !isIncoming && showSenderLabel ? getSenderLabel(message) : null;
  // Only messages that just arrived animate in; loading history stays still.
  const [isFresh] = useState(() => {
    const createdMs = new Date(message.createdAt).getTime();
    return Boolean(message.optimistic) || (Number.isFinite(createdMs) && Date.now() - createdMs < 8000);
  });

  return (
    <div
      data-message-id={message.id}
      className={cn("flex w-full", isIncoming ? "justify-start" : "justify-end")}
    >
      <div
        className={cn(
          "flex min-w-0 flex-col gap-1",
          "max-w-[86%] sm:max-w-[78%] md:max-w-[72%] lg:max-w-[65%] xl:max-w-[60%] 2xl:max-w-[55%] min-[1800px]:max-w-[680px]",
          isIncoming ? "items-start" : "items-end",
        )}
      >
        {senderLabel && (
          <span className="px-1 text-[13px] font-medium text-ink-muted">{senderLabel}</span>
        )}

        <div
          className={cn(
            "min-w-[90px] rounded-2xl px-3.5 pb-2 pt-2 shadow-[0_1px_1px_rgba(15,28,23,0.06)] transition-shadow",
            isFresh && "pop-in",
            isIncoming
              ? "rounded-tl-md border border-line bg-surface text-ink"
              : "rounded-tr-md border border-[#c6e9be] bg-[#dcf5d6] text-ink",
            isCurrentMatch && "ring-2 ring-brand-500 ring-offset-2 ring-offset-[#f6f5f1]",
          )}
        >
          {message.mediaUrl && <MessageMedia url={resolveMediaUrl(message.mediaUrl)} type={message.mediaType} />}
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[14.5px] sm:text-[15px] leading-[1.5]">
            {renderFormattedContent(message.content, searchQuery)}
          </p>

          {/* Meta row */}
          <div className="mt-1 flex items-center justify-end gap-1 text-[12px] text-ink-muted">
            <span className="tabular-nums">{formatTime(message.createdAt)}</span>

            {!isIncoming && !message.optimistic && (
              <>
                {message.status === "sent" && (
                  <Check className="h-3.5 w-3.5 transition-colors duration-500" aria-label="Sent" />
                )}
                {(message.status === "delivered" || message.status === "read") && (
                  <CheckCheck
                    className={cn("h-3.5 w-3.5 transition-colors duration-500", message.status === "read" && "text-[#34b7f1]")}
                    aria-label={message.status === "read" ? "Read" : "Delivered"}
                  />
                )}
                {message.status === "failed" && (
                  <span className="inline-flex items-center gap-1 font-medium text-danger">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Not sent
                  </span>
                )}
              </>
            )}

            {message.optimistic && <span>Sending…</span>}
          </div>
        </div>

        {!isIncoming && message.status === "failed" && (
          <p className="max-w-full px-1 text-right text-[13px] leading-snug text-danger">
            {explainWhatsAppFailure(message.failure)}
          </p>
        )}
      </div>
    </div>
  );
}
