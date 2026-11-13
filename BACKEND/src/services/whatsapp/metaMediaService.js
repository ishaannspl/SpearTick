const axios = require("axios");
const fs = require("fs");

// APP_ID is the platform's own Meta app — shared across every tenant (each
// company connects its own WABA/phone/token to this one app), so this one
// stays a plain env var, unlike accessToken/apiVersion below which are
// per-company.
const APP_ID = process.env.META_APP_ID;

// WhatsApp's documented per-type ceilings for template header media.
const MAX_SIZE_BY_HEADER_TYPE = {
  IMAGE: 5 * 1024 * 1024,
  VIDEO: 16 * 1024 * 1024,
  DOCUMENT: 100 * 1024 * 1024,
};

function assertWithinSizeLimit(headerType, fileSize) {
  const max = MAX_SIZE_BY_HEADER_TYPE[headerType];
  if (max && fileSize > max) {
    const maxMb = Math.round(max / (1024 * 1024));
    throw new Error(`${headerType} header media must be ${maxMb}MB or smaller`);
  }
}

// Step 1 of the Resumable Upload API — declare the file you're about to
// upload, get back a session id to push the actual bytes to.
async function createUploadSession(credentials, { fileName, fileLength, fileType }) {
  if (!APP_ID) {
    throw new Error("META_APP_ID is not configured — required for template header media uploads");
  }

  const baseUrl = `https://graph.facebook.com/${credentials.apiVersion}`;
  const response = await axios.post(`${baseUrl}/${APP_ID}/uploads`, null, {
    params: {
      file_name: fileName,
      file_length: fileLength,
      file_type: fileType,
      access_token: credentials.accessToken,
    },
  });

  return response.data.id; // "upload:<UPLOAD_SESSION_ID>"
}

// Step 2 — push the file's bytes to that session, get back the asset
// handle that goes into the template's HEADER component.
async function uploadFileBytes(credentials, uploadSessionId, fileBuffer) {
  const baseUrl = `https://graph.facebook.com/${credentials.apiVersion}`;
  const response = await axios.post(`${baseUrl}/${uploadSessionId}`, fileBuffer, {
    headers: {
      Authorization: `OAuth ${credentials.accessToken}`,
      file_offset: "0",
      "Content-Type": "application/octet-stream",
    },
  });

  return response.data.h; // asset handle, e.g. "4::aW..."
}

// Orchestrates both steps for a local file already saved on disk (by the
// existing multer upload) and returns the handle to embed in the template
// submission's HEADER component example.
async function getHeaderHandle(credentials, { filePath, mimeType, fileName, headerType }) {
  const { size } = fs.statSync(filePath);
  assertWithinSizeLimit(headerType, size);

  try {
    const uploadSessionId = await createUploadSession(credentials, {
      fileName,
      fileLength: size,
      fileType: mimeType,
    });

    const fileBuffer = fs.readFileSync(filePath);
    const handle = await uploadFileBytes(credentials, uploadSessionId, fileBuffer);

    return handle;
  } catch (error) {
    console.error("Meta Media Upload Error:", error.response?.data || error.message);
    throw error;
  }
}

const EXTENSION_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/3gpp": ".3gp",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "application/pdf": ".pdf",
};

// Downloads a photo, video, voice note or document a customer sent, so it
// can be shown in the inbox. Meta's media links expire, so the file is
// saved locally under uploads/inbox.
async function downloadIncomingMedia(credentials, mediaId) {
  const { accessToken, apiVersion } = credentials;
  const auth = { Authorization: `Bearer ${accessToken}` };

  const info = await axios.get(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
    headers: auth,
    timeout: 15000,
  });
  const mimeType = (info.data.mime_type || "application/octet-stream").split(";")[0].trim();

  const file = await axios.get(info.data.url, {
    headers: auth,
    responseType: "arraybuffer",
    timeout: 60000,
  });

  const dir = "uploads/inbox";
  await fs.promises.mkdir(dir, { recursive: true });
  const filePath = `${dir}/${Date.now()}-${String(mediaId).replace(/\W/g, "")}${EXTENSION_BY_MIME[mimeType] || ""}`;
  await fs.promises.writeFile(filePath, Buffer.from(file.data));

  return { mediaUrl: filePath, mediaType: mimeType };
}

module.exports = {
  getHeaderHandle,
  downloadIncomingMedia,
};
