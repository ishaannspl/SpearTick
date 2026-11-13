// Phone helpers shared by every way a contact gets created. Numbers are
// stored the way WhatsApp itself reports them (digits with country code,
// e.g. 919876543210), so "+91 98765-43210" and "919876543210" are one contact.
// Must match FRONTEND/src/utils/contactSheet.js normalizePhone()/isValidPhone().

// Header names recognised as the phone / name column of an uploaded sheet.
const PHONE_HEADER = /(phone|mobile|whats\s*app|whatsapp|number|msisdn|contact\s*no|cell)/i;
// Words that clearly mean a phone number, preferred over a generic
// "number" (which could be an order or invoice number).
const STRONG_PHONE_HEADER = /(phone|mobile|whats\s*app|whatsapp|msisdn|cell)/i;
const NAME_HEADER = /(^|\b)(full\s*name|customer\s*name|contact\s*name|name|customer)(\b|$)/i;
const TAGS_HEADER = /^(tags?|labels?)$/i;

const phoneDigits = (value) => String(value || "").replace(/\D/g, "");

// "+91 98765-43210", "098765 43210", "0091 9876543210" and "9876543210"
// all become "919876543210". Other countries keep their digits as typed.
function normalizePhone(value) {
  let digits = phoneDigits(value);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0[6-9]\d{9}$/.test(digits)) digits = digits.slice(1);
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  return digits;
}

function isValidPhone(value) {
  const digits = normalizePhone(value);
  if (/^91[6-9]\d{9}$/.test(digits)) return true;
  return /^[1-9]\d{10,14}$/.test(digits) && !digits.startsWith("91");
}

const cleanHeader = (header) => String(header || "").replace(/^﻿/, "").trim();

// Picks the phone, name and tags columns from a sheet's headers, so a file
// with "Mobile" or "WhatsApp Number" works as well as one with "phone".
function detectContactColumns(headers = []) {
  // An exact "phone"/"name" header wins (the app's own import sends those),
  // so a column like "Order Number" earlier in the sheet is never mistaken
  // for the phone number.
  const exact = (word) => headers.find((h) => cleanHeader(h).toLowerCase() === word);
  const phone =
    exact("phone") ||
    headers.find((h) => STRONG_PHONE_HEADER.test(cleanHeader(h))) ||
    headers.find((h) => PHONE_HEADER.test(cleanHeader(h)));
  const name = exact("name") || headers.find((h) => h !== phone && NAME_HEADER.test(cleanHeader(h)));
  const tags = headers.find((h) => TAGS_HEADER.test(cleanHeader(h)));
  return { phone, name, tags };
}

module.exports = { normalizePhone, isValidPhone, detectContactColumns, PHONE_HEADER, NAME_HEADER };
