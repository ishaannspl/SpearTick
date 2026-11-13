const Contact = require("../models/contact");
const { normalizePhone } = require("../utils/phone");

// Single source of truth for "find or create a contact by phone" across every
// entry point (inbound WhatsApp messages, manual add, CSV import, campaign
// upload). Preserves the original name-merge rule from
// whatsapp/messageService.js: never clobber a real name with a blank one, and
// never overwrite a name that's already something other than the phone
// placeholder.
//
// Phones are stored normalised (919876543210); the raw value is also matched
// so contacts saved before normalisation are still found, not duplicated.
const findOrCreateContact = async ({ companyId, phone: rawPhone, name, source = "whatsapp", tags }) => {
  const phone = normalizePhone(rawPhone) || String(rawPhone || "").trim();
  let contact = await Contact.findOne({
    companyId,
    phone: { $in: [...new Set([phone, String(rawPhone || "").trim()])] },
  });

  if (!contact) {
    contact = await Contact.create({
      companyId,
      phone,
      name: name || phone,
      source,
      tags: tags || [],
    });

    return { contact, created: true, updated: false };
  }

  let changed = false;

  if (name && (contact.name === phone || contact.name === rawPhone || !contact.name)) {
    contact.name = name;
    changed = true;
  }

  if (tags?.length) {
    const merged = new Set([...(contact.tags || []), ...tags]);

    if (merged.size !== (contact.tags || []).length) {
      contact.tags = [...merged];
      changed = true;
    }
  }

  if (changed) await contact.save();

  return { contact, created: false, updated: changed };
};

module.exports = { findOrCreateContact };
