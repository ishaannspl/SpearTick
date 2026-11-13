const fs = require("fs");
const axios = require("axios");
const { withRetry } = require("../../utils/withRetry");

// Meta fetches image links directly from the internet, so a bare local path
// (what multer stores on the Template/Campaign docs) has to be turned into a
// publicly reachable URL first — same tunnel requirement the webhook already
// has (see templateController's Meta sync comment). Set PUBLIC_BASE_URL to
// that tunnel's origin in .env; without it this falls back to localhost,
// which Meta cannot reach.
const resolvePublicMediaUrl = (mediaPath) => {
  if (/^https?:\/\//i.test(mediaPath)) return mediaPath;

  const base =
    process.env.PUBLIC_BASE_URL ||
    `http://localhost:${process.env.PORT || 5000}`;
  const normalizedPath = mediaPath.replace(/\\/g, "/").replace(/^\/?/, "/");

  return `${base.replace(/\/$/, "")}${normalizedPath}`;
};

// Every exported call here takes the sending company's own credentials
// (from companyCredentials.js's getCompanyWhatsAppCredentials) instead of a
// single hardcoded env-var token/number — this is a multi-tenant deployment,
// each company sends from its own connected WhatsApp number.
const sendImageMessage = async (credentials, to, mediaPath, caption = "") => {
  const { accessToken, phoneNumberId, apiVersion } = credentials;
  const baseUrl = `https://graph.facebook.com/${apiVersion}`;

  try {
    const response = await withRetry(
      () =>
        axios.post(
          `${baseUrl}/${phoneNumberId}/messages`,
          {
            messaging_product: "whatsapp",
            to,
            type: "image",
            image: {
              link: resolvePublicMediaUrl(mediaPath),
              ...(caption && { caption }),
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
      { label: `sendImageMessage(${to})` },
    );

    return response.data;
  } catch (error) {
    console.error("Meta Send Error:", error.response?.data || error.message);
    throw error;
  }
};

const sendTextMessage = async (credentials, to, text) => {
  const { accessToken, phoneNumberId, apiVersion } = credentials;
  const baseUrl = `https://graph.facebook.com/${apiVersion}`;

  try {
    const response = await withRetry(
      () =>
        axios.post(
          `${baseUrl}/${phoneNumberId}/messages`,
          {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: {
              body: text,
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
      { label: `sendTextMessage(${to})` },
    );

    return response.data;
  } catch (error) {
    console.error("Meta Send Error:", error.response?.data || error.message);
    throw error;
  }
};

// Uploads a file from this server to WhatsApp and sends it by media id, so
// it works even when the uploads folder isn't reachable from the internet.
const mediaKindOf = (mimeType = "") => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
};

const sendMediaMessage = async (credentials, to, { filePath, mimeType, fileName, caption = "" }) => {
  const { accessToken, phoneNumberId, apiVersion } = credentials;
  const baseUrl = `https://graph.facebook.com/${apiVersion}`;
  const kind = mediaKindOf(mimeType);

  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append("file", new Blob([await fs.promises.readFile(filePath)], { type: mimeType }), fileName);
    const upload = await axios.post(`${baseUrl}/${phoneNumberId}/media`, form, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 60000,
    });

    const media = {
      id: upload.data.id,
      ...(caption && kind !== "audio" && { caption }),
      ...(kind === "document" && { filename: fileName }),
    };
    const response = await axios.post(
      `${baseUrl}/${phoneNumberId}/messages`,
      { messaging_product: "whatsapp", to, type: kind, [kind]: media },
      {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        timeout: 15000,
      },
    );
    return response.data;
  } catch (error) {
    console.error("Meta Media Send Error:", error.response?.data || error.message);
    throw error;
  }
};

module.exports = {
  sendMediaMessage,
  mediaKindOf,
  sendTextMessage,
  sendImageMessage,
  resolvePublicMediaUrl,
};
