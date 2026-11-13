const mongoose = require("mongoose");

// A company's connection to its online store (WooCommerce today). One per
// company and platform. The store's API key and secret are stored encrypted
// (see companyCredentials.js encryptToken) and are never selected by default,
// so a normal query can't leak them into a response by accident.
const storeConnectionSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    platform: {
      type: String,
      enum: ["woocommerce"],
      default: "woocommerce",
    },

    storeUrl: { type: String, required: true },
    storeName: { type: String, default: "" },

    consumerKeyEnc: { type: String, required: true, select: false },
    consumerSecretEnc: { type: String, required: true, select: false },
    // Last characters of the key, so the screen can show "ck_...a1b2"
    // without ever sending the key itself back to the browser.
    keyLast4: { type: String, default: "" },

    status: {
      type: String,
      enum: ["connected", "error"],
      default: "connected",
    },
    lastErrorCode: { type: String, default: "" },
    lastErrorMessage: { type: String, default: "" },

    productCount: { type: Number, default: 0 },

    connectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    connectedAt: { type: Date, default: Date.now },
    lastCheckedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

storeConnectionSchema.index({ companyId: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model("StoreConnection", storeConnectionSchema);
