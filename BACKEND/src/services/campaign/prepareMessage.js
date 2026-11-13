const { resolveValue, toKey } = require("../../utils/sheetFields");

// Personalises a plain (non-template) campaign message for one contact.
// Supports the legacy {{1}} (contact name), {{contact_name}} and
// {{col:<key>}} from the uploaded sheet, plus the friendly blanks the
// template editor inserts ({{name}}, {{amount}} ...), which are read from
// the sheet column of the same name — never sent to customers as-is.
const prepareMessage = (message, contact) => {
  const withName = String(message || "").replace(/\{\{1\}\}/g, contact.name || "Customer");
  const withSheet = withName.replace(/\{\{(contact_name|col:[a-z0-9_]+)\}\}/g, (token) =>
    resolveValue(token, contact),
  );
  return withSheet.replace(/\{\{([A-Za-z_]\w*)\}\}/g, (_, raw) =>
    resolveValue(`{{col:${toKey(raw)}}}`, contact),
  );
};

module.exports = prepareMessage;
