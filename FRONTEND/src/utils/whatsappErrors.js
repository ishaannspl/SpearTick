// Plain-language explanations for the error codes Meta attaches to a failed
// WhatsApp message (message.failure.code). Shown to shop owners instead of
// Meta's own wording, which is written for developers.
const EXPLANATIONS = {
  470: "More than 24 hours have passed since this customer last messaged you. WhatsApp now only allows an approved template.",
  131047: "More than 24 hours have passed since this customer last messaged you. WhatsApp now only allows an approved template.",
  131026: "This number can't receive WhatsApp messages. It may not be on WhatsApp, or it may be using a very old version.",
  131021: "You can't send a message to your own business number.",
  131049: "WhatsApp held this marketing message back because this person recently got many business messages. Try again in a day or two.",
  131050: "This customer has turned off marketing messages from businesses.",
  130472: "WhatsApp didn't deliver this marketing message as part of a Meta test. You are not charged for it.",
  131056: "Too many messages went to this number in a short time. Wait a few minutes and try again.",
  131048: "WhatsApp is limiting your messages because many people blocked or reported your business recently.",
  131042: "There's a problem with the payment method on your WhatsApp Business account. Check billing in Meta Business Suite.",
  131031: "Meta has restricted your WhatsApp Business account. Check Meta Business Suite for details.",
  131053: "The attached file couldn't be sent. Check its type and size.",
  131051: "WhatsApp doesn't support this kind of message.",
  132000: "The number of filled-in blanks doesn't match the template.",
  132001: "This template doesn't exist on WhatsApp (yet). It may still be waiting for approval or may have been deleted.",
  132005: "The message is too long after the blanks were filled in.",
  132012: "One of the filled-in blanks is in the wrong format for this template.",
  132015: "This template is paused by WhatsApp because of low quality. Edit it or use another template.",
  132016: "This template has been disabled by WhatsApp. Use another template.",
  133010: "Your business phone number isn't registered with WhatsApp yet.",
  190: "Your WhatsApp connection has expired. Reconnect WhatsApp in Settings.",
};

const DEFAULT_EXPLANATION = "WhatsApp couldn't deliver this message.";

export function explainWhatsAppFailure(failure) {
  if (!failure) return DEFAULT_EXPLANATION;
  return EXPLANATIONS[Number(failure.code)] || failure.title || failure.message || DEFAULT_EXPLANATION;
}

// True when the fix is to send an approved template instead of free text.
export function needsTemplate(failure) {
  return [470, 131047].includes(Number(failure?.code));
}
