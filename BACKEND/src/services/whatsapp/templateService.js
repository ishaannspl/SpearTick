const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const { resolvePublicMediaUrl } = require("./whatsappService");
const { withRetry } = require("../../utils/withRetry");

// Cache for Meta Media IDs so repeated sends (or campaigns) don't re-upload the same media
const headerMediaIdCache = new Map();
const MEDIA_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (Meta media IDs valid for 30 days)

async function uploadHeaderMediaToMeta(credentials, mediaSource, headerType = "IMAGE") {
  const { accessToken, phoneNumberId, apiVersion = "v26.0" } = credentials;
  const baseUrl = `https://graph.facebook.com/${apiVersion}`;

  const cacheKey = `${phoneNumberId}:${mediaSource}`;
  const cached = headerMediaIdCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < MEDIA_CACHE_TTL_MS) {
    return cached.id;
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");

  if (/^https?:\/\//i.test(mediaSource)) {
    const response = await axios.get(mediaSource, { responseType: "stream" });
    const contentType =
      response.headers["content-type"] ||
      (headerType === "VIDEO" ? "video/mp4" : headerType === "DOCUMENT" ? "application/pdf" : "image/jpeg");
    form.append("type", contentType);
    form.append("file", response.data, {
      filename: `header_${Date.now()}.${headerType === "VIDEO" ? "mp4" : headerType === "DOCUMENT" ? "pdf" : "jpg"}`,
      contentType,
    });
  } else {
    const resolvedPath = path.isAbsolute(mediaSource)
      ? mediaSource
      : path.join(__dirname, "../../../", mediaSource);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Local media file not found on disk: ${resolvedPath}`);
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const type =
      ext === ".png"
        ? "image/png"
        : ext === ".pdf"
          ? "application/pdf"
          : ext === ".mp4"
            ? "video/mp4"
            : "image/jpeg";
    form.append("type", type);
    form.append("file", fs.createReadStream(resolvedPath));
  }

  const res = await axios.post(`${baseUrl}/${phoneNumberId}/media`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${accessToken}`,
    },
    timeout: 30000,
  });

  const mediaId = res.data?.id;
  if (mediaId) {
    headerMediaIdCache.set(cacheKey, { id: mediaId, timestamp: Date.now() });
  }

  return mediaId;
}

// Extracts every {{token}} in a body — named (from the QUICK_VARS insert
// buttons, e.g. {{name}}) or numeric ({{1}}) — as an ordered list of unique
// token names, in order of first appearance. Repeated uses of the same
// token collapse to one entry, matching Meta's one-slot-per-variable model.
const extractVariableTokens = (text = "") => {
  const seen = [];
  for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
};

// Counts distinct placeholders in a template body — named or numeric.
const countVariables = (text = "") => extractVariableTokens(text).length;

// Meta's POSITIONAL parameter format (the default, and the only one this
// app declares) requires strictly sequential numeric placeholders —
// {{1}}, {{2}}, ... A body authored with the friendly QUICK_VARS tokens
// (e.g. {{name}}, {{phone}}) is invalid syntax for Meta and gets rejected
// with INVALID_FORMAT. Convert every token to its 1-based position (in
// order of first appearance) right before submission, without touching
// what's stored/edited in the DB.
const toPositionalBody = (text = "") => {
  const tokens = extractVariableTokens(text);
  let positional = text;
  tokens.forEach((token, i) => {
    positional = positional.replaceAll(`{{${token}}}`, `{{${i + 1}}}`);
  });
  return { text: positional, tokens };
};

// Textareas on Windows (and text pasted from Windows apps) save lines as
// \r\n — Meta's template body validator treats the stray \r as an invalid
// character and rejects the submission with INVALID_FORMAT, even though it
// renders identically to \n in every UI. Strip it before it ever reaches
// Meta's API.
const normalizeLineEndings = (text = "") => text.replace(/\r\n/g, "\n");

// Builds the HEADER component for a template *submission* request. For
// IMAGE/VIDEO/DOCUMENT this expects template.headerHandle to already be
// populated — the controller is responsible for running the Resumable
// Upload flow (metaMediaService) before calling this, since that's a
// multi-step orchestration this pure API-call layer shouldn't own.
const buildHeaderComponentForSubmission = (template) => {
  if (!template.headerType || template.headerType === "NONE") return null;

  if (template.headerType === "TEXT") {
    const hasVariable = /\{\{1\}\}/.test(template.headerText || "");
    return {
      type: "HEADER",
      format: "TEXT",
      text: normalizeLineEndings(template.headerText),
      ...(hasVariable && {
        example: { header_text: [template.headerTextExample || "example"] },
      }),
    };
  }

  if (!template.headerHandle) {
    throw new Error(
      `Missing uploaded media handle for ${template.headerType} header — upload the header file before submitting`,
    );
  }

  return {
    type: "HEADER",
    format: template.headerType,
    example: { header_handle: [template.headerHandle] },
  };
};

// Builds the header "parameters" block for an actual message *send* using
// an already-approved template — this is the simpler, per-message form
// (link/id or a header-text variable), distinct from the handle-based
// submission form above.
const buildHeaderParamsForSend = async (credentials, template) => {
  if (!template.headerType || template.headerType === "NONE") return null;

  if (template.headerType === "TEXT") {
    if (!/\{\{1\}\}/.test(template.headerText || "")) return null;
    return {
      type: "header",
      parameters: [{ type: "text", text: template.headerTextExample || "" }],
    };
  }

  const mediaKey = template.headerType.toLowerCase(); // image | video | document
  const rawUrl =
    template.headerMediaUrl ||
    template.mediaUrl ||
    (/^https?:\/\//i.test(template.headerHandle) ? template.headerHandle : "");

  if (!rawUrl) return null;

  // If the media URL is on Meta's internal preview CDN (scontent / lookaside),
  // Meta's Cloud API media downloader refuses to fetch from its own CDN and returns
  // "403 Forbidden" (code 131053).
  // Also, local files (/uploads/...) require a live public tunnel that may not be available.
  // Pre-uploading to Meta's WhatsApp Media API directly provides a native WhatsApp media ID,
  // guaranteeing delivery without any 403 Forbidden errors or tunnel downtime.
  const isMetaCdn = /scontent\.whatsapp\.net|lookaside\.fbsbx\.com/i.test(rawUrl);
  const isLocalFile = !/^https?:\/\//i.test(rawUrl);

  if (isMetaCdn || isLocalFile) {
    try {
      const mediaId = await uploadHeaderMediaToMeta(credentials, rawUrl, template.headerType);
      if (mediaId) {
        return {
          type: "header",
          parameters: [
            {
              type: mediaKey,
              [mediaKey]: { id: mediaId },
            },
          ],
        };
      }
    } catch (uploadError) {
      console.warn(
        "Failed to pre-upload media to Meta Media API, falling back to public link:",
        uploadError.message,
      );
    }
  }

  return {
    type: "header",
    parameters: [
      {
        type: mediaKey,
        [mediaKey]: { link: resolvePublicMediaUrl(rawUrl) },
      },
    ],
  };
};

const MAX_BUTTONS = 10;

// Meta's constraints on the BUTTONS component: at most 10 total, and
// QUICK_REPLY buttons must all come before any URL/PHONE_NUMBER button —
// "Quick Reply, Quick Reply, URL, Phone" is valid, "Quick Reply, URL,
// Quick Reply" is rejected by Meta as an invalid ordering.
const validateButtons = (buttons = []) => {
  if (buttons.length > MAX_BUTTONS) {
    throw new Error(`A template can have at most ${MAX_BUTTONS} buttons`);
  }

  let seenNonQuickReply = false;
  for (const button of buttons) {
    if (button.type === "QUICK_REPLY" && seenNonQuickReply) {
      throw new Error(
        "Order matters: add all your Quick Reply buttons first, then any Website/Call buttons after",
      );
    }
    if (button.type !== "QUICK_REPLY") seenNonQuickReply = true;

    const maxLen = button.type === "COPY_CODE" ? 20 : 25;
    if ((button.text || "").length > maxLen) {
      throw new Error(
        `Button text "${button.text}" exceeds Meta's ${maxLen}-character limit`,
      );
    }
  }
};

// Builds the BUTTONS component for a template *submission* request.
const buildButtonsComponentForSubmission = (template) => {
  const buttons = template.buttons || [];
  if (buttons.length === 0) return null;

  validateButtons(buttons);

  return {
    type: "BUTTONS",
    buttons: buttons.map((button) => {
      if (button.type === "URL") {
        const hasVariable = /\{\{1\}\}/.test(button.url || "");
        return {
          type: "URL",
          text: button.text,
          url: button.url,
          ...(hasVariable && { example: [button.urlExample || "example"] }),
        };
      }
      if (button.type === "PHONE_NUMBER") {
        return { type: "PHONE_NUMBER", text: button.text, phone_number: button.phoneNumber };
      }
      // QUICK_REPLY and COPY_CODE only need a label.
      return { type: button.type, text: button.text };
    }),
  };
};

// Builds the "button" component send-time parameters for any button whose
// URL contains a dynamic {{1}} — static buttons (fixed URL/phone/quick
// reply) need nothing at send time, they're fixed by the approved template.
// `index` is the button's position in the full BUTTONS array as declared
// on the template, per Meta's send-request format.
const buildButtonParamsForSend = (template, buttonVariables = []) => {
  const buttons = template.buttons || [];

  return buttons
    .map((button, index) => {
      if (button.type !== "URL" || !/\{\{1\}\}/.test(button.url || "")) return null;
      return {
        type: "button",
        sub_type: "url",
        index: String(index),
        parameters: [{ type: "text", text: buttonVariables[index] ?? "" }],
      };
    })
    .filter(Boolean);
};

const submitTemplateToMeta = async (credentials, template) => {
  const { accessToken, wabaId, apiVersion } = credentials;
  const baseUrl = `https://graph.facebook.com/${apiVersion}`;

  const { text: positionalBody, tokens } = toPositionalBody(
    normalizeLineEndings(template.description),
  );
  const headerComponent = buildHeaderComponentForSubmission(template);
  const buttonsComponent = buildButtonsComponentForSubmission(template);

  const components = [
    ...(headerComponent ? [headerComponent] : []),
    {
      type: "BODY",
      text: positionalBody,
      ...(tokens.length > 0 && {
        example: {
          body_text: [
            tokens.map(
              (_, i) => template.bodyVariableExamples?.[i] || `example${i + 1}`,
            ),
          ],
        },
      }),
    },
    ...(buttonsComponent ? [buttonsComponent] : []),
  ];

  try {
    const response = await axios.post(
      `${baseUrl}/${wabaId}/message_templates`,
      {
        name: template.metaTemplateName,
        category: template.metaCategory,
        language: template.language || "en_US",
        components,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    return {
      ...response.data,
      variableMap: tokens.map((name, i) => ({ name, index: i + 1 })),
    };
  } catch (error) {
    console.error(
      "Meta Template Submission Error:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

// Pulls current template statuses straight from Meta, used to reconcile
// local records when a status-change webhook was missed (e.g. tunnel URL
// rotated between submission and approval).
const fetchMetaTemplates = async (credentials) => {
  const { accessToken, wabaId, apiVersion } = credentials;
  const baseUrl = `https://graph.facebook.com/${apiVersion}`;

  const response = await axios.get(
    `${baseUrl}/${wabaId}/message_templates`,
    {
      params: {
        access_token: accessToken,
        fields: "id,name,status,category,quality_score,rejected_reason,components",
        limit: 250,
      },
    },
  );

  return response.data.data || [];
};

const sendTemplateMessage = async (credentials, to, template, variableValues = [], buttonVariables = []) => {
  const { accessToken, phoneNumberId, apiVersion } = credentials;
  const baseUrl = `https://graph.facebook.com/${apiVersion}`;

  const variableCount = countVariables(template.description);
  const headerParams = await buildHeaderParamsForSend(credentials, template);
  const buttonParams = buildButtonParamsForSend(template, buttonVariables);

  const components = [
    ...(headerParams ? [headerParams] : []),
    ...(variableCount > 0
      ? [
          {
            type: "body",
            parameters: Array.from({ length: variableCount }, (_, i) => ({
              type: "text",
              text: variableValues[i] ?? "",
            })),
          },
        ]
      : []),
    ...buttonParams,
  ];

  try {
    const response = await withRetry(
      () =>
        axios.post(
          `${baseUrl}/${phoneNumberId}/messages`,
          {
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
              name: template.metaTemplateName,
              language: { code: template.language || "en_US" },
              components,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            timeout: 15000,
          },
        ),
      { label: `sendTemplateMessage(${to})` },
    );

    return response.data;
  } catch (error) {
    console.error(
      "Meta Template Send Error:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

module.exports = {
  countVariables,
  extractVariableTokens,
  normalizeLineEndings,
  validateButtons,
  submitTemplateToMeta,
  fetchMetaTemplates,
  sendTemplateMessage,
};
