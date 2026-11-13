// Single source of truth for template-related config, shared by the
// Templates, Approved Templates, and Campaign pages so category lists,
// status badges, and language options never drift out of sync.

export const DEFAULT_CATEGORIES = ["Marketing", "Followup", "Broadcast", "Support"];

// Merges the fixed defaults with whatever custom categories a user has
// created (via /api/template-categories) — the one shared place this list
// gets assembled, so every page that shows category options (template
// create/edit, campaign create, campaign history filter) stays in sync.
export function mergeCategories(categoryDocs = []) {
  return [
    ...DEFAULT_CATEGORIES,
    ...categoryDocs.map((c) => c.name).filter((n) => !DEFAULT_CATEGORIES.includes(n)),
  ];
}

export const META_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"];

export const META_CATEGORY_LABELS = {
  MARKETING: "Marketing",
  UTILITY: "Utility",
  AUTHENTICATION: "Authentication",
};

// WhatsApp template languages, Indian languages first. Codes are Meta's.
export const LANGUAGES = [
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "mr", label: "Marathi" },
  { code: "pa", label: "Punjabi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ur", label: "Urdu" },
  { code: "ar", label: "Arabic" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "id", label: "Indonesian" },
  { code: "pt_BR", label: "Portuguese (Brazil)" },
];

export const languageLabel = (code) => LANGUAGES.find((l) => l.code === code)?.label || code || "English (US)";

export const QUICK_VARS = ["{{name}}", "{{phone}}", "{{company}}", "{{amount}}", "{{date}}"];

export const STATUS_CONFIG = {
  active: { label: "Active", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  draft: { label: "Draft", className: "border-amber-200 bg-amber-50 text-amber-700" },
  pending: { label: "Pending", className: "border-blue-200 bg-blue-50 text-blue-700" },
  archived: { label: "Archived", className: "border-slate-200 bg-slate-100 text-slate-500" },
};

export const CATEGORY_CONFIG = {
  Marketing: "border-purple-200 bg-purple-50 text-purple-700",
  Followup: "border-blue-200 bg-blue-50 text-blue-700",
  Broadcast: "border-amber-200 bg-amber-50 text-amber-700",
  Support: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export const META_STATUS_CONFIG = {
  not_submitted: { label: "Not submitted", className: "border-slate-200 bg-slate-100 text-slate-500" },
  PENDING: { label: "Pending", className: "border-amber-200 bg-amber-50 text-amber-700" },
  APPROVED: { label: "Approved", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Rejected", className: "border-red-200 bg-red-50 text-red-700" },
  PAUSED: { label: "Paused", className: "border-amber-200 bg-amber-50 text-amber-700" },
  DISABLED: { label: "Disabled", className: "border-red-200 bg-red-50 text-red-700" },
};

// Also treated as "needs attention" alongside PENDING/REJECTED in the
// Approvals queue — a paused/disabled template silently stops delivering.
export const NEEDS_ATTENTION_STATUSES = ["PENDING", "REJECTED", "PAUSED", "DISABLED"];

// Extracts every {{token}} in a body — named (from the QUICK_VARS insert
// buttons above, e.g. {{name}}) or numeric ({{1}}) — as an ordered list of
// unique token names, in order of first appearance. Mirrors the backend's
// extractVariableTokens in templateService.js, which is what actually
// converts these to Meta's required {{1}}, {{2}}... at submission time.
export function extractVariableTokens(text = "") {
  const seen = [];
  for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}

export function countTemplateVariables(text = "") {
  return extractVariableTokens(text).length;
}

// A template is "on the Meta track" once a submission has been attempted,
// even if it was later rejected — that's what separates it from a plain
// local/free-text template in the Approved Templates views.
export function isMetaTemplate(template) {
  return Boolean(template.metaTemplateName) || template.metaStatus !== "not_submitted";
}

/* ── One status for the user ───────────────────────────────────────────
 * Templates used to show two statuses side by side (a manual one and
 * WhatsApp's). The user only needs to know where a template stands:
 *   ready        approved by WhatsApp, can be used in campaigns
 *   waiting      sent to WhatsApp, being reviewed
 *   needs_changes rejected, paused or disabled by WhatsApp
 *   draft        started in the approval wizard, not sent yet
 *   plain        plain message, never needs approval (24-hour chats only)
 */
export const TEMPLATE_STAGES = {
  ready: { label: "Ready to send", tone: "success", hint: "Approved by WhatsApp" },
  waiting: { label: "Waiting for WhatsApp", tone: "warning", hint: "Usually approved within a few minutes to a few hours" },
  needs_changes: { label: "Needs changes", tone: "danger", hint: "WhatsApp didn't approve it" },
  draft: { label: "Draft", tone: "neutral", hint: "Not sent for approval yet" },
  plain: { label: "Plain message", tone: "neutral", hint: "Only for people who messaged you in the last 24 hours" },
};

export function templateStage(template) {
  const status = template?.metaStatus;
  if (status === "APPROVED") return "ready";
  if (status === "PENDING") return "waiting";
  if (["REJECTED", "PAUSED", "DISABLED"].includes(status)) return "needs_changes";
  if (isMetaTemplate(template) || template?.metaCategory) return "draft";
  return "plain";
}

// Meta's rejection reason codes, in plain words with what to do next.
const REJECTION_EXPLANATIONS = {
  INVALID_FORMAT:
    "The message format isn't allowed. Check that blanks like {{name}} aren't at the very start or end, aren't next to each other, and that every blank has an example.",
  TAG_CONTENT_MISMATCH:
    "The type you picked doesn't match the message. For example, an offer or discount must be Marketing, not Utility.",
  INCORRECT_CATEGORY:
    "The type you picked doesn't match the message. For example, an offer or discount must be Marketing, not Utility.",
  PROMOTIONAL:
    "WhatsApp thinks this is promotional. Choose Marketing as the type, or remove the sales wording.",
  ABUSIVE_CONTENT: "WhatsApp found wording it doesn't allow. Rewrite the message in a neutral, polite tone.",
  SCAM: "WhatsApp thinks this could mislead customers. Remove claims like guaranteed winnings and check any links.",
  INVALID_URL: "A link in the message or a button doesn't work or isn't allowed. Check the web address.",
};

export function explainTemplateProblem(template) {
  if (template?.metaStatus === "PAUSED") {
    return "WhatsApp paused this template because many customers blocked or ignored it. Edit the wording and send it again, or use another template.";
  }
  if (template?.metaStatus === "DISABLED") {
    return "WhatsApp turned this template off after repeated low ratings. Create a new template with different wording.";
  }
  const code = String(template?.rejectionReason || "").trim().toUpperCase();
  if (REJECTION_EXPLANATIONS[code]) return REJECTION_EXPLANATIONS[code];
  if (code && code !== "NONE") return `WhatsApp's reason: ${template.rejectionReason}. Edit the message and send it again.`;
  return "WhatsApp didn't approve this template. Check the type (Marketing or Utility) and the wording, then send it again.";
}

// Fills friendly blanks with the example values, for previews.
export function fillExamples(text = "", examples = []) {
  const tokens = extractVariableTokens(text);
  let result = text;
  tokens.forEach((token, i) => {
    if (examples[i]?.trim()) result = result.split(`{{${token}}}`).join(examples[i].trim());
  });
  return result;
}
