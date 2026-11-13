import { Fragment, useEffect, useRef, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock3,
  Hand,
  LayoutTemplate,
  MessageSquareText,
  PanelRight,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { cn } from "../../utils/cn";
import { formatPhone } from "../../utils/formatPhone";
import { getActivityStatus } from "../../utils/date";
import useWhatsAppNumbersStore, { numberLabel } from "../../store/whatsappNumbersStore";

const ESCALATION_LABELS = {
  customer_request: "the customer asked to talk to a person",
  low_confidence: "the AI wasn't sure how to answer",
  turn_limit: "the AI has answered as many messages in a row as it's allowed to",
};

const DAY_MS = 24 * 60 * 60 * 1000;

// WhatsApp lets a business reply freely for 24 hours after the customer's
// last message. Returns ms left, null when the customer never wrote, or
// undefined when it can't be told yet (messages still loading, or an older
// chat whose last customer message isn't in the loaded page).
function useReplyWindow(conversation, messages, { loading, hasMore }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const lastCustomerAt = useMemo(() => {
    const lastFromUser = [...messages].reverse().find((m) => m.sender === "user")?.createdAt;
    const times = [conversation?.lastCustomerMessageAt, lastFromUser]
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .filter(Number.isFinite);
    return times.length ? Math.max(...times) : null;
  }, [messages, conversation?.lastCustomerMessageAt]);

  if (lastCustomerAt) return lastCustomerAt + DAY_MS - now;
  if (loading || hasMore) return undefined;
  return null;
}

function formatWindowLeft(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min left`;
  return `${Math.floor(minutes / 60)} h left`;
}

function ReplyWindowChip({ msLeft }) {
  if (msLeft === undefined) return null;
  const open = msLeft !== null && msLeft > 0;
  const soon = open && msLeft < 2 * 60 * 60 * 1000;
  return (
    <span
      title={
        open
          ? "You can reply freely until the 24-hour window closes. After that, only approved templates can be sent."
          : "More than 24 hours since the customer's last message. Only approved templates can be sent until they reply."
      }
      className={cn(
        "hidden shrink-0 items-center gap-1.5 rounded-full px-2 sm:px-2.5 py-1 text-[12px] font-medium sm:inline-flex",
        !open ? "bg-danger-soft text-danger" : soon ? "bg-warning-soft text-warning" : "bg-brand-50 text-brand-800",
      )}
    >
      <Clock3 className="h-3.5 w-3.5 shrink-0" />
      {open ? (
        <>
          <span className="hidden xl:inline">Reply window: </span>
          <span>{formatWindowLeft(msLeft)}</span>
        </>
      ) : (
        <>
          <span className="hidden xl:inline">Reply window </span>
          <span>Closed</span>
        </>
      )}
    </span>
  );
}

const CHAT_BG = "bg-[#f6f5f1]";

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0])
    .join("")
    .toUpperCase();
}

// Presentation helpers for the date separator pills between messages.
function getDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (getDayKey(date) === getDayKey(now)) return "Today";
  if (getDayKey(date) === getDayKey(yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
}

function IconButton({ active, className, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
        active ? "bg-brand-50 text-brand-800" : "text-ink-muted hover:bg-canvas hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function AssignDropdown({ assignedAgent, agents, currentUser, onAssign }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const canAssign =
    currentUser?.role === "ADMIN" || currentUser?.role === "TEAM_LEAD";

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = assignedAgent?.name || "Unassigned";

  if (!canAssign) {
    return (
      <div className="hidden items-center gap-2 sm:flex">
        <span className="text-[13px] text-ink-muted">Assigned to</span>
        <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink">
          <UserRound className="h-4 w-4 text-ink-muted" />
          <span className="max-w-[120px] truncate">{label}</span>
        </span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative hidden items-center gap-2 sm:flex shrink-0">
      <span className="hidden text-[13px] text-ink-muted 2xl:inline">Assigned to</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Assigned to ${label}. Change assignment`}
        className={cn(
          "flex h-8 sm:h-9 items-center gap-1.5 sm:gap-2 rounded-lg border px-2 sm:px-2.5 xl:px-3 text-[13px] sm:text-[14px] font-medium transition-colors",
          assignedAgent
            ? "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100"
            : "border-line-strong bg-surface text-ink hover:border-ink-subtle hover:bg-canvas",
        )}
      >
        <UserRound className="h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-80 shrink-0" />
        <span className="max-w-[76px] sm:max-w-[96px] xl:max-w-[120px] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-60 shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[220px] rounded-xl border border-line bg-surface py-1.5 shadow-[var(--shadow-pop)]">
          <p className="px-3.5 pb-1.5 pt-1 text-[13px] text-ink-muted">Assign this chat to</p>
          <button
            type="button"
            onClick={() => { onAssign(null); setOpen(false); }}
            className={cn(
              "flex w-full items-center gap-2.5 px-3.5 py-2 text-[14px] transition-colors hover:bg-canvas",
              !assignedAgent ? "font-medium text-brand-700" : "text-ink-muted",
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas text-[12px] font-semibold text-ink-muted">
              —
            </span>
            Unassigned
          </button>

          {agents.length > 0 && <div className="my-1 border-t border-line" />}

          {agents.map((agent) => {
            const agentId = agent._id || agent.id;
            const isActive = assignedAgent?.id === agentId;
            const initials = (agent.name || "?")
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0])
              .join("")
              .toUpperCase();
            return (
              <button
                key={agentId}
                type="button"
                onClick={() => { onAssign(agentId); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3.5 py-2 text-[14px] transition-colors hover:bg-canvas",
                  isActive ? "font-medium text-brand-700" : "text-ink",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                    isActive ? "bg-brand-100 text-brand-800" : "bg-brand-50 text-brand-800",
                  )}
                >
                  {initials}
                </span>
                <span className="truncate">{agent.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AiSwitch({ enabled, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(enabled)}
      onClick={onToggle}
      title={enabled ? "AI is replying. Click to turn off" : "AI replies are off. Click to turn on"}
      className="inline-flex h-8 sm:h-9 shrink-0 items-center gap-1.5 sm:gap-2 rounded-lg border border-line-strong bg-surface px-2 sm:px-2.5 text-[13px] sm:text-[14px] font-medium text-ink transition-colors hover:bg-canvas"
    >
      <Sparkles className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0", enabled ? "text-brand-600" : "text-ink-muted")} />
      <span className="hidden xl:inline">AI replies</span>
      <span
        className={cn(
          "relative inline-flex h-4 w-7 sm:h-5 sm:w-8 shrink-0 items-center rounded-full transition-colors",
          enabled ? "bg-brand-600" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "inline-block h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-full bg-white shadow-sm transition-transform",
            enabled ? "translate-x-3.5 sm:translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function ChatPanel({
  conversation,
  messages,
  messagesContainerRef,
  endRef,
  hasMoreMessages,
  isLoadingMoreMessages,
  onLoadMoreMessages,
  onBack,
  onToggleAi,
  composerValue,
  onComposerChange,
  onSend,
  sending,
  loadingMessages,
  typing,
  onOpenContactDrawer,
  onOpenConversationList,
  contactDrawerOpen,
  agents = [],
  currentUser,
  onAssign,
  onTakeChat,
  onSendFile,
  onOpenTemplates,
  quickReplies,
  onManageQuickReplies,
}) {
  const [msgSearch, setMsgSearch] = useState({ open: false, query: "", index: 0 });
  const searchInputRef = useRef(null);
  const hasSeveralNumbers = useWhatsAppNumbersStore((s) => s.numbers.length > 1);
  const chatNumber = useWhatsAppNumbersStore((s) =>
    s.numbers.find((n) => n.phoneNumberId === conversation?.phoneNumberId),
  );

  const windowMsLeft = useReplyWindow(conversation, messages, {
    loading: loadingMessages,
    hasMore: hasMoreMessages,
  });
  // Unknown counts as open: WhatsApp itself will refuse (and the reason is
  // shown) if the window has really closed.
  const windowOpen = windowMsLeft === undefined || (windowMsLeft !== null && windowMsLeft > 0);
  const canTakeChat =
    currentUser?.role === "SUPPORT_AGENT" && conversation && !conversation.assignedAgent && onTakeChat;

  // Reset search when conversation changes
  useEffect(() => {
    setMsgSearch({ open: false, query: "", index: 0 });
  }, [conversation?.id]);

  // Focus search input when opened
  useEffect(() => {
    if (msgSearch.open) {
      searchInputRef.current?.focus();
    }
  }, [msgSearch.open]);

  // Compute matching message indices
  const matchIndices = useMemo(() => {
    const q = msgSearch.query.trim().toLowerCase();
    if (!q) return [];
    return messages.reduce((acc, msg, i) => {
      if (msg.content.toLowerCase().includes(q)) acc.push(i);
      return acc;
    }, []);
  }, [messages, msgSearch.query]);

  const totalMatches = matchIndices.length;
  const safeIndex = totalMatches > 0 ? ((msgSearch.index % totalMatches) + totalMatches) % totalMatches : 0;
  const currentMatchMsgId = totalMatches > 0 ? messages[matchIndices[safeIndex]]?.id : null;

  // Scroll to current match
  useEffect(() => {
    if (!currentMatchMsgId) return;
    const el = document.querySelector(`[data-message-id="${currentMatchMsgId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentMatchMsgId]);

  const handleSearchToggle = () => {
    setMsgSearch((s) =>
      s.open
        ? { open: false, query: "", index: 0 }
        : { open: true, query: "", index: 0 },
    );
  };

  const handleSearchNav = (dir) => {
    setMsgSearch((s) => ({ ...s, index: s.index + dir }));
  };

  const cleanName =
    !conversation?.contact?.name ||
    conversation.contact.name.trim() === "" ||
    conversation.contact.name === "~" ||
    conversation.contact.name === "Unknown Contact"
      ? formatPhone(conversation?.contact?.phone)
      : conversation.contact.name;

  if (!conversation) {
    return (
      <section
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center px-6 lg:border-l lg:border-line",
          CHAT_BG,
        )}
      >
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface shadow-[var(--shadow-card)]">
            <MessageSquareText className="h-6 w-6 text-brand-600" />
          </div>
          <h2 className="text-[17px] font-semibold text-ink">Select a conversation</h2>
          <p className="mt-1.5 text-[14px] text-ink-muted">
            Choose a chat from the list to read messages and reply to your customer.
          </p>
          <button
            type="button"
            onClick={onOpenConversationList}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-900 px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-800 lg:hidden"
          >
            <MessageSquareText className="h-4 w-4" />
            Open conversations
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "relative flex min-h-0 flex-1 border-l border-line transition-[padding-right] duration-300",
        CHAT_BG,
        contactDrawerOpen ? "lg:pr-[320px] 2xl:pr-[360px]" : "lg:pr-0",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-line bg-surface px-3 py-2.5 sm:px-4 sm:py-3 lg:px-5">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <IconButton onClick={onBack} className="lg:hidden" aria-label="Back to conversations">
                <ChevronLeft className="h-5 w-5" />
              </IconButton>

              <button
                type="button"
                onClick={onOpenContactDrawer}
                className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3 rounded-lg text-left"
                title="View contact details"
              >
                {(() => {
                  const activity = getActivityStatus(conversation.lastMessageTime, conversation.online);
                  return (
                    <>
                      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-[14px] font-semibold text-brand-800">
                        {conversation.contact.profilePic ? (
                          <img
                            src={conversation.contact.profilePic}
                            alt={cleanName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span>{getInitials(cleanName)}</span>
                        )}
                        {activity.isOnline && (
                          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h1 className="truncate text-[15px] font-semibold leading-tight text-ink">
                          {cleanName}
                        </h1>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] sm:text-[13px] text-ink-muted">
                          <span className="shrink-0 tabular-nums">{formatPhone(conversation.contact.phone)}</span>
                          <span aria-hidden className="shrink-0 text-line-strong">•</span>
                          <span className={cn("truncate shrink-0", activity.isOnline ? "font-medium text-brand-700" : "")}>
                            {activity.label}
                          </span>
                          {chatNumber && hasSeveralNumbers ? (
                            <span className="hidden 2xl:inline-flex shrink-0 items-center gap-1 text-ink-subtle">
                              <span aria-hidden className="text-line-strong">•</span>
                              via {numberLabel(chatNumber)}
                            </span>
                          ) : null}
                          {conversation.contact.optedOut ? (
                            <span className="shrink-0 rounded-full bg-danger-soft px-2 py-px text-[11px] font-medium text-danger">
                              Opted out
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 xl:gap-2">
              <ReplyWindowChip msLeft={windowMsLeft} />
              {canTakeChat && (
                <button
                  type="button"
                  onClick={onTakeChat}
                  title="Assign this chat to yourself"
                  className="inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2 sm:px-3 text-[13px] sm:text-[14px] font-medium text-brand-800 hover:bg-brand-100"
                >
                  <Hand className="h-4 w-4" />
                  <span className="hidden lg:inline">Take chat</span>
                </button>
              )}
              <AssignDropdown
                assignedAgent={conversation.assignedAgent}
                agents={agents}
                currentUser={currentUser}
                onAssign={onAssign}
              />
              <AiSwitch enabled={conversation.aiEnabled} onToggle={onToggleAi} />
              <IconButton
                onClick={handleSearchToggle}
                active={msgSearch.open}
                title="Search in conversation"
                aria-label="Search in conversation"
              >
                <Search className="h-[18px] w-[18px]" />
              </IconButton>
              <IconButton
                onClick={onOpenContactDrawer}
                active={contactDrawerOpen}
                title="Contact details"
                aria-label="Contact details"
              >
                <PanelRight className="h-[18px] w-[18px]" />
              </IconButton>
            </div>
          </div>

          {/* In-message search bar */}
          {msgSearch.open && (
            <div className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                <input
                  ref={searchInputRef}
                  value={msgSearch.query}
                  onChange={(e) =>
                    setMsgSearch((s) => ({ ...s, query: e.target.value, index: 0 }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearchNav(e.shiftKey ? -1 : 1);
                    }
                    if (e.key === "Escape") handleSearchToggle();
                  }}
                  placeholder="Search in this conversation…"
                  aria-label="Search in this conversation"
                  className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-brand-600 focus:ring-4 focus:ring-brand-600/12"
                />
              </div>

              {msgSearch.query.trim() && (
                <span className="shrink-0 text-[13px] tabular-nums text-ink-muted">
                  {totalMatches === 0
                    ? "No results"
                    : `${safeIndex + 1} of ${totalMatches}`}
                </span>
              )}

              <IconButton
                onClick={() => handleSearchNav(-1)}
                disabled={totalMatches === 0}
                className="disabled:opacity-40"
                title="Previous match (Shift+Enter)"
                aria-label="Previous match"
              >
                <ChevronUp className="h-4 w-4" />
              </IconButton>

              <IconButton
                onClick={() => handleSearchNav(1)}
                disabled={totalMatches === 0}
                className="disabled:opacity-40"
                title="Next match (Enter)"
                aria-label="Next match"
              >
                <ChevronDown className="h-4 w-4" />
              </IconButton>

              <IconButton
                onClick={handleSearchToggle}
                title="Close search (Esc)"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          )}
        </header>

        {/* Messages */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div
            ref={messagesContainerRef}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4 lg:px-6"
          >
            <div className="flex w-full flex-col gap-2 sm:gap-2.5">
              {!loadingMessages && hasMoreMessages && (
                <button
                  type="button"
                  onClick={onLoadMoreMessages}
                  disabled={isLoadingMoreMessages}
                  className="mx-auto mb-2 flex h-9 items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 text-[13px] font-medium text-ink-muted shadow-[0_1px_1px_rgba(15,28,23,0.04)] transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingMoreMessages ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-brand-600" />
                      Loading…
                    </>
                  ) : (
                    "Load older messages"
                  )}
                </button>
              )}

              {loadingMessages && (
                <div className="flex justify-center py-10" aria-live="polite">
                  <span className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-[13px] text-ink-muted shadow-[0_1px_1px_rgba(15,28,23,0.04)]">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-brand-600" />
                    Loading messages…
                  </span>
                </div>
              )}

              {!loadingMessages &&
                messages.map((message, index) => {
                  const previous = messages[index - 1];
                  const showSenderLabel =
                    message.sender !== "user" &&
                    (!previous ||
                      previous.sender !== message.sender ||
                      previous.senderName !== message.senderName);
                  const showDate =
                    !previous ||
                    getDayKey(previous.createdAt) !== getDayKey(message.createdAt);
                  const dayLabel = showDate ? formatDayLabel(message.createdAt) : "";

                  return (
                    <Fragment key={message.id}>
                      {dayLabel && (
                        <div className="my-2 flex justify-center">
                          <span className="rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-ink-muted shadow-[0_1px_1px_rgba(15,28,23,0.04)]">
                            {dayLabel}
                          </span>
                        </div>
                      )}
                      <MessageBubble
                        message={message}
                        showSenderLabel={showSenderLabel}
                        searchQuery={msgSearch.open ? msgSearch.query.trim() : ""}
                        isCurrentMatch={msgSearch.open && message.id === currentMatchMsgId}
                      />
                    </Fragment>
                  );
                })}

              <div ref={endRef} />

              {typing && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="flex items-center gap-2 px-1"
                >
                  <div className="flex h-8 items-center rounded-2xl rounded-tl-md border border-line bg-surface px-3">
                    <span className="typing-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                  <span className="text-[13px] text-ink-muted">Typing…</span>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Composer or AI notice */}
        {!conversation.aiEnabled ? (
          <>
            {conversation.escalationReason ? (
              <div className="flex items-center gap-2 border-t border-[#f3dfb5] bg-warning-soft px-4 py-2.5 text-[14px] text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  This chat needs you: {ESCALATION_LABELS[conversation.escalationReason] || conversation.escalationReason}.
                  The AI has stopped replying here.
                </span>
              </div>
            ) : null}
            {windowOpen ? (
              <ChatInput
                key={conversation.id}
                value={composerValue}
                onChange={onComposerChange}
                onSend={onSend}
                sending={sending}
                onSendFile={onSendFile}
                onOpenTemplates={onOpenTemplates}
                quickReplies={quickReplies}
                onManageQuickReplies={onManageQuickReplies}
              />
            ) : (
              <div className="border-t border-line bg-surface px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface">
                    <Clock3 className="h-4 w-4 text-ink-muted" />
                  </div>
                  <p className="min-w-0 flex-1 text-[13.5px] sm:text-[14px] text-ink">
                    {windowMsLeft === null
                      ? `${cleanName} hasn't messaged you yet.`
                      : `It's been more than 24 hours since ${cleanName} last messaged you.`}{" "}
                    <span className="text-ink-muted">
                      WhatsApp only allows an approved template now. Once they reply, you can chat freely again.
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={onOpenTemplates}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-900 px-3 text-[14px] font-medium text-white transition-colors hover:bg-brand-800"
                  >
                    <LayoutTemplate className="h-4 w-4" />
                    Send a template
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="border-t border-line bg-surface px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface">
                <Sparkles className="h-4 w-4 text-brand-600" />
              </div>
              <p className="min-w-0 flex-1 text-[14px] text-brand-900">
                AI is replying to this customer. Turn off AI replies to type a message yourself.
              </p>
              <button
                type="button"
                onClick={onToggleAi}
                className="inline-flex h-9 shrink-0 items-center rounded-lg border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink transition-colors hover:bg-canvas"
              >
                Reply myself
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
