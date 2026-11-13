/**
 * Converts standard Markdown and raw LLM output into clean WhatsApp-compatible text.
 * 
 * WhatsApp formatting rules:
 * - Bold: *text* (single asterisk, touching the word, no spaces inside)
 * - Italic: _text_ (single underscore)
 * - Strikethrough: ~text~
 * - Monospace: ```text```
 * - Bullets: • text (WhatsApp uses unicode bullets for clean list presentation)
 */
function formatForWhatsApp(text) {
  if (!text || typeof text !== "string") return "";

  let cleaned = text;

  // 1. Convert markdown bold+italic (***text*** or ___text___) to _*text*_
  cleaned = cleaned.replace(/\*{3,}\s*([^*\n]+?)\s*\*{3,}/g, "_*$1*_");
  cleaned = cleaned.replace(/_{3,}\s*([^_\n]+?)\s*_{3,}/g, "_*$1*_");

  // 2. Convert markdown bold (**text** or ** text **) to *text*
  cleaned = cleaned.replace(/\*{2}\s*([^*\n]+?)\s*\*{2}/g, "*$1*");
  cleaned = cleaned.replace(/_{2}\s*([^_\n]+?)\s*_{2}/g, "*$1*");

  // 3. Fix single asterisks with accidental inner spaces (* text * -> *text*)
  cleaned = cleaned.replace(/(^|[\s(])\*\s+([^*\n]+?)\s+\*([\s).,!?:;]|$)/g, "$1*$2*$3");

  // 4. Convert markdown strikethrough (~~text~~) to ~text~
  cleaned = cleaned.replace(/~{2}\s*([^~\n]+?)\s*~{2}/g, "~$1~");

  // 5. Convert markdown headers (### Header) to bold: *Header*
  cleaned = cleaned.replace(/^#{1,6}\s*(.+)$/gm, "*$1*");

  // 6. Convert markdown list items (- item or * item) at start of lines to native unicode bullets
  cleaned = cleaned.replace(/^(\s*)[-*]\s+/gm, "$1• ");

  // 7. Collapse excessive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

module.exports = { formatForWhatsApp };
