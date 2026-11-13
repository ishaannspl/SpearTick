import { useEffect, useRef, useState } from "react";
import api, { fetchCampaignRates, fetchSegments } from "../../services/api";
import { resolveMediaUrl } from "../../utils/media";
import { toast } from "react-hot-toast";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle,
  ChevronDown,
  FileText,
  Lock,
  Plus,
  Send,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { META_CATEGORY_LABELS, extractVariableTokens, templateStage } from "../../constants/templates";
import {
  EMPTY_SHEET,
  columnToken,
  missingMessageColumns,
  normalizePhone,
  parseSheet,
  phoneColumn,
  requiredKeysFor,
  resolveForRow,
  sheetToCsvFile,
  suggestMapping,
  toCampaignTokens,
  validateSheet,
} from "../../utils/contactSheet";
import { ContactSheetEditor, SheetPreview, VariableSourceInput } from "../../components/campaigns/ContactSheet";
import { fetchSegmentAsCsvFile } from "../../utils/segmentToCsv";
import usePlan from "../../hooks/usePlan";
import useAuthStore from "../../store/authStore";
import useWhatsAppNumbersStore, { numberLabel } from "../../store/whatsappNumbersStore";
import { markTestSent } from "../../utils/onboardingProgress";
import { Button, Card, Field, Input, Modal, Select, Textarea } from "../../components/ui";
import { cn } from "../../utils/cn";

/* ── shared control class (for hand-rolled controls that mirror ui/Field) ── */
const controlCls =
  "block h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[14px] text-ink placeholder:text-ink-subtle transition-colors hover:border-ink-subtle focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/12";

const STEPS = [
  { n: 1, label: "Who gets it" },
  { n: 2, label: "Message" },
  { n: 3, label: "When" },
  { n: 4, label: "Review & send" },
];

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

// At least a minute ahead, so a campaign is never scheduled in the past.
const isFutureTime = (date) => date.getTime() > Date.now() + 60 * 1000;

const plural = (n, word) => `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || ""} ${amount.toFixed(2)}`;
  }
}

/* ── Step indicator ── */
function WizardSteps({ current, isOpenable, onSelect }) {
  return (
    <ol className="mb-6 grid grid-cols-2 gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-2 shadow-[var(--shadow-card)] sm:grid-cols-4">
      {STEPS.map((s) => {
        const done = s.n < current;
        const active = s.n === current;
        const openable = isOpenable(s.n);
        return (
          <li key={s.n}>
            <button
              type="button"
              disabled={!openable}
              onClick={() => onSelect(s.n)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                active ? "bg-brand-50" : openable ? "hover:bg-canvas" : "cursor-not-allowed",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums",
                  done
                    ? "bg-brand-600 text-white"
                    : active
                      ? "bg-brand-900 text-white"
                      : "border border-line-strong text-ink-muted",
                )}
              >
                {done ? <Check size={14} /> : s.n}
              </span>
              <span className={cn("text-[14px] font-medium", active ? "text-ink" : "text-ink-muted")}>{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Form section ── */
function FormSection({ title, description, children }) {
  return (
    <Card as="section">
      <div className="mb-5">
        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-[14px] text-ink-muted">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

/* ── Summary row ── */
function SummaryRow({ label, value, valueClass = "text-ink" }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2.5 last:border-0 last:pb-0">
      <span className="text-[14px] text-ink-muted">{label}</span>
      <span className={`max-w-[65%] text-right text-[14px] font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

/* ── Stat tile ── */
function StatTile({ label, value, tone }) {
  const tones = {
    default: "text-ink",
    brand: "text-brand-700",
    danger: "text-danger",
    warning: "text-warning",
  };
  return (
    <div className="rounded-xl border border-line bg-canvas px-3.5 py-3">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className={`mt-1 text-[22px] font-semibold tracking-[-0.02em] tabular-nums ${tones[tone] || tones.default}`}>
        {value}
      </p>
    </div>
  );
}

/* ── Inline note (success / warning) ── */
function Note({ tone = "brand", icon: Icon, children }) {
  const tones = {
    brand: "border-brand-100 bg-brand-50 text-brand-800",
    warning: "border-warning/20 bg-warning-soft text-warning",
  };
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[14px]", tones[tone])}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

/* ── WhatsApp-style preview ── */
function MessagePreview({ title, subtitle, text, imageUrl }) {
  const hasText = text.trim().length > 0;
  return (
    <Card>
      <h2 className="text-[17px] font-semibold text-ink">Preview</h2>
      <p className="mt-1 text-[14px] text-ink-muted">{subtitle}</p>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <div className="flex items-center gap-2.5 bg-brand-900 px-3.5 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-[12px] font-semibold text-white">
            WA
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-white">{title}</p>
            <p className="text-[12px] text-white/75">online</p>
          </div>
        </div>
        <div className="min-h-[160px] bg-[#efeae2] p-3.5">
          <div className="flex justify-end">
            {hasText ? (
              <div className="max-w-[92%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 shadow-[0_1px_1px_rgba(15,28,23,0.12)]">
                {imageUrl && (
                  <div className="mb-2 overflow-hidden rounded-lg bg-black/5">
                    <img
                      src={resolveMediaUrl(imageUrl)}
                      alt=""
                      className="block h-auto max-h-[380px] w-full rounded-lg object-contain"
                    />
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-ink">{text}</p>
                <div className="mt-0.5 flex justify-end">
                  <CheckCheck className="h-4 w-4 text-brand-600" aria-hidden="true" />
                </div>
              </div>
            ) : (
              <div className="max-w-[92%] rounded-xl rounded-tr-sm bg-surface/80 px-3 py-2">
                <p className="text-[14px] text-ink-muted">Your message preview will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ══ Main component ══════════════════════════════════════════════════════════ */
export default function CampaignUpload() {
  const fileInputRef = useRef(null);
  const templateDropdownRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const prefilledCount = location.state?.prefilledCount;
  const companyId = useAuthStore((s) => s.user?.companyId);

  const [step, setStep] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rates, setRates] = useState(null);

  const [file, setFile] = useState(location.state?.prefilledFile || null);
  const [segments, setSegments] = useState([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [segmentAudienceCount, setSegmentAudienceCount] = useState(null);
  // Which of the company's WhatsApp numbers this campaign sends from.
  // Empty = the default number (only shown as a choice when there are several).
  const waNumbers = useWhatsAppNumbersStore((s) => s.numbers);
  const waDefaultId = useWhatsAppNumbersStore((s) => s.defaultPhoneNumberId);
  const loadWaNumbers = useWhatsAppNumbersStore((s) => s.load);
  const [sendFromId, setSendFromId] = useState("");
  const sendFromNumber = waNumbers.find((n) => n.phoneNumberId === (sendFromId || waDefaultId)) || null;
  useEffect(() => {
    loadWaNumbers();
  }, [loadWaNumbers]);
  const [testPhone, setTestPhone] = useState(() => localStorage.getItem("campaignTestPhone") || "");
  const [testSending, setTestSending] = useState(false);
  const [campaignName, setCampaignName] = useState(location.state?.prefilledCampaignName || "");
  const [message, setMessage] = useState(() => toCampaignTokens(location.state?.prefilledMessage || ""));
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [dbTemplates, setDbTemplates] = useState([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedNormalTemplateId, setSelectedNormalTemplateId] = useState("");
  // The uploaded file parsed into editable rows. Edits made in the review
  // table live here, and this (not the original file) is what gets sent.
  const [sheet, setSheet] = useState(EMPTY_SHEET);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFilter, setEditorFilter] = useState("all");
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  // Approved templates are the default: WhatsApp rejects plain text to anyone
  // who hasn't messaged the business in the last 24 hours, which is most of a
  // broadcast list. "Send again" of an old plain-text campaign keeps plain text.
  const prefilledTemplateId = location.state?.prefilledTemplateId || "";
  const [useMetaTemplate, setUseMetaTemplate] = useState(
    Boolean(prefilledTemplateId) || !location.state?.prefilledMessage,
  );
  const [selectedMetaTemplateId, setSelectedMetaTemplateId] = useState(prefilledTemplateId);
  const [templateVariableValues, setTemplateVariableValues] = useState([]);
  const [buttonVariableValues, setButtonVariableValues] = useState([]);

  const { canUse, hasReachedLimit, getLimit, getUsage, plan } = usePlan();
  const canSchedule = canUse("campaignSchedule");
  const campaignLimitReached = hasReachedLimit("campaigns");

  // Saved plain messages (templates never sent to WhatsApp for approval).
  const savedMessages = dbTemplates.filter((t) => templateStage(t) === "plain" && t.status !== "archived");
  const selectedNormalTemplate = savedMessages.find((t) => (t._id || t.id) === selectedNormalTemplateId);

  const metaApprovedTemplates = dbTemplates.filter((t) => t.metaStatus === "APPROVED");
  const metaWaitingCount = dbTemplates.filter((t) => t.metaStatus === "PENDING").length;
  const selectedMetaTemplate = metaApprovedTemplates.find((t) => t._id === selectedMetaTemplateId);
  // Templates are stored with their original friendly tokens (e.g. {{name}})
  // — only Meta's own copy gets converted to {{1}}, {{2}} at submission time
  // (see templateService.js's toPositionalBody). Counting must recognize
  // both forms, or named-token templates show zero value inputs here.
  const metaVariableCount = selectedMetaTemplate
    ? extractVariableTokens(selectedMetaTemplate.description).length
    : 0;

  // Which of the template's buttons need a per-campaign value — only URL
  // buttons with a dynamic {{1}}; static buttons (fixed URL/phone/quick
  // reply) need nothing at send time.
  const dynamicButtonIndexes = (selectedMetaTemplate?.buttons || [])
    .map((button, index) => ({ button, index }))
    .filter(({ button }) => button.type === "URL" && /\{\{1\}\}/.test(button.url || ""))
    .map(({ index }) => index);

  // The plain message with friendly blanks ({{name}}, {{amount}}) turned into
  // sheet references — this is what gets previewed, validated and sent.
  const campaignMessage = toCampaignTokens(message);
  const missingColumns = !useMetaTemplate && sheet.columns.length
    ? missingMessageColumns(campaignMessage, sheet)
    : [];

  // Columns the message depends on — their cells must not be empty.
  const usedVariableValues = useMetaTemplate
    ? [
        ...templateVariableValues.slice(0, metaVariableCount),
        ...dynamicButtonIndexes.map((i) => buttonVariableValues[i]),
      ]
    : [...campaignMessage.matchAll(/\{\{(?:contact_name|col:[a-z0-9_]+)\}\}/g)].map((m) => m[0]);
  const requiredKeys = requiredKeysFor(usedVariableValues);
  const validation = validateSheet(sheet, requiredKeys);
  // Step 1 only checks the phone numbers; empty cells in columns the message
  // uses are checked again on the review step once the message is known.
  const audienceCheck = validateSheet(sheet, []);
  const sampleRow = sheet.rows.find((r) => !validation.issues.has(r.id)) || sheet.rows[0];
  const metaTokens = selectedMetaTemplate ? extractVariableTokens(selectedMetaTemplate.description) : [];

  // Stored on the campaign; the old manual "campaign type" field is gone.
  const campaignType = useMetaTemplate
    ? META_CATEGORY_LABELS[selectedMetaTemplate?.metaCategory] || "Marketing"
    : "Broadcast";

  // What the first contact will actually receive.
  const previewText = (() => {
    if (useMetaTemplate) {
      if (!selectedMetaTemplate) return "";
      let text = selectedMetaTemplate.description || "";
      metaTokens.forEach((token, i) => {
        const filled = resolveForRow(templateVariableValues[i] || "", sheet, sampleRow);
        text = text.split(`{{${token}}}`).join(filled || `{{${i + 1}}}`);
      });
      return text;
    }
    const nameCol = sheet.columns.find((c) => c.role === "name");
    const firstName = (sampleRow && nameCol && sampleRow.cells[nameCol.key]) || "Customer";
    return resolveForRow(campaignMessage, sheet, sampleRow).replace(/\{\{1\}\}/g, firstName);
  })();

  const previewImage = useMetaTemplate
    ? selectedMetaTemplate?.headerType === "IMAGE"
      ? selectedMetaTemplate.headerMediaUrl ||
        selectedMetaTemplate.mediaUrl ||
        (/^https?:\/\//i.test(selectedMetaTemplate.headerHandle || "") ? selectedMetaTemplate.headerHandle : "")
      : ""
    : selectedNormalTemplate?.mediaUrl || "";

  /* ── Step readiness ── */
  const hasAudience = Boolean(file) && sheet.rows.length > 0 && Boolean(phoneColumn(sheet));
  const step1Ok = hasAudience && audienceCheck.counts.needsAttention === 0 && audienceCheck.counts.ready > 0;
  const messageReady = isMessageReady();
  const step2Ok = messageReady && missingColumns.length === 0;
  const scheduleAtDate = isScheduled && scheduleDate && scheduleTime ? new Date(`${scheduleDate}T${scheduleTime}`) : null;
  const scheduleInFuture = Boolean(scheduleAtDate) && isFutureTime(scheduleAtDate);
  const step3Ok = !isScheduled || scheduleInFuture;
  const stepOk = { 1: step1Ok, 2: step2Ok, 3: step3Ok };
  const isOpenable = (n) => n <= step || [1, 2, 3].slice(0, n - 1).every((k) => stepOk[k]);

  const readyCount = validation.counts.ready;
  const rateKey = useMetaTemplate ? (selectedMetaTemplate?.metaCategory || "MARKETING").toLowerCase() : null;
  const rate = rateKey ? Number(rates?.rates?.[rateKey]) || 0 : 0;
  const costText = !useMetaTemplate
    ? "Usually free (only reaches people who messaged you in the last 24 hours)"
    : rate > 0
      ? `About ${formatMoney(readyCount * rate, rates?.currency)} (${formatMoney(rate, rates?.currency)} per message, charged by WhatsApp)`
      : "Shown after your first few campaigns. WhatsApp charges per message delivered.";

  const defaultCampaignName = `${(useMetaTemplate ? selectedMetaTemplate?.name : selectedNormalTemplate?.name) || "Campaign"} – ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
  const finalCampaignName = campaignName.trim() || defaultCampaignName;

  const whenText = isScheduled && scheduleAtDate
    ? `${scheduleAtDate.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} (${TIME_ZONE})`
    : "Right away";

  function autoMatchVariables() {
    if (!sheet.columns.length || !selectedMetaTemplate) return;
    setTemplateVariableValues(suggestMapping(sheet, metaTokens));
  }

  function openEditor(filter = "all") {
    setEditorFilter(filter);
    setEditorOpen(true);
  }

  // Drops the rows the checks flagged, so the user can carry on without
  // fixing each one by hand.
  function skipProblemRows(check) {
    setSheet((current) => ({ ...current, rows: current.rows.filter((r) => !check.issues.has(r.id)) }));
  }

  async function fetchTemplates() {
    try {
      const r = await api.get("api/templates");
      setDbTemplates(r.data.templates || []);
    } catch {
      toast.error("Couldn't load your templates. Refresh the page to try again.");
    } finally {
      setTemplatesLoaded(true);
    }
  }

  async function loadSegments() {
    try {
      const res = await fetchSegments();
      setSegments(res.segments || []);
    } catch {
      // Groups are optional here; uploading a file still works.
    }
  }

  async function handleSegmentSelect(segmentId) {
    setSelectedSegmentId(segmentId);
    if (!segmentId) {
      setSegmentAudienceCount(null);
      setFile(null);
      return;
    }

    const segment = segments.find((s) => s._id === segmentId);
    try {
      const { file: segmentFile, count, excludedCount } = await fetchSegmentAsCsvFile(segmentId, segment?.name);
      if (excludedCount > 0) {
        toast(`${plural(excludedCount, "contact")} who opted out won't get this message`);
      }
      setFile(segmentFile);
      setSegmentAudienceCount(count);
    } catch {
      toast.error("Couldn't load the contacts in this group. Please try again.");
    }
  }

  function acceptFile(f) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please choose a .csv file. In Excel or Google Sheets, use Save as / Download → CSV.");
      return;
    }
    setSelectedSegmentId("");
    setSegmentAudienceCount(null);
    setFile(f);
  }

  function handleDragOver(e) { e.preventDefault(); e.stopPropagation(); setDragActive(true); }
  function handleDragLeave(e) { e.preventDefault(); e.stopPropagation(); setDragActive(false); }
  function handleDrop(e) {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    acceptFile(e.dataTransfer.files?.[0]);
  }

  // Shared between the real submit and the test-send call — guarantees
  // "what you test is what you send", since both build the exact same
  // message/template/variables shape from the same form state.
  function buildMessagePayload() {
    if (useMetaTemplate) {
      return {
        useMetaTemplate: true,
        templateId: selectedMetaTemplate?._id,
        templateVariables: templateVariableValues.slice(0, metaVariableCount),
        buttonVariables: buttonVariableValues,
        message: selectedMetaTemplate?.description,
      };
    }
    return {
      useMetaTemplate: false,
      message: campaignMessage,
      mediaUrl: selectedNormalTemplate?.mediaUrl || "",
    };
  }

  function isMessageReady() {
    if (useMetaTemplate) {
      if (!selectedMetaTemplate) return false;
      if (templateVariableValues.slice(0, metaVariableCount).some((v) => !v?.trim())) return false;
      if (dynamicButtonIndexes.some((i) => !buttonVariableValues[i]?.trim())) return false;
      return true;
    }
    return message.trim().length > 0;
  }

  // Explains what is missing on a step instead of just disabling "Continue".
  function blockerFor(n) {
    if (n === 1) {
      if (!file) return "Choose a group or upload a file of contacts first.";
      if (!sheet.rows.length) return "This list has no contacts in it.";
      if (!phoneColumn(sheet)) return "Tell us which column has the phone numbers.";
      if (audienceCheck.counts.needsAttention > 0) return "Fix or skip the contacts that need attention.";
      return null;
    }
    if (n === 2) {
      if (useMetaTemplate && !selectedMetaTemplate) return "Choose an approved template.";
      if (useMetaTemplate && !messageReady) return "Fill in every blank in the template.";
      if (!useMetaTemplate && !message.trim()) return "Write your message.";
      if (missingColumns.length) return `Your message uses {{${missingColumns[0]}}} but your list has no "${missingColumns[0]}" column.`;
      return null;
    }
    if (n === 3) {
      if (isScheduled && (!scheduleDate || !scheduleTime)) return "Pick a date and time.";
      if (isScheduled && !scheduleInFuture) return "Pick a time in the future.";
      return null;
    }
    return null;
  }

  function goNext() {
    const blocker = blockerFor(step);
    if (blocker) {
      if (step === 1 && file && sheet.rows.length && !phoneColumn(sheet)) openEditor("all");
      toast.error(blocker);
      return;
    }
    setStep((s) => Math.min(s + 1, 4));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function requestSend() {
    for (const n of [1, 2, 3]) {
      const blocker = blockerFor(n);
      if (blocker) {
        setStep(n);
        toast.error(blocker);
        return;
      }
    }
    if (validation.counts.needsAttention > 0) {
      toast.error("Some contacts are missing values your message needs. Fix or skip them first.");
      return;
    }
    if (campaignLimitReached) {
      toast.error("You've reached this month's campaign limit. Upgrade your plan to send more.");
      return;
    }
    setConfirmOpen(true);
  }

  async function handleSubmit() {
    const scheduleAt = isScheduled && scheduleAtDate ? scheduleAtDate.toISOString() : null;
    const payload = buildMessagePayload();
    const formData = new FormData();
    formData.append("file", sheetToCsvFile(sheet, file?.name || "contacts.csv"));
    formData.append("campaignName", finalCampaignName);
    // Pinned to the campaign now, so changing the default number later never
    // redirects a campaign that is already scheduled.
    if (sendFromNumber) formData.append("phoneNumberId", sendFromNumber.phoneNumberId);
    formData.append("campaignType", campaignType);
    formData.append("scheduleAt", scheduleAt || "");
    formData.append("message", payload.message);

    if (useMetaTemplate) {
      formData.append("templateId", payload.templateId);
      formData.append("templateVariables", JSON.stringify(payload.templateVariables));
      formData.append("buttonVariables", JSON.stringify(payload.buttonVariables));
    } else if (selectedNormalTemplate?.mediaUrl) {
      formData.append("mediaUrl", selectedNormalTemplate.mediaUrl);
      formData.append("mediaType", selectedNormalTemplate.mediaType || "");
    }

    try {
      setUploading(true);
      const { data } = await api.post("api/campaigns/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
      const excluded = data?.excludedCount
        ? ` ${plural(data.excludedCount, "contact")} who opted out were left out.`
        : "";
      toast.success(`${isScheduled ? "Campaign scheduled." : "Campaign is sending."}${excluded}`, { duration: 6000 });
      setConfirmOpen(false);
      const id = data?.campaign?._id;
      navigate(id ? `/campaigns/${id}/analytics` : "/campaigns/history", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || "The campaign couldn't be created. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSendTest() {
    if (!testPhone.trim()) return toast.error("Enter your own WhatsApp number to send a test to");
    if (!messageReady) return toast.error("Finish your message first, then send a test");

    try {
      setTestSending(true);
      localStorage.setItem("campaignTestPhone", testPhone.trim());
      const payload = buildMessagePayload();
      const usesSheet = usedVariableValues.some((v) => /\{\{col:/.test(v || ""));
      if (usesSheet && !sampleRow) {
        toast.error("Add contacts first so the test can use real values");
        return;
      }
      const fill = (v) => resolveForRow(v, sheet, sampleRow);
      const resolved = payload.useMetaTemplate
        ? { ...payload, templateVariables: payload.templateVariables.map(fill), buttonVariables: (payload.buttonVariables || []).map((v) => (v ? fill(v) : v)) }
        : { ...payload, message: fill(payload.message) };
      await api.post("api/campaigns/test-send", {
        ...resolved,
        phone: normalizePhone(testPhone),
        ...(sendFromNumber ? { phoneNumberId: sendFromNumber.phoneNumberId } : {}),
      });
      markTestSent(companyId);
      toast.success("Test sent. Check WhatsApp on that phone.");
    } catch (err) {
      toast.error(err?.response?.data?.message || "The test message couldn't be sent. Please try again.");
    } finally {
      setTestSending(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!file) { setSheet(EMPTY_SHEET); return; }
      try {
        const text = await file.text();
        if (!active) return;
        setSheet(parseSheet(text));
      } catch { if (!active) return; setSheet(EMPTY_SHEET); }
    })();
    return () => { active = false; };
  }, [file]);

  useEffect(() => {
    fetchTemplates();
    loadSegments();
    fetchCampaignRates().then(setRates).catch(() => setRates(null));
  }, []);

  // Pre-fill variable mapping when a template and a sheet are both present
  // and nothing has been chosen yet. Always editable afterwards.
  const sheetColumnsSignature = sheet.columns.map((c) => `${c.key}:${c.role}`).join("|");
  useEffect(() => {
    if (!useMetaTemplate || !selectedMetaTemplate || !sheet.columns.length) return;
    setTemplateVariableValues((current) => {
      const empty = current.slice(0, metaVariableCount).every((v) => !v);
      return empty ? suggestMapping(sheet, extractVariableTokens(selectedMetaTemplate.description)) : current;
    });
  }, [selectedMetaTemplateId, sheetColumnsSignature, useMetaTemplate]);

  useEffect(() => {
    const handler = (e) => {
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(e.target))
        setShowTemplateDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedSegmentName = segments.find((s) => s._id === selectedSegmentId)?.name;
  const currentBlocker = step < 4 ? blockerFor(step) : null;

  /* ══ Step 1: who gets it ══ */
  const audienceStep = (
    <FormSection
      title="Who should get this message?"
      description="Pick one of your saved groups, or upload a list from Excel or Google Sheets (saved as CSV)."
    >
      <div className="space-y-4">
        {prefilledCount && file?.name === "contacts-selection.csv" && (
          <Note icon={CheckCircle}>
            Using {plural(prefilledCount, "contact")} you selected on the Contacts page.
          </Note>
        )}

        {segments.length > 0 && (
          <Select
            label="Send to a saved group"
            help="Or leave this empty and upload a file below."
            value={selectedSegmentId}
            onChange={(e) => handleSegmentSelect(e.target.value)}
            inputClassName="cursor-pointer"
          >
            <option value="">Upload a file instead…</option>
            {segments.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} ({s.contactCount})
              </option>
            ))}
          </Select>
        )}

        {segmentAudienceCount !== null && selectedSegmentId && (
          <Note icon={CheckCircle}>
            Using {plural(segmentAudienceCount, "contact")} from the &ldquo;{selectedSegmentName}&rdquo; group.
          </Note>
        )}

        {!file ? (
          <div
            role="button"
            tabIndex={0}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={cn(
              "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/12",
              dragActive
                ? "border-brand-500 bg-brand-50"
                : "border-line-strong bg-canvas hover:border-brand-400 hover:bg-brand-50/60",
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface">
              <UploadCloud
                className={cn(
                  "h-5 w-5 transition-colors",
                  dragActive ? "text-brand-600" : "text-ink-muted group-hover:text-brand-600",
                )}
              />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-ink">
                {dragActive ? "Drop your file here" : "Drag and drop your contact list here"}
              </p>
              <p className="mt-1 text-[14px] text-ink-muted">
                or <span className="font-medium text-brand-700 underline-offset-2 group-hover:underline">click to choose a file</span>
              </p>
            </div>
            <p className="text-[13px] text-ink-muted">
              A .csv file with a phone number column. A name column is optional.
            </p>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={(e) => acceptFile(e.target.files?.[0])} className="hidden" />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface">
                {selectedSegmentId ? <Users className="h-5 w-5 text-brand-600" /> : <FileText className="h-5 w-5 text-brand-600" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-ink">
                  {selectedSegmentId ? `Group: ${selectedSegmentName}` : file.name}
                </p>
                <p className="text-[13px] text-ink-muted">{plural(sheet.rows.length, "contact")}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
                Use another file
              </Button>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setSelectedSegmentId("");
                  setSegmentAudienceCount(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                aria-label="Remove list"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-muted hover:bg-canvas hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={(e) => acceptFile(e.target.files?.[0])} className="hidden" />
          </div>
        )}

        {file && sheet.columns.length > 0 && !phoneColumn(sheet) && (
          <Note tone="warning" icon={AlertTriangle}>
            We couldn&apos;t tell which column has the phone numbers.{" "}
            <button type="button" onClick={() => openEditor("all")} className="font-semibold underline">
              Choose it here
            </button>
            .
          </Note>
        )}

        {file && sheet.rows.length > 0 && (
          <SheetPreview
            sheet={sheet}
            validation={audienceCheck}
            onReview={() => openEditor("all")}
            onReviewIssues={() => openEditor("attention")}
          />
        )}

        {hasAudience && audienceCheck.counts.needsAttention > 0 && (
          <Note tone="warning" icon={AlertTriangle}>
            {plural(audienceCheck.counts.needsAttention, "contact")} {audienceCheck.counts.needsAttention === 1 ? "has" : "have"} a wrong,
            empty or repeated phone number.{" "}
            <button type="button" onClick={() => openEditor("attention")} className="font-semibold underline">
              Fix them
            </button>{" "}
            or{" "}
            <button type="button" onClick={() => skipProblemRows(audienceCheck)} className="font-semibold underline">
              skip them and continue
            </button>
            .
          </Note>
        )}

        {file && sheet.columns.length > 0 && sheet.rows.length === 0 && (
          <Note tone="warning" icon={AlertTriangle}>
            This file has column headers but no contacts under them.
          </Note>
        )}

        {waNumbers.length > 1 && (
          <Select
            label="Send from"
            value={sendFromNumber?.phoneNumberId || ""}
            onChange={(e) => setSendFromId(e.target.value)}
            inputClassName="cursor-pointer"
            help="Customers will see this WhatsApp number. Replies come back to the same number."
          >
            {waNumbers.map((n) => (
              <option
                key={n.phoneNumberId}
                value={n.phoneNumberId}
                disabled={Boolean(n.status) && n.status !== "CONNECTED"}
              >
                {numberLabel(n)}
                {n.verifiedName ? ` · ${n.verifiedName}` : ""}
                {n.phoneNumberId === waDefaultId ? " (default)" : ""}
              </option>
            ))}
          </Select>
        )}
      </div>
    </FormSection>
  );

  /* ══ Step 2: message ══ */
  const messageStep = (
    <FormSection title="What should the message say?" description="Use a WhatsApp-approved template so it reaches everyone on your list.">
      <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {[
          { value: true, title: "Approved template", text: "Reaches everyone. Recommended." },
          { value: false, title: "Plain message", text: "Only reaches people who messaged you in the last 24 hours." },
        ].map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => setUseMetaTemplate(option.value)}
            aria-pressed={useMetaTemplate === option.value}
            className={cn(
              "rounded-xl border px-4 py-3 text-left transition-colors",
              useMetaTemplate === option.value
                ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                : "border-line-strong bg-surface hover:border-ink-subtle",
            )}
          >
            <p className="text-[14px] font-semibold text-ink">{option.title}</p>
            <p className="mt-0.5 text-[13px] text-ink-muted">{option.text}</p>
          </button>
        ))}
      </div>

      {useMetaTemplate ? (
        <div>
          {templatesLoaded && metaApprovedTemplates.length === 0 ? (
            <Note tone="warning" icon={AlertTriangle}>
              {metaWaitingCount > 0
                ? `You have ${plural(metaWaitingCount, "template")} waiting for WhatsApp's approval. This usually takes a few minutes to a few hours — come back once it's approved.`
                : "You don't have an approved template yet. Create one (or pick a ready-made one) and WhatsApp will check it, usually within a few hours."}{" "}
              <button type="button" onClick={() => navigate("/templates/approved/create")} className="font-semibold underline">
                Create a template
              </button>
            </Note>
          ) : (
            <Field label="Approved template" required htmlFor="meta-template-select">
              <div className="relative">
                <select
                  id="meta-template-select"
                  value={selectedMetaTemplateId}
                  onChange={(e) => {
                    setSelectedMetaTemplateId(e.target.value);
                    setTemplateVariableValues([]);
                    setButtonVariableValues([]);
                  }}
                  className={`${controlCls} cursor-pointer appearance-none pr-10`}
                >
                  <option value="">Choose a template…</option>
                  {metaApprovedTemplates.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name} · {META_CATEGORY_LABELS[t.metaCategory] || "Marketing"}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
              </div>
            </Field>
          )}

          {selectedMetaTemplate && metaVariableCount > 0 && (
            <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[14px] font-medium text-ink">Fill in the blanks</p>
                  <p className="mt-0.5 text-[13px] text-ink-muted">
                    Pick a column from your list so each person gets their own value, or type text that is the same for everyone.
                  </p>
                </div>
                {sheet.columns.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={autoMatchVariables}>
                    Match columns automatically
                  </Button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Array.from({ length: metaVariableCount }, (_, i) => (
                  <VariableSourceInput
                    key={`${selectedMetaTemplateId}-${i}`}
                    index={i}
                    value={templateVariableValues[i] || ""}
                    onChange={(v) => {
                      const next = [...templateVariableValues];
                      next[i] = v;
                      setTemplateVariableValues(next);
                    }}
                    sheet={sheet}
                    sampleRow={sampleRow}
                  />
                ))}
              </div>
            </div>
          )}

          {selectedMetaTemplate && dynamicButtonIndexes.length > 0 && (
            <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
              <p className="text-[14px] font-medium text-ink">Button links</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                The end of the button&apos;s web address, for example an order or invoice number.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {dynamicButtonIndexes.map((i) => (
                  <div key={`${selectedMetaTemplateId}-btn-${i}`}>
                    <p className="mb-1.5 text-[13px] font-medium text-ink">
                      &ldquo;{selectedMetaTemplate.buttons[i].text}&rdquo; button
                    </p>
                    <VariableSourceInput
                      index={i}
                      value={buttonVariableValues[i] || ""}
                      onChange={(v) => {
                        const next = [...buttonVariableValues];
                        next[i] = v;
                        setButtonVariableValues(next);
                      }}
                      sheet={sheet}
                      sampleRow={sampleRow}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-4">
            <Note tone="warning" icon={AlertTriangle}>
              <strong className="font-semibold">Plain messages only reach people who messaged you in the last 24 hours.</strong>{" "}
              WhatsApp blocks them for everyone else, so most of a broadcast list will fail.
            </Note>
          </div>

          {savedMessages.length > 0 && (
            <div className="mb-4">
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Start from a saved message (optional)</label>
              <div ref={templateDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowTemplateDropdown((v) => !v)}
                  className="flex h-11 w-full items-center justify-between rounded-xl border border-line-strong bg-surface px-3.5 text-left text-[14px] transition-colors hover:border-ink-subtle focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/12"
                >
                  <span className={templateSearch ? "text-ink" : "text-ink-subtle"}>
                    {templateSearch || "Choose a saved message…"}
                  </span>
                  <div className="flex items-center gap-1">
                    {templateSearch && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Clear saved message"
                        onClick={(e) => { e.stopPropagation(); setTemplateSearch(""); setMessage(""); setSelectedNormalTemplateId(""); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setTemplateSearch(""); setMessage(""); setSelectedNormalTemplateId(""); } }}
                        className="rounded-md p-1 text-ink-muted hover:bg-canvas hover:text-ink"
                      >
                        <X className="h-4 w-4" />
                      </span>
                    )}
                    <ChevronDown className="h-4 w-4 text-ink-subtle" />
                  </div>
                </button>

                {showTemplateDropdown && (
                  <div className="absolute z-50 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-[0_12px_32px_rgba(15,28,23,0.12)]">
                    {savedMessages.map((t) => (
                      <button
                        key={t._id || t.id}
                        type="button"
                        onClick={() => {
                          setTemplateSearch(t.name || t.title);
                          setMessage(toCampaignTokens(t.description || t.content || ""));
                          setSelectedNormalTemplateId(t._id || t.id);
                          setShowTemplateDropdown(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[14px] text-ink hover:bg-canvas",
                          (t._id || t.id) === selectedNormalTemplateId && "bg-brand-50 font-medium text-brand-900",
                        )}
                      >
                        {t.name || t.title}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => navigate("/templates/create")}
                      className="mt-1 flex w-full items-center gap-2 border-t border-line px-3.5 py-2.5 text-left text-[14px] font-medium text-brand-700 hover:bg-brand-50"
                    >
                      <Plus className="h-4 w-4" />
                      Save a new message
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="campaign-message" className="text-[13px] font-medium text-ink">
              Message
            </label>
            <span className="text-[13px] tabular-nums text-ink-muted">{message.length} characters</span>
          </div>
          <Textarea
            id="campaign-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your WhatsApp message…"
            rows={6}
            inputClassName="resize-none text-[14px]"
          />
          {missingColumns.length > 0 && (
            <div className="mt-2.5">
              <Note tone="warning" icon={AlertTriangle}>
                Your message has blanks your list can&apos;t fill:{" "}
                <strong className="font-semibold">{missingColumns.map((k) => `{{${k}}}`).join(", ")}</strong>.
                Add a column with that name to your list, or remove the blank from the message.
              </Note>
            </div>
          )}
          {sheet.columns.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[13px] text-ink-muted">Insert from your list:</span>
              {sheet.columns
                .filter((c) => c.role !== "phone")
                .map((col) => (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => setMessage((m) => `${m}${m && !m.endsWith(" ") ? " " : ""}${columnToken(col)}`)}
                    className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-0.5 text-[13px] font-medium text-brand-800 transition-colors hover:border-brand-300"
                  >
                    + {col.label}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Test send — catches typos/broken variables before broadcasting */}
      <div className="mt-5 rounded-xl border border-line bg-canvas p-4">
        <p className="text-[14px] font-medium text-ink">Send yourself a test first</p>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          Goes to this one number only, using the first contact&apos;s details. It doesn&apos;t count as a campaign.
        </p>
        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
          <input
            type="tel"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="Your WhatsApp number, e.g. 98765 43210"
            aria-label="Phone number for test message"
            className={`${controlCls} sm:max-w-[280px]`}
          />
          <Button
            variant="secondary"
            onClick={handleSendTest}
            disabled={testSending || !messageReady}
            leftIcon={Send}
            className="h-11"
          >
            {testSending ? "Sending…" : "Send test"}
          </Button>
        </div>
      </div>
    </FormSection>
  );

  /* ══ Step 3: when ══ */
  const whenStep = (
    <FormSection title="When should it go out?" description="Send it right away, or pick a date and time.">
      <div className="inline-flex flex-wrap rounded-xl border border-line bg-canvas p-1">
        <button
          type="button"
          onClick={() => setIsScheduled(false)}
          aria-pressed={!isScheduled}
          className={`flex h-9 items-center gap-1.5 rounded-lg px-4 text-[14px] font-medium transition-colors ${
            !isScheduled ? "bg-brand-900 text-white shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          <Send className="h-4 w-4" />
          Send right away
        </button>
        <button
          type="button"
          onClick={() => {
            if (!canSchedule) {
              toast.error("Scheduling is available on the Pro and Enterprise plans. Upgrade on the Billing page to unlock it.", { icon: "🔒" });
              return;
            }
            setIsScheduled(true);
          }}
          aria-pressed={isScheduled}
          className={`flex h-9 items-center gap-1.5 rounded-lg px-4 text-[14px] font-medium transition-colors ${
            isScheduled ? "bg-brand-900 text-white shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          {!canSchedule ? <Lock className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
          Schedule for later
        </button>
      </div>
      {!canSchedule && (
        <p className="mt-2 text-[13px] text-ink-muted">
          Scheduling is available on the Pro and Enterprise plans.{" "}
          <button type="button" onClick={() => navigate("/billing")} className="font-medium text-brand-700 underline">
            See plans
          </button>
        </p>
      )}

      {isScheduled && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Date"
              type="date"
              min={new Date().toISOString().split("T")[0]}
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
            <Input
              label="Time"
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
            />
          </div>
          <p className="mt-2 text-[13px] text-ink-muted">Times are in your time zone ({TIME_ZONE}).</p>
        </>
      )}
    </FormSection>
  );

  /* ══ Step 4: review ══ */
  const reviewStep = (
    <FormSection title="Check everything, then send" description="Nothing goes out until you confirm.">
      <Input
        label="Campaign name"
        value={campaignName}
        onChange={(e) => setCampaignName(e.target.value)}
        placeholder={defaultCampaignName}
        help="Only you see this. It helps you find the campaign later."
      />

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatTile label="Will receive it" value={readyCount.toLocaleString("en-IN")} tone="brand" />
        <StatTile
          label="Need attention"
          value={validation.counts.needsAttention}
          tone={validation.counts.needsAttention > 0 ? "danger" : "default"}
        />
        <StatTile label="In your list" value={validation.counts.total.toLocaleString("en-IN")} />
      </div>

      {validation.counts.needsAttention > 0 && (
        <div className="mt-3">
          <Note tone="warning" icon={AlertTriangle}>
            {plural(validation.counts.needsAttention, "contact")} {validation.counts.needsAttention === 1 ? "is" : "are"} missing
            a value your message needs.{" "}
            <button type="button" onClick={() => openEditor("attention")} className="font-semibold underline">
              Fix them
            </button>{" "}
            or{" "}
            <button type="button" onClick={() => skipProblemRows(validation)} className="font-semibold underline">
              leave them out
            </button>
            .
          </Note>
        </div>
      )}

      <div className="mt-5">
        <SummaryRow
          label="Message"
          value={useMetaTemplate ? `Template: ${selectedMetaTemplate?.name || "—"}` : "Plain message"}
        />
        {waNumbers.length > 1 && sendFromNumber && (
          <SummaryRow label="Send from" value={numberLabel(sendFromNumber)} />
        )}
        <SummaryRow label="When" value={whenText} valueClass={isScheduled ? "text-info" : "text-brand-700"} />
        <SummaryRow label="Approximate cost" value={costText} />
        <SummaryRow label="Opted-out contacts" value="Left out automatically" />
      </div>

      {campaignLimitReached && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-warning/20 bg-warning-soft px-4 py-3 text-[14px] text-warning">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">Monthly campaign limit reached</strong> ({getUsage("campaigns")}/{getLimit("campaigns")} this month).
            {" "}Upgrade to <strong className="font-semibold">{plan?.slug === "free" ? "Pro" : "Enterprise"}</strong> to send more.{" "}
            <button type="button" onClick={() => navigate("/billing")} className="font-semibold underline">
              See plans
            </button>
          </span>
        </div>
      )}
    </FormSection>
  );

  return (
    <DashboardLayout title="Create Campaign">
      <div className="w-full">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-ink sm:text-[30px]">Create campaign</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">
            Four short steps: choose who gets it, write the message, pick a time, then check and send.
          </p>
        </div>

        <WizardSteps current={step} isOpenable={isOpenable} onSelect={setStep} />

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_368px]">
          {/* ═══ LEFT: current step ═══ */}
          <div className="space-y-5">
            {step === 1 && audienceStep}
            {step === 2 && messageStep}
            {step === 3 && whenStep}
            {step === 4 && reviewStep}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              {step > 1 ? (
                <Button variant="secondary" leftIcon={ArrowLeft} onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                {currentBlocker && <span className="text-[13px] text-ink-muted sm:text-right">{currentBlocker}</span>}
                {step < 4 ? (
                  <Button rightIcon={ArrowRight} onClick={goNext}>
                    Continue
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    leftIcon={isScheduled ? CalendarClock : Send}
                    onClick={requestSend}
                    disabled={uploading || campaignLimitReached}
                  >
                    {isScheduled ? "Schedule campaign" : `Send to ${plural(readyCount, "person").replace("persons", "people")}`}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* ═══ RIGHT: sticky preview ═══ */}
          <div className="space-y-5 lg:sticky lg:top-6">
            <MessagePreview
              title={finalCampaignName}
              subtitle={sampleRow && usedVariableValues.some(Boolean) ? "What your first contact will receive." : "How your message will look on WhatsApp."}
              text={previewText}
              imageUrl={previewImage}
            />
            {hasAudience && (
              <Card>
                <h2 className="text-[15px] font-semibold text-ink">Your list</h2>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <StatTile label="Ready" value={audienceCheck.counts.ready} tone="brand" />
                  <StatTile
                    label="Need attention"
                    value={audienceCheck.counts.needsAttention}
                    tone={audienceCheck.counts.needsAttention > 0 ? "danger" : "default"}
                  />
                </div>
              </Card>
            )}
          </div>
        </div>

        {editorOpen && (
          <ContactSheetEditor
            open={editorOpen}
            onClose={() => setEditorOpen(false)}
            sheet={sheet}
            onChange={setSheet}
            validation={step === 4 ? validation : audienceCheck}
            initialFilter={editorFilter}
          />
        )}

        <Modal
          open={confirmOpen}
          onClose={() => !uploading && setConfirmOpen(false)}
          title={isScheduled ? "Schedule this campaign?" : "Send this campaign now?"}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={uploading}>
                Not yet
              </Button>
              <Button onClick={handleSubmit} loading={uploading} disabled={uploading} leftIcon={isScheduled ? CalendarClock : Send}>
                {uploading ? "Starting…" : isScheduled ? "Yes, schedule it" : "Yes, send now"}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-[14px] text-ink">
            <p>
              <strong className="font-semibold">{plural(readyCount, "person").replace("persons", "people")}</strong> will get
              {useMetaTemplate ? ` the “${selectedMetaTemplate?.name}” template` : " your message"}{" "}
              {isScheduled ? `on ${whenText}` : "right away"}.
            </p>
            <p className="text-ink-muted">Approximate cost: {costText}</p>
            <p className="text-ink-muted">
              {isScheduled
                ? "You can pause or cancel it from Campaign history any time before it starts."
                : "Messages start going out as soon as you confirm and can't be taken back."}
            </p>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
