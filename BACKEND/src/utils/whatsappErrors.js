// Meta error codes where sending the same message again cannot work, so
// "Retry failed" skips them instead of failing a second time (and, for
// templates, being charged nothing but wasting the retry).
// Matches the explanations in FRONTEND/src/utils/whatsappErrors.js.
const NEVER_RETRY = new Set([
  "131026", // number isn't on WhatsApp / can't receive
  "131021", // sending to your own business number
  "131050", // customer turned off marketing messages
  "132001", // template doesn't exist
  "132016", // template disabled
]);

// Only an approved template fixes these; a plain-text retry fails again.
const NEEDS_TEMPLATE = new Set(["470", "131047"]);

function canRetry(failure, usesTemplate) {
  const code = String(failure?.code || "");
  if (NEVER_RETRY.has(code)) return false;
  if (!usesTemplate && NEEDS_TEMPLATE.has(code)) return false;
  return true;
}

module.exports = { canRetry };
