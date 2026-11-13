const axios = require("axios");
const dns = require("dns");
const http = require("http");
const https = require("https");
const net = require("net");

// Talks to a merchant's WooCommerce store (REST API v3). The store address is
// typed in by a customer, so this server will fetch whatever address it is
// given. That makes it a way to reach this server's own network, unless every
// connection is checked: addresses that point inside a private network, to
// this machine, or to a cloud metadata service are refused. For local
// development against a test store, set ALLOW_PRIVATE_STORE_HOSTS=true.

const REQUEST_TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

// An error whose message is safe and clear enough to show to the merchant.
class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StoreError";
    this.code = code;
  }
}

const allowPrivateHosts = () => process.env.ALLOW_PRIVATE_STORE_HOSTS === "true";

// True for addresses a public store can never legitimately have.
function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast and reserved
    );
  }

  if (net.isIPv6(address)) {
    const value = address.toLowerCase();
    if (value === "::" || value === "::1") return true;
    if (/^f[cd]/.test(value)) return true; // unique local fc00::/7
    if (/^fe[89ab]/.test(value)) return true; // link-local fe80::/10

    // IPv4 written inside IPv6, e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1
    const dotted = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateAddress(dotted[1]);
    const hex = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const high = parseInt(hex[1], 16);
      const low = parseInt(hex[2], 16);
      return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return false;
  }

  return true; // not an address we understand: don't trust it
}

const blockedHostError = () =>
  new StoreError(
    "BLOCKED_HOST",
    "That address can't be used. Enter your store's public web address, for example https://yourshop.com.",
  );

// Checked again at the moment of connecting (not just when the address is
// typed), so a name that later points somewhere private is still refused.
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!allowPrivateHosts() && addresses.some((entry) => isPrivateAddress(entry.address))) {
      return callback(blockedHostError());
    }
    if (options && options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

// Turns whatever the merchant typed into a clean base address, or explains
// what's wrong with it. Accepts "myshop.com", "https://myshop.com/shop/" and
// even a pasted wp-admin link.
function normalizeStoreUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) {
    throw new StoreError("INVALID_URL", "Enter your store's web address, for example https://yourshop.com.");
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new StoreError("INVALID_URL", "That doesn't look like a web address. Use something like https://yourshop.com.");
  }

  if (url.username || url.password) {
    throw new StoreError("INVALID_URL", "Remove the username and password from the address. The keys go in the boxes below.");
  }

  const isHttps = url.protocol === "https:";
  const isLocalHttp = url.protocol === "http:" && allowPrivateHosts();
  if (!isHttps && !isLocalHttp) {
    throw new StoreError(
      "HTTPS_REQUIRED",
      "Your store must use HTTPS (the address starts with https://). WooCommerce only accepts API keys over a secure connection.",
    );
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivateHosts() && net.isIP(host) && isPrivateAddress(host)) {
    throw blockedHostError();
  }

  // Keep a sub-folder install (https://site.com/shop) but drop wp-admin,
  // wp-json, query strings and trailing slashes.
  const path = url.pathname
    .replace(/\/(wp-admin|wp-json|wp-login\.php)(\/.*)?$/i, "")
    .replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${path}`;
}

const TLS_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER",
]);

function mapNetworkError(error) {
  if (error instanceof StoreError) return error;
  if (error.cause instanceof StoreError) return error.cause;
  const code = error.code || error.cause?.code;

  if (code === "BLOCKED_HOST") return blockedHostError();
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new StoreError("HOST_NOT_FOUND", "We couldn't find that website. Check the address for typing mistakes.");
  }
  if (code === "ECONNABORTED" || code === "ETIMEDOUT" || code === "ECONNRESET") {
    return new StoreError("TIMEOUT", "The store took too long to answer. Try again in a minute, or check that the site is online.");
  }
  if (code === "ECONNREFUSED" || code === "EHOSTUNREACH" || code === "ENETUNREACH") {
    return new StoreError("CONNECTION_FAILED", "We couldn't reach the store. Check that the website is online and the address is right.");
  }
  if (TLS_ERROR_CODES.has(code)) {
    return new StoreError(
      "SSL_ERROR",
      "The store's security certificate isn't valid (it may have expired or doesn't match the address). Fix the certificate, then try again.",
    );
  }
  if (code === "ERR_FR_MAX_BODY_LENGTH_EXCEEDED" || code === "ERR_BAD_RESPONSE") {
    return new StoreError("STORE_ERROR", "The store sent back more data than expected. Please try again.");
  }
  return new StoreError("CONNECTION_FAILED", "We couldn't connect to the store. Check the address and try again.");
}

function mapStatusError(status) {
  if (status === 401) {
    return new StoreError(
      "INVALID_CREDENTIALS",
      "WooCommerce didn't accept these keys. Check that the Consumer key (starts with ck_) and Consumer secret (starts with cs_) were copied fully, with no extra spaces.",
    );
  }
  if (status === 403) {
    return new StoreError(
      "NO_PERMISSION",
      "These keys can't read products. In WooCommerce, create a new key with at least Read permission, made by an Administrator user.",
    );
  }
  if (status === 404) {
    return new StoreError(
      "WOOCOMMERCE_NOT_FOUND",
      "We couldn't find WooCommerce at this address. Check that WooCommerce is installed here, and that Settings > Permalinks in WordPress is not set to \"Plain\".",
    );
  }
  if (status >= 300 && status < 400) {
    return new StoreError(
      "REDIRECTED",
      "This address forwards to a different one (for example from http to https, or to a www address). Use the final address shown in your browser.",
    );
  }
  if (status === 429) {
    return new StoreError("RATE_LIMITED", "The store is asking us to slow down. Try again in a minute.");
  }
  return new StoreError("STORE_ERROR", `The store returned an error (${status}). Try again in a minute.`);
}

function buildAgents() {
  return {
    httpAgent: new http.Agent({ lookup: safeLookup }),
    httpsAgent: new https.Agent({ lookup: safeLookup }),
  };
}

// One GET to the store's WooCommerce API. `credentials` = { storeUrl, key,
// secret }. Redirects are never followed (a redirect could lead somewhere
// the address check above never saw).
async function wooGet(credentials, apiPath, params = {}) {
  const storeUrl = normalizeStoreUrl(credentials.storeUrl);

  let response;
  try {
    response = await axios.get(`${storeUrl}/wp-json/wc/v3${apiPath}`, {
      params,
      auth: { username: credentials.key, password: credentials.secret },
      headers: { Accept: "application/json", "User-Agent": "SpearTick/1.0" },
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      maxContentLength: MAX_RESPONSE_BYTES,
      validateStatus: () => true,
      ...buildAgents(),
    });
  } catch (error) {
    throw mapNetworkError(error);
  }

  if (response.status < 200 || response.status >= 300) {
    throw mapStatusError(response.status);
  }
  return response;
}

// The site's public name, for showing "Connected to <name>". Optional: any
// failure just means the screen shows the address instead.
async function fetchStoreName(storeUrl) {
  try {
    const response = await axios.get(`${normalizeStoreUrl(storeUrl)}/wp-json/`, {
      params: { _fields: "name" },
      headers: { Accept: "application/json", "User-Agent": "SpearTick/1.0" },
      timeout: 8000,
      maxRedirects: 0,
      maxContentLength: 1024 * 1024,
      validateStatus: (status) => status === 200,
      ...buildAgents(),
    });
    return typeof response.data?.name === "string" ? response.data.name.slice(0, 120) : "";
  } catch {
    return "";
  }
}

// Proves the address and keys work by asking for one product, and returns
// what the screen needs: the cleaned address, the store's name and how many
// products it has.
async function verifyConnection({ storeUrl, key, secret }) {
  const cleanUrl = normalizeStoreUrl(storeUrl);
  const response = await wooGet({ storeUrl: cleanUrl, key, secret }, "/products", {
    per_page: 1,
    _fields: "id",
  });

  if (!Array.isArray(response.data)) {
    throw new StoreError(
      "NOT_WOOCOMMERCE",
      "This address answered, but not like a WooCommerce store. Check that you entered your shop's own address.",
    );
  }

  const total = Number(response.headers["x-wp-total"]);
  return {
    storeUrl: cleanUrl,
    storeName: await fetchStoreName(cleanUrl),
    productCount: Number.isFinite(total) ? total : response.data.length,
  };
}

module.exports = {
  StoreError,
  isPrivateAddress,
  normalizeStoreUrl,
  verifyConnection,
  wooGet,
};
