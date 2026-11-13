import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Image as ImageIcon,
  Link2,
  Megaphone,
  MessageSquare,
  MessageSquareText,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import api from "../../services/api";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Badge, Button, Card, Input, Select, Textarea } from "../../components/ui";
import WhatsAppPreview from "../../components/templates/WhatsAppPreview";
import { resolveMediaUrl } from "../../utils/media";
import {
  LANGUAGES,
  META_CATEGORIES,
  META_CATEGORY_LABELS,
  QUICK_VARS,
  explainTemplateProblem,
  extractVariableTokens,
  fillExamples,
} from "../../constants/templates";
import { STARTER_TEMPLATES } from "../../constants/starterTemplates";

const HEADER_TYPES = [
  { value: "NONE", label: "None", icon: X },
  { value: "TEXT", label: "Text", icon: Type },
  { value: "IMAGE", label: "Image", icon: UploadCloud },
  { value: "VIDEO", label: "Video", icon: Video },
  { value: "DOCUMENT", label: "Document", icon: FileText },
];

const HEADER_MEDIA_ACCEPT = {
  IMAGE: "image/jpeg,image/png,image/webp",
  VIDEO: "video/mp4,video/3gpp",
  DOCUMENT: "application/pdf",
};

const MAX_BUTTONS = 10;

const BUTTON_TYPES = [
  { value: "QUICK_REPLY", label: "Quick Reply", icon: MessageSquare },
  { value: "URL", label: "URL", icon: Link2 },
  { value: "PHONE_NUMBER", label: "Phone", icon: Phone },
  { value: "COPY_CODE", label: "Copy Code", icon: Copy },
];

const emptyButton = () => ({ type: "QUICK_REPLY", text: "", url: "", urlExample: "", phoneNumber: "" });

// Mirrors templateService.js's validateButtons on the backend — same
// rules, checked client-side first so the error shows up immediately
// instead of after a round trip.
function validateButtonsClient(buttons, metaCategory) {
  if (buttons.length > MAX_BUTTONS) {
    return `A template can have at most ${MAX_BUTTONS} buttons.`;
  }

  let seenNonQuickReply = false;
  for (const button of buttons) {
    if (button.type === "QUICK_REPLY" && seenNonQuickReply) {
      return "Order matters: add all your Quick Reply buttons first, then any Website/Call buttons after.";
    }
    if (button.type !== "QUICK_REPLY") seenNonQuickReply = true;

    if (!button.text.trim()) return "Every button needs a label.";
    const maxLen = button.type === "COPY_CODE" ? 20 : 25;
    if (button.text.length > maxLen) {
      return `Button text "${button.text}" exceeds Meta's ${maxLen}-character limit.`;
    }
    if (button.type === "URL") {
      if (!button.url.trim()) return "Every URL button needs a URL.";
      if (/\{\{1\}\}/.test(button.url) && !button.urlExample.trim()) {
        return "Provide an example URL for the dynamic {{1}} in your URL button.";
      }
    }
    if (button.type === "PHONE_NUMBER" && !button.phoneNumber.trim()) {
      return "Every Phone button needs a phone number.";
    }
    if (button.type === "COPY_CODE" && metaCategory !== "AUTHENTICATION") {
      return "Copy Code buttons are only meaningful on Authentication templates.";
    }
  }
  return null;
}

// WhatsApp's own wording rules for the message body, checked before
// submitting so the user doesn't wait hours for a rejection.
function validateBodyClient(body) {
  const text = body.trim();
  if (text.length > 1024) return `The message is ${text.length} characters long. WhatsApp allows up to 1024.`;
  // A blank's name can only use letters, numbers and underscores. Anything
  // else, like {{Brand Name}}, isn't recognised as a blank and WhatsApp
  // rejects the template for mismatched braces.
  const badBlank = [...text.matchAll(/\{\{([^{}]*)\}\}/g)].find((m) => !/^\w+$/.test(m[1]));
  if (badBlank) {
    return `"${badBlank[0]}" isn't a valid blank. Blank names can't have spaces or symbols. Use letters, numbers and underscores, for example {{company}} or {{brand_name}}.`;
  }
  // A single brace like {Brand Name} is a typo for a double-brace blank.
  const strayBrace = /[{}]/.exec(text.replace(/\{\{\w+\}\}/g, ""));
  if (strayBrace) {
    return "There's a single curly brace { or } in your message. Blanks need double braces on both sides, like {{company}}. Fix it, or remove the brace.";
  }
  if (/^\{\{\w+\}\}/.test(text)) return "The message can't start with a blank like {{name}}. Add a word before it, for example \"Hi {{name}}\".";
  if (/\{\{\w+\}\}[.!?]?$/.test(text)) return "The message can't end with a blank like {{name}}. Add a few words after it.";
  if (/\{\{\w+\}\}\s*\{\{\w+\}\}/.test(text)) return "Two blanks can't be right next to each other. Put at least one word between them.";
  return null;
}

const snapshotOf = (fields) => JSON.stringify(fields);

const CATEGORY_INFO = {
  MARKETING: {
    icon: Megaphone,
    description: "For sales, offers, and announcements you send proactively — like a festival discount or new product launch. Customers must be able to opt out.",
  },
  UTILITY: {
    icon: MessageSquareText,
    description: "For updates tied to something the customer already did — an order confirmation, appointment reminder, or delivery update.",
  },
  AUTHENTICATION: {
    icon: ShieldCheck,
    description: "For one-time login codes (OTPs). Meta requires a strict, fixed format for these — this page only lets you customize the basic text, so keep it to something like \"Your code is {{1}}\".",
  },
};

const controlCls =
  "h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-ink-subtle focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/12";

const WIZARD_STEPS = [
  "What's this for?",
  "Draft your message",
  "Anything else?",
  "Review & submit",
];

export default function CreateApprovedTemplatePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const descRef = useRef(null);
  const headerFileInputRef = useRef(null);

  const [step, setStep] = useState(0);

  const [metaCategory, setMetaCategory] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en_US");
  const [description, setDescription] = useState("");
  const [bodyVariableExamples, setBodyVariableExamples] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [goal, setGoal] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState("");

  const [headerType, setHeaderType] = useState("NONE");
  const [headerText, setHeaderText] = useState("");
  const [headerTextExample, setHeaderTextExample] = useState("");
  const [headerMedia, setHeaderMedia] = useState(null);
  const [existingHeaderMediaUrl, setExistingHeaderMediaUrl] = useState("");
  const [headerDragActive, setHeaderDragActive] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

  const [buttons, setButtons] = useState([]);

  // The saved record's id: set after the first save so a failed submit that
  // is retried updates the same template instead of creating a copy.
  const [savedId, setSavedId] = useState(id || "");
  // What WhatsApp said about the loaded template (shown as a banner).
  const [loadedStatus, setLoadedStatus] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirm, setConfirm] = useState(null); // "ai" | "leave" | "resubmit"

  useEffect(() => {
    if (!id) return;
    async function fetchTemplate() {
      try {
        const res = await api.get(`/api/templates/${id}`);
        const t = res.data.template;
        if (t) {
          setName(t.name || "");
          if (t.metaCategory) {
            setMetaCategory(t.metaCategory);
          } else if (t.category) {
            const catEntry = Object.entries(META_CATEGORY_LABELS).find(
              ([, label]) => label.toLowerCase() === t.category.toLowerCase()
            );
            if (catEntry) setMetaCategory(catEntry[0]);
          }
          setLanguage(t.language || "en_US");
          setDescription(t.description || "");
          setLoadedStatus({ metaStatus: t.metaStatus, rejectionReason: t.rejectionReason });
          setSavedSnapshot(snapshotOf({
            metaCategory: t.metaCategory || Object.entries(META_CATEGORY_LABELS).find(
              ([, label]) => label.toLowerCase() === (t.category || "").toLowerCase(),
            )?.[0] || "",
            name: t.name || "",
            language: t.language || "en_US",
            description: t.description || "",
            bodyVariableExamples: t.bodyVariableExamples || [],
            headerType: t.headerType || "NONE",
            headerText: t.headerText || "",
            headerTextExample: t.headerTextExample || "",
            buttons: t.buttons || [],
            media: false,
          }));
          setBodyVariableExamples(t.bodyVariableExamples || []);
          setHeaderType(t.headerType || "NONE");
          setHeaderText(t.headerText || "");
          setHeaderTextExample(t.headerTextExample || "");
          setButtons(t.buttons || []);
          const initialMediaUrl = t.headerMediaUrl || t.mediaUrl || (/^https?:\/\//i.test(t.headerHandle) ? t.headerHandle : "");
          setExistingHeaderMediaUrl(initialMediaUrl);
        }
      } catch (err) {
        console.error("Failed to load template", err);
        setError("Could not load template details — try refreshing.");
      }
    }
    fetchTemplate();
  }, [id]);

  function addButton() {
    if (buttons.length >= MAX_BUTTONS) return;
    setButtons((prev) => [...prev, emptyButton()]);
  }

  function updateButton(index, patch) {
    setButtons((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function removeButton(index) {
    setButtons((prev) => prev.filter((_, i) => i !== index));
  }

  // "Unsaved changes?" check: compare the form with what was last loaded/saved.
  const formSnapshot = snapshotOf({
    metaCategory, name, language, description, bodyVariableExamples,
    headerType, headerText, headerTextExample, buttons, media: Boolean(headerMedia),
  });
  const [savedSnapshot, setSavedSnapshot] = useState(formSnapshot);
  const dirty = formSnapshot !== savedSnapshot;

  const variableTokens = extractVariableTokens(description);
  const variableCount = variableTokens.length;
  const isMediaHeader = ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType);
  const headerHasVariable = /\{\{1\}\}/.test(headerText);
  const hasAdvancedOptions = headerType !== "NONE" || buttons.length > 0;

  function handleHeaderFileChange(e) {
    const f = e.target.files?.[0];
    if (f) setHeaderMedia(f);
  }

  function handleHeaderDragOver(e) { e.preventDefault(); e.stopPropagation(); setHeaderDragActive(true); }
  function handleHeaderDragLeave(e) { e.preventDefault(); e.stopPropagation(); setHeaderDragActive(false); }
  function handleHeaderDrop(e) {
    e.preventDefault(); e.stopPropagation(); setHeaderDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setHeaderMedia(f);
  }

  function insertVariable(v) {
    const ta = descRef.current;
    if (!ta) {
      setDescription((prev) => prev + v);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = description.slice(0, start) + v + description.slice(end);
    setDescription(newVal);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + v.length, start + v.length);
    }, 0);
  }

  function handleExampleChange(index, value) {
    setBodyVariableExamples((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function requestDraftWithAI() {
    setDraftError("");
    if (!metaCategory) return setDraftError("Choose a category first.");
    if (!goal.trim()) return setDraftError("Tell us what this message is for.");
    if (description.trim()) return setConfirm("ai");
    handleDraftWithAI();
  }

  async function handleDraftWithAI() {
    setConfirm(null);

    try {
      setDraftLoading(true);
      const res = await api.post("/api/templates/draft", { goal, category: metaCategory });
      setDescription(res.data.draft.body);
    } catch (err) {
      setDraftError(
        err?.response?.data?.message || "Couldn't generate a draft — try again or write it yourself.",
      );
    } finally {
      setDraftLoading(false);
    }
  }

  function applyStarter(starter) {
    setMetaCategory(starter.category);
    setName(starter.name);
    setDescription(starter.body);
    setBodyVariableExamples(starter.examples);
    setError("");
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goNext() {
    setError("");

    if (step === 0) {
      if (!metaCategory) return setError("Choose a category to continue.");
      if (!name.trim()) return setError("Template name is required.");
    }

    if (step === 1) {
      if (!description.trim()) return setError("Write the message first.");
      const bodyError = validateBodyClient(description);
      if (bodyError) return setError(bodyError);
      if (variableCount > 0 && bodyVariableExamples.slice(0, variableCount).some((v) => !v?.trim())) {
        return setError("Give an example for every blank. WhatsApp needs these to review the template.");
      }
    }

    if (step === 2) {
      if (headerType === "TEXT") {
        if (!headerText.trim()) return setError("Header text is required, or set Header back to None.");
        if (headerHasVariable && !headerTextExample.trim()) {
          return setError("Provide an example value for the header's {{1}} placeholder.");
        }
      }
      if (isMediaHeader && !headerMedia && !existingHeaderMediaUrl) {
        return setError(`Upload a ${headerType.toLowerCase()} for the header, or set Header back to None.`);
      }
      const buttonsError = validateButtonsClient(buttons, metaCategory);
      if (buttonsError) return setError(buttonsError);
    }

    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  }

  function goBack() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  // Same fields for "Save draft" and "Submit"; status is the only difference.
  function buildTemplateData(status) {
    const data = new FormData();
    data.append("name", name);
    data.append("category", META_CATEGORY_LABELS[metaCategory] || "Marketing");
    data.append("description", description);
    data.append("status", status);
    data.append("metaCategory", metaCategory || "");
    data.append("language", language);
    data.append("bodyVariableExamples", JSON.stringify(bodyVariableExamples.slice(0, variableCount)));
    data.append("headerType", headerType);
    if (headerType === "TEXT") {
      data.append("headerText", headerText);
      data.append("headerTextExample", headerTextExample);
    }
    if (isMediaHeader && headerMedia) {
      data.append("headerMedia", headerMedia);
    }
    data.append("buttons", JSON.stringify(buttons));
    return data;
  }

  async function saveRecord(status) {
    const data = buildTemplateData(status);
    if (savedId) {
      await api.put(`/api/templates/${savedId}`, data);
      return savedId;
    }
    const createRes = await api.post("/api/templates", data);
    const newId = createRes.data.template._id;
    setSavedId(newId);
    return newId;
  }

  async function handleSaveDraft() {
    setError("");
    if (!metaCategory) return setError("Choose what kind of message this is before saving.");
    if (!name.trim()) return setError("Give the template a name before saving.");
    try {
      setSavingDraft(true);
      await saveRecord("draft");
      setSavedSnapshot(formSnapshot);
      toast.success("Draft saved. You can finish it any time from Templates.");
      navigate("/templates?tab=drafts");
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't save the draft. Please try again.");
    } finally {
      setSavingDraft(false);
    }
  }

  function requestSubmit() {
    if (loadedStatus?.metaStatus === "APPROVED") return setConfirm("resubmit");
    handleSubmit();
  }

  function leavePage() {
    if (dirty) return setConfirm("leave");
    navigate("/templates");
  }

  async function handleSubmit() {
    setConfirm(null);
    setError("");

    // Defensive re-check of every step's requirements — same rules as
    // goNext, just re-run in full since this is the actual point of no
    // return (identical validation to the original single-page form).
    if (!metaCategory) return setError("Choose a category to continue.");
    if (!name.trim()) return setError("Template name is required.");
    if (!description.trim()) return setError("Write the message first.");
    const bodyError = validateBodyClient(description);
    if (bodyError) return setError(bodyError);
    if (variableCount > 0 && bodyVariableExamples.slice(0, variableCount).some((v) => !v?.trim())) {
      return setError("Give an example for every blank. WhatsApp needs these to review the template.");
    }
    if (headerType === "TEXT") {
      if (!headerText.trim()) return setError("Header text is required, or set Header back to None.");
      if (headerHasVariable && !headerTextExample.trim()) {
        return setError("Provide an example value for the header's {{1}} placeholder.");
      }
    }
    if (isMediaHeader && !headerMedia && !existingHeaderMediaUrl) {
      return setError(`Upload a ${headerType.toLowerCase()} for the header, or set Header back to None.`);
    }
    const buttonsError = validateButtonsClient(buttons, metaCategory);
    if (buttonsError) return setError(buttonsError);

    try {
      setSubmitting(true);

      const templateId = await saveRecord("pending");

      // metaTemplateName is deliberately never collected from the user —
      // the backend auto-generates and de-conflicts it from `name` (see
      // templateController.js's generateUniqueMetaTemplateName).
      const submitRes = await api.post(`/api/templates/${templateId}/submit`, {
        metaCategory,
        language,
        bodyVariableExamples: bodyVariableExamples.slice(0, variableCount),
      });

      setSavedSnapshot(formSnapshot);
      const submitted = submitRes.data.template;
      if (submitted.metaStatus === "REJECTED") {
        // Rejected straight away: stay here so the user can fix it.
        setLoadedStatus({ metaStatus: submitted.metaStatus, rejectionReason: submitted.rejectionReason });
        if (!id) navigate(`/templates/approved/edit/${templateId}`, { replace: true });
        setStep(1);
        toast.error("WhatsApp didn't accept this template. See the reason at the top of the page.");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      toast.success(
        submitted.metaStatus === "APPROVED"
          ? "Approved! You can use this template in campaigns now."
          : "Sent to WhatsApp. Approval usually takes a few minutes to a few hours — the status updates by itself.",
        { duration: 7000 },
      );
      navigate(submitted.metaStatus === "APPROVED" ? "/templates?tab=ready" : "/templates?tab=waiting");
    } catch (err) {
      const reason = err?.response?.data?.message;
      setError(
        reason
          ? `WhatsApp couldn't accept the template: ${reason}`
          : "Couldn't send the template to WhatsApp. Check your internet connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout title={id ? "Edit template" : "New template"}>
      <div className="w-full">
        <div className="mb-8">
          <button
            type="button"
            onClick={leavePage}
            className="mb-3 inline-flex items-center gap-1 text-[14px] font-medium text-ink-muted hover:text-brand-700"
          >
            <ChevronLeft size={16} />
            Templates
          </button>
          <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-ink sm:text-[30px]">
            {id ? "Edit template" : "New template"}
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">
            WhatsApp checks every template before it can be sent to customers. Approval usually takes a few
            minutes to a few hours.
          </p>
        </div>

        {loadedStatus && ["REJECTED", "PAUSED", "DISABLED"].includes(loadedStatus.metaStatus) && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3.5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div className="text-[14px]">
              <p className="font-semibold text-danger">WhatsApp didn&apos;t approve this template</p>
              <p className="mt-1 text-ink">{explainTemplateProblem(loadedStatus)}</p>
              <p className="mt-1 text-ink-muted">Make your changes below, then send it again.</p>
            </div>
          </div>
        )}

        {loadedStatus?.metaStatus === "APPROVED" && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/20 bg-warning-soft px-4 py-3.5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p className="text-[14px] text-ink">
              <strong className="font-semibold">This template is approved and ready to send.</strong> If you change it,
              WhatsApp has to check it again, and you can&apos;t use it in campaigns until it&apos;s approved. To keep using
              it as it is, leave this page without saving.
            </p>
          </div>
        )}

        {/* Wizard progress */}
        <Card padded={false} className="mb-5 px-5 py-4">
          <ol className="flex items-center gap-2">
            {WIZARD_STEPS.map((label, index) => (
              <li key={label} className="flex flex-1 items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold transition-colors ${
                    index === step
                      ? "bg-brand-900 text-white"
                      : index < step
                        ? "bg-brand-100 text-brand-800"
                        : "bg-canvas text-ink-muted ring-1 ring-line"
                  }`}
                  aria-current={index === step ? "step" : undefined}
                >
                  {index < step ? <CheckCircle className="h-4 w-4" /> : index + 1}
                </span>
                <span
                  className={`hidden truncate text-[14px] font-medium md:block ${
                    index === step ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  {label}
                </span>
                {index < WIZARD_STEPS.length - 1 && (
                  <span className={`h-px flex-1 ${index < step ? "bg-brand-300" : "bg-line"}`} />
                )}
              </li>
            ))}
          </ol>
        </Card>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* ═══ LEFT: current step ═══ */}
          <div className="space-y-5">
            {/* Step 0: What's this for? */}
            {step === 0 && !id && !savedId && (
              <FormSection
                title="Start from a ready-made template"
                description="Written to pass WhatsApp's review. Pick one and change the wording to suit your business."
              >
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {STARTER_TEMPLATES.map((starter) => (
                    <button
                      key={starter.id}
                      type="button"
                      onClick={() => applyStarter(starter)}
                      className="rounded-xl border border-line bg-surface p-3.5 text-left transition-colors hover:border-brand-600 hover:bg-brand-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[14px] font-semibold text-ink">{starter.title}</span>
                        <Badge tone="neutral">{META_CATEGORY_LABELS[starter.category]}</Badge>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">
                        {fillExamples(starter.body, starter.examples)}
                      </p>
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-[14px] text-ink-muted">Or start from scratch below.</p>
              </FormSection>
            )}

            {step === 0 && (
              <FormSection title="What kind of message is this?" description="WhatsApp reviews and prices each kind differently. Picking the wrong one is the most common reason for rejection.">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {META_CATEGORIES.filter((cat) => cat !== "AUTHENTICATION" || metaCategory === "AUTHENTICATION").map((cat) => {
                    const Icon = CATEGORY_INFO[cat].icon;
                    const active = metaCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setMetaCategory(cat)}
                        aria-pressed={active}
                        className={`flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left transition-colors ${
                          active
                            ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                            : "border-line bg-surface hover:border-line-strong hover:bg-canvas"
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                            active ? "bg-brand-100 text-brand-800" : "bg-canvas text-ink-muted"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-[15px] font-semibold text-ink">{META_CATEGORY_LABELS[cat]}</span>
                        <span className="text-[13px] leading-relaxed text-ink-muted">
                          {CATEGORY_INFO[cat].description}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {metaCategory === "AUTHENTICATION" && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-warning-soft px-4 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p className="text-[14px] leading-relaxed text-warning">
                      Login-code templates follow a strict format set by Meta (the code plus its
                      expiry). This page only handles the basic text — Meta may ask you to adjust
                      anything beyond a simple code message.
                    </p>
                  </div>
                )}

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Template name"
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Order shipped notice"
                    help="Only you see this name."
                  />
                  <Select
                    label="Language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    inputClassName="cursor-pointer"
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.label}</option>
                    ))}
                  </Select>
                </div>
              </FormSection>
            )}

            {/* Step 1: Draft your message */}
            {step === 1 && (
              <FormSection
                title="Message"
                description="Write what your customers will receive, or let AI draft it for you."
                aside={
                  <span className="shrink-0 text-[13px] tabular-nums text-ink-muted">
                    {description.length} / 1024
                  </span>
                }
              >
                <div className="rounded-xl bg-canvas p-4">
                  <label htmlFor="ai-goal" className="block text-[13px] font-medium text-ink">
                    What do you want to tell your customers?
                  </label>
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                    <input
                      id="ai-goal"
                      type="text"
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="e.g. tell customers their order has shipped"
                      className={controlCls}
                    />
                    <Button
                      variant="secondary"
                      onClick={requestDraftWithAI}
                      disabled={draftLoading}
                      loading={draftLoading}
                      leftIcon={Sparkles}
                      className="h-11"
                    >
                      {draftLoading ? "Drafting…" : "Draft with AI"}
                    </Button>
                  </div>
                  {draftError ? (
                    <p className="mt-1.5 text-[13px] text-danger">{draftError}</p>
                  ) : (
                    <p className="mt-1.5 text-[13px] text-ink-muted">
                      Optional — or just write the message yourself below.
                    </p>
                  )}
                </div>

                <div className="mt-5">
                  <VariableChips onInsert={insertVariable} />
                  <Textarea
                    ref={descRef}
                    label="Message text"
                    required
                    rows={7}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Write your message… use the variable buttons above to personalise it"
                    inputClassName="resize-none text-[15px]"
                    help="Blanks like {{name}} are filled in for each person. When you send a campaign, you pick which column of your contact list fills each blank."
                  />
                </div>

                {variableCount > 0 && (
                  <div className="mt-5 rounded-xl bg-canvas p-4">
                    <p className="text-[13px] font-medium text-ink">
                      An example for each blank
                    </p>
                    <p className="mt-0.5 text-[13px] text-ink-muted">
                      WhatsApp&apos;s reviewers see these, and the preview uses them. Customers get their own values.
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {variableTokens.map((token, i) => (
                        <input
                          key={token}
                          type="text"
                          value={bodyVariableExamples[i] || ""}
                          onChange={(e) => handleExampleChange(i, e.target.value)}
                          placeholder={`Example for {{${token}}}, e.g. ${token === "name" ? "Ravi" : "…"}`}
                          aria-label={`Example for {{${token}}}`}
                          className={controlCls}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </FormSection>
            )}

            {/* Step 2: Anything else? (header + buttons, collapsed by default) */}
            {step === 2 && (
              !moreOptionsOpen && !hasAdvancedOptions ? (
                <FormSection title="Header and buttons" description="Most templates are just a message — you can skip this.">
                  <Button variant="secondary" leftIcon={ChevronDown} onClick={() => setMoreOptionsOpen(true)}>
                    Add a header or buttons (optional)
                  </Button>
                </FormSection>
              ) : (
                <>
                  {!hasAdvancedOptions && (
                    <Button variant="ghost" leftIcon={ChevronLeft} onClick={() => setMoreOptionsOpen(false)}>
                      Skip — I don't need this
                    </Button>
                  )}

                  {/* Header / media */}
                  <FormSection title="Header" description="Optional. A title, image, video or document shown above the message.">
                    <div className="mb-4 flex flex-wrap gap-2">
                      {HEADER_TYPES.map(({ value, label, icon: Icon }) => {
                        const active = headerType === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => { setHeaderType(value); setHeaderMedia(null); }}
                            aria-pressed={active}
                            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-[14px] font-medium transition-colors ${
                              active
                                ? "border-brand-600 bg-brand-50 text-brand-800"
                                : "border-line-strong bg-surface text-ink-muted hover:bg-canvas hover:text-ink"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {headerType === "TEXT" && (
                      <div className="space-y-4">
                        <div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <label htmlFor="header-text" className="text-[13px] font-medium text-ink">
                              Header text <span className="text-danger">*</span>
                            </label>
                            <span className="text-[13px] tabular-nums text-ink-muted">
                              {headerText.length} / 60
                            </span>
                          </div>
                          <input
                            id="header-text"
                            type="text"
                            value={headerText}
                            onChange={(e) => setHeaderText(e.target.value)}
                            placeholder="e.g. Your order {{1}} has shipped"
                            className={controlCls}
                          />
                          <p className="mt-1.5 text-[13px] text-ink-muted">
                            You can add one fill-in-the-blank spot in your header — type{" "}
                            <code className="rounded bg-canvas px-1 py-0.5 font-mono text-ink">{"{{1}}"}</code>{" "}
                            where you want it (e.g. "Your order {"{{1}}"} has shipped").
                          </p>
                        </div>
                        {headerHasVariable && (
                          <Input
                            label="Sample value to show Meta reviewers"
                            type="text"
                            value={headerTextExample}
                            onChange={(e) => setHeaderTextExample(e.target.value)}
                            placeholder="e.g. #48213"
                          />
                        )}
                      </div>
                    )}

                    {isMediaHeader && (
                      !headerMedia && !existingHeaderMediaUrl ? (
                        <div
                          onDragOver={handleHeaderDragOver}
                          onDragLeave={handleHeaderDragLeave}
                          onDrop={handleHeaderDrop}
                          onClick={() => headerFileInputRef.current?.click()}
                          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-9 text-center transition-colors ${
                            headerDragActive
                              ? "border-brand-600 bg-brand-50"
                              : "border-line-strong bg-canvas hover:border-ink-subtle"
                          }`}
                        >
                          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-[var(--shadow-card)]">
                            <UploadCloud className={`h-5 w-5 ${headerDragActive ? "text-brand-600" : "text-ink-muted"}`} />
                          </span>
                          <div>
                            <p className="text-[14px] font-medium text-ink">
                              {headerDragActive ? "Drop file here" : `Drag and drop a ${headerType.toLowerCase()}`}
                            </p>
                            <p className="text-[13px] text-ink-muted">
                              or <span className="font-semibold text-brand-700">browse</span> —{" "}
                              {headerType === "IMAGE" && "JPG, PNG, WEBP, up to 5MB"}
                              {headerType === "VIDEO" && "MP4, 3GP, up to 16MB"}
                              {headerType === "DOCUMENT" && "PDF, up to 100MB"}
                            </p>
                          </div>
                          <input
                            ref={headerFileInputRef}
                            type="file"
                            accept={HEADER_MEDIA_ACCEPT[headerType]}
                            onChange={handleHeaderFileChange}
                            className="hidden"
                          />
                        </div>
                      ) : headerMedia ? (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            {headerType === "IMAGE" ? (
                              <img
                                src={URL.createObjectURL(headerMedia)}
                                alt="Header preview"
                                className="h-12 w-12 rounded-lg border border-brand-100 object-cover"
                              />
                            ) : (
                              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-700">
                                <FileText className="h-5 w-5" />
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-medium text-ink">{headerMedia.name}</p>
                              <p className="text-[13px] text-ink-muted">{(headerMedia.size / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-brand-600" />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => { setHeaderMedia(null); if (headerFileInputRef.current) headerFileInputRef.current.value = ""; }}
                              aria-label="Remove file"
                            >
                              <X size={16} />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
                              <img
                                src={resolveMediaUrl(existingHeaderMediaUrl)}
                                alt="Current header"
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  if (e.currentTarget.nextElementSibling) {
                                    e.currentTarget.nextElementSibling.classList.remove("hidden");
                                  }
                                }}
                              />
                              <div className="hidden flex h-full w-full items-center justify-center bg-brand-50 text-brand-700">
                                <ImageIcon className="h-5 w-5" />
                              </div>
                            </div>
                            <div className="min-w-0">
                              <Badge tone="brand">Current header media</Badge>
                              <p className="mt-1 truncate text-[14px] font-medium text-ink">
                                {existingHeaderMediaUrl.split("?")[0].split("/").pop().split("\\").pop() || "Template Header Image"}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button variant="secondary" size="sm" onClick={() => headerFileInputRef.current?.click()}>
                              Replace
                            </Button>
                            <Button
                              variant="danger-ghost"
                              size="icon-sm"
                              onClick={() => {
                                setExistingHeaderMediaUrl("");
                                setHeaderMedia(null);
                                if (headerFileInputRef.current) headerFileInputRef.current.value = "";
                              }}
                              aria-label="Remove header media"
                            >
                              <X size={16} />
                            </Button>
                          </div>
                          <input
                            ref={headerFileInputRef}
                            type="file"
                            accept={HEADER_MEDIA_ACCEPT[headerType]}
                            onChange={handleHeaderFileChange}
                            className="hidden"
                          />
                        </div>
                      )
                    )}

                    {headerType === "NONE" && (
                      <p className="text-[14px] text-ink-muted">
                        No header — the template will only have body text.
                      </p>
                    )}
                  </FormSection>

                  {/* Buttons */}
                  <FormSection
                    title="Buttons"
                    description="Optional. Quick replies, links or a call button shown under the message."
                    aside={
                      <span className="shrink-0 text-[13px] tabular-nums text-ink-muted">
                        {buttons.length} / {MAX_BUTTONS}
                      </span>
                    }
                  >
                    {buttons.length === 0 ? (
                      <p className="mb-4 text-[14px] text-ink-muted">
                        No buttons — quick replies, links, or a call button appear under the message.
                      </p>
                    ) : (
                      <div className="mb-4 space-y-3">
                        {buttons.map((button, index) => {
                          const hasUrlVariable = button.type === "URL" && /\{\{1\}\}/.test(button.url);
                          const maxLen = button.type === "COPY_CODE" ? 20 : 25;
                          return (
                            <div key={index} className="rounded-xl border border-line bg-canvas p-4">
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <div className="relative">
                                  <select
                                    value={button.type}
                                    onChange={(e) => updateButton(index, { type: e.target.value })}
                                    aria-label="Button type"
                                    className="h-9 cursor-pointer appearance-none rounded-lg border border-line-strong bg-surface pl-3 pr-9 text-[14px] text-ink outline-none transition focus:border-brand-600 focus:ring-4 focus:ring-brand-600/12"
                                  >
                                    {BUTTON_TYPES.filter(
                                      (t) => t.value !== "COPY_CODE" || metaCategory === "AUTHENTICATION",
                                    ).map((t) => (
                                      <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                  </select>
                                  <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                                </div>
                                <Button
                                  variant="danger-ghost"
                                  size="icon-sm"
                                  onClick={() => removeButton(index)}
                                  aria-label="Remove button"
                                >
                                  <Trash2 size={16} />
                                </Button>
                              </div>

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                  <div className="mb-1.5 flex items-center justify-between">
                                    <label htmlFor={`button-label-${index}`} className="text-[13px] font-medium text-ink">
                                      Label
                                    </label>
                                    <span className="text-[12px] tabular-nums text-ink-muted">
                                      {button.text.length} / {maxLen}
                                    </span>
                                  </div>
                                  <input
                                    id={`button-label-${index}`}
                                    type="text"
                                    value={button.text}
                                    onChange={(e) => updateButton(index, { text: e.target.value })}
                                    placeholder="e.g. Track order"
                                    className={controlCls}
                                  />
                                </div>

                                {button.type === "URL" && (
                                  <Input
                                    label="URL"
                                    type="text"
                                    value={button.url}
                                    onChange={(e) => updateButton(index, { url: e.target.value })}
                                    placeholder="https://example.com/track/{{1}}"
                                    inputClassName="font-mono"
                                  />
                                )}

                                {button.type === "PHONE_NUMBER" && (
                                  <Input
                                    label="Phone number"
                                    type="text"
                                    value={button.phoneNumber}
                                    onChange={(e) => updateButton(index, { phoneNumber: e.target.value })}
                                    placeholder="+15551234567"
                                  />
                                )}
                              </div>

                              {hasUrlVariable && (
                                <Input
                                  label="Sample link to show Meta reviewers"
                                  type="text"
                                  value={button.urlExample}
                                  onChange={(e) => updateButton(index, { urlExample: e.target.value })}
                                  placeholder="https://example.com/track/48213"
                                  inputClassName="font-mono"
                                  className="mt-3"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <Button
                      variant="secondary"
                      leftIcon={Plus}
                      onClick={addButton}
                      disabled={buttons.length >= MAX_BUTTONS}
                    >
                      Add button
                    </Button>

                    <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
                      Order matters: add all your Quick Reply buttons first, then any Website/Call
                      buttons after.
                    </p>
                  </FormSection>
                </>
              )
            )}

            {/* Step 3: Review & submit */}
            {step === 3 && (
              <FormSection title="Review and submit" description="Check the preview, then send it to WhatsApp for review.">
                <dl className="divide-y divide-line rounded-xl border border-line">
                  <SummaryRow label="Template name" value={name || "—"} />
                  <SummaryRow label="Category" value={META_CATEGORY_LABELS[metaCategory] || "No category"} />
                  <SummaryRow
                    label="Language"
                    value={LANGUAGES.find((l) => l.code === language)?.label || language}
                  />
                  {headerType !== "NONE" && (
                    <SummaryRow
                      label="Header"
                      value={headerType === "TEXT" ? "Text header" : `${headerType.toLowerCase()} header`}
                    />
                  )}
                  {buttons.length > 0 && (
                    <SummaryRow
                      label="Buttons"
                      value={`${buttons.length} button${buttons.length === 1 ? "" : "s"}`}
                    />
                  )}
                </dl>
                <p className="mt-4 text-[14px] text-ink-muted">
                  Ready? WhatsApp usually replies within a few minutes to a few hours, and the status on the
                  Templates page updates by itself. If it isn&apos;t approved, you&apos;ll see why and can fix it.
                </p>
              </FormSection>
            )}

            {error && (
              <div className="rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              {step > 0 && (
                <Button variant="secondary" size="lg" leftIcon={ChevronLeft} onClick={goBack}>
                  Back
                </Button>
              )}

              {step < WIZARD_STEPS.length - 1 ? (
                <Button size="lg" rightIcon={ChevronRight} onClick={goNext}>
                  Next
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={requestSubmit}
                  disabled={submitting || savingDraft}
                  loading={submitting}
                  leftIcon={ShieldCheck}
                >
                  {submitting ? "Sending to WhatsApp…" : "Send to WhatsApp for approval"}
                </Button>
              )}

              {/* A template WhatsApp approved (or is reviewing) can't be saved
                  half-changed: campaigns would keep sending the old approved
                  wording while this page shows the new one. */}
              {!["APPROVED", "PENDING"].includes(loadedStatus?.metaStatus) && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={handleSaveDraft}
                  disabled={submitting || savingDraft}
                  loading={savingDraft}
                >
                  Save draft
                </Button>
              )}

              <Button variant="ghost" size="lg" onClick={leavePage}>
                Cancel
              </Button>
            </div>
          </div>

          {/* ═══ RIGHT: live preview ═══ */}
          <div className="lg:sticky lg:top-6">
            <Card>
              <h2 className="text-[17px] font-semibold text-ink">Preview</h2>
              <p className="mb-5 mt-1 text-[14px] text-ink-muted">How customers will see your message.</p>
              <WhatsAppPreview
                name={name}
                headerType={headerType}
                headerText={headerText}
                headerMediaFile={isMediaHeader ? headerMedia : null}
                headerMediaUrl={isMediaHeader ? existingHeaderMediaUrl : ""}
                body={fillExamples(description, bodyVariableExamples)}
                buttons={buttons}
                size={step === 3 ? "large" : "default"}
              />
            </Card>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "ai"}
        title="Replace your message?"
        confirmLabel="Replace with AI draft"
        onConfirm={handleDraftWithAI}
        onCancel={() => setConfirm(null)}
      >
        <p>The AI draft will replace the message you&apos;ve already written.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "leave"}
        title="Leave without saving?"
        confirmLabel="Leave without saving"
        cancelLabel="Keep editing"
        danger
        onConfirm={() => navigate("/templates")}
        onCancel={() => setConfirm(null)}
      >
        <p>Your changes will be lost. Use &ldquo;Save draft&rdquo; to keep them and finish later.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "resubmit"}
        title="Send the changed template for approval?"
        confirmLabel="Yes, send for approval"
        onConfirm={handleSubmit}
        onCancel={() => setConfirm(null)}
      >
        <p>
          WhatsApp will check the template again. Until it&apos;s approved, you can&apos;t use it in new campaigns.
        </p>
      </ConfirmDialog>
    </DashboardLayout>
  );
}

/* ── Small building blocks ─────────────────────────────────────────── */

function FormSection({ title, description, aside, children }) {
  return (
    <Card>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-1 text-[14px] text-ink-muted">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}

function VariableChips({ onInsert }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[13px] text-ink-muted">Insert a variable:</span>
      {QUICK_VARS.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(v)}
          className="h-8 rounded-lg border border-line bg-canvas px-2.5 font-mono text-[13px] text-ink transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-[14px] text-ink-muted">{label}</dt>
      <dd className="truncate text-right text-[14px] font-medium text-ink">{value}</dd>
    </div>
  );
}
