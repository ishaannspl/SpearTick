// How customers reach SpearTick support. Set these in FRONTEND/.env:
//   VITE_SUPPORT_WHATSAPP=919876543210   (number with country code, digits only)
//   VITE_SUPPORT_EMAIL=support@example.com
// Anything left empty is simply not shown.
const WHATSAPP = String(import.meta.env.VITE_SUPPORT_WHATSAPP || "").replace(/\D/g, "");
const EMAIL = String(import.meta.env.VITE_SUPPORT_EMAIL || "").trim();

export const supportWhatsAppUrl = (text = "Hi, I need help with SpearTick.") =>
  WHATSAPP ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}` : "";

export const supportEmailUrl = EMAIL ? `mailto:${EMAIL}` : "";

export const hasSupportContact = Boolean(WHATSAPP || EMAIL);
