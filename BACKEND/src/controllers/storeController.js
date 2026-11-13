const StoreConnection = require("../models/storeConnection");
const { encryptToken, decryptToken } = require("../services/whatsapp/companyCredentials");
const { StoreError, verifyConnection } = require("../services/commerce/woocommerceClient");

const PLATFORM = "woocommerce";

// What the screen is allowed to see. Never the key or the secret.
const toView = (connection) => {
  if (!connection) return { connected: false };
  return {
    connected: connection.status === "connected",
    status: connection.status,
    platform: connection.platform,
    storeUrl: connection.storeUrl,
    storeName: connection.storeName,
    productCount: connection.productCount,
    keyHint: connection.keyLast4 ? `ck_...${connection.keyLast4}` : "",
    connectedAt: connection.connectedAt,
    lastCheckedAt: connection.lastCheckedAt,
    lastError: connection.lastErrorMessage || "",
  };
};

// A store's own errors (wrong keys, unreachable site...) are the merchant's to
// fix, so they come back as 400 with a plain message. Never 401/403: the app
// treats those as "your session expired" or "upgrade your plan".
const sendFailure = (res, error, fallback) => {
  if (error instanceof StoreError) {
    return res.status(400).json({ success: false, code: error.code, message: error.message });
  }
  console.error(`[store] ${fallback}:`, error);
  return res.status(500).json({ success: false, message: fallback });
};

const getStore = async (req, res) => {
  try {
    const connection = await StoreConnection.findOne({ companyId: req.companyId, platform: PLATFORM });
    res.status(200).json({ success: true, store: toView(connection) });
  } catch (error) {
    sendFailure(res, error, "Couldn't load your store connection");
  }
};

const connectStore = async (req, res) => {
  try {
    const key = String(req.body.consumerKey || "").trim();
    const secret = String(req.body.consumerSecret || "").trim();

    if (!req.body.storeUrl || !key || !secret) {
      return res.status(400).json({
        success: false,
        code: "MISSING_FIELDS",
        message: "Enter the store address, the Consumer key and the Consumer secret.",
      });
    }
    if (!key.startsWith("ck_")) {
      return res.status(400).json({
        success: false,
        code: "INVALID_CREDENTIALS",
        message: "That doesn't look like a WooCommerce Consumer key. It starts with ck_.",
      });
    }
    if (!secret.startsWith("cs_")) {
      return res.status(400).json({
        success: false,
        code: "INVALID_CREDENTIALS",
        message: "That doesn't look like a WooCommerce Consumer secret. It starts with cs_.",
      });
    }

    // Proves the address and keys work before anything is saved.
    const verified = await verifyConnection({ storeUrl: req.body.storeUrl, key, secret });

    const connection = await StoreConnection.findOneAndUpdate(
      { companyId: req.companyId, platform: PLATFORM },
      {
        $set: {
          storeUrl: verified.storeUrl,
          storeName: verified.storeName,
          productCount: verified.productCount,
          consumerKeyEnc: encryptToken(key),
          consumerSecretEnc: encryptToken(secret),
          keyLast4: key.slice(-4),
          status: "connected",
          lastErrorCode: "",
          lastErrorMessage: "",
          connectedBy: req.user.userId,
          connectedAt: new Date(),
          lastCheckedAt: new Date(),
        },
        $setOnInsert: { companyId: req.companyId, platform: PLATFORM },
      },
      { upsert: true, new: true },
    );

    res.status(200).json({ success: true, store: toView(connection) });
  } catch (error) {
    sendFailure(res, error, "Couldn't connect your store");
  }
};

// Re-checks a saved connection (keys can be revoked, the site can go down).
// The check's outcome is saved either way, so the screen shows the truth.
const testStore = async (req, res) => {
  try {
    const connection = await StoreConnection.findOne({
      companyId: req.companyId,
      platform: PLATFORM,
    }).select("+consumerKeyEnc +consumerSecretEnc");

    if (!connection) {
      return res.status(404).json({
        success: false,
        code: "NOT_CONNECTED",
        message: "No store is connected yet.",
      });
    }

    try {
      const verified = await verifyConnection({
        storeUrl: connection.storeUrl,
        key: decryptToken(connection.consumerKeyEnc),
        secret: decryptToken(connection.consumerSecretEnc),
      });
      connection.status = "connected";
      connection.storeName = verified.storeName || connection.storeName;
      connection.productCount = verified.productCount;
      connection.lastErrorCode = "";
      connection.lastErrorMessage = "";
    } catch (error) {
      if (!(error instanceof StoreError)) throw error;
      connection.status = "error";
      connection.lastErrorCode = error.code;
      connection.lastErrorMessage = error.message;
    }

    connection.lastCheckedAt = new Date();
    await connection.save();

    res.status(200).json({ success: true, store: toView(connection) });
  } catch (error) {
    sendFailure(res, error, "Couldn't check your store connection");
  }
};

const disconnectStore = async (req, res) => {
  try {
    await StoreConnection.deleteOne({ companyId: req.companyId, platform: PLATFORM });
    res.status(200).json({ success: true, store: { connected: false } });
  } catch (error) {
    sendFailure(res, error, "Couldn't disconnect your store");
  }
};

module.exports = { getStore, connectStore, testStore, disconnectStore };
