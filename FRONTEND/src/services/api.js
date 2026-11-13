import axios from "axios";
import toast from "react-hot-toast";
import { rememberReturnPath } from "../utils/sessionHome";
import useUpgradePromptStore, { UPGRADE_CODES } from "../store/upgradePromptStore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,

  (error) => {
    const isAuthRequest = /\/api\/auth\/(login|register-company)/.test(
      error.config?.url || "",
    );

    // A 401 from login/register itself is just "wrong credentials" or a
    // validation failure — the calling page's own catch block handles that
    // with a toast. It must never trigger the session-expiry hard reload
    // below (that reload is only for an ALREADY-logged-in session's token
    // expiring mid-use). LoginPage.jsx currently uses raw axios and isn't
    // affected by this, but this guard makes the interceptor itself safe
    // regardless of which axios instance a future auth call goes through.
    if (error.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("setupStatus");

      if (!window.location.pathname.startsWith("/login")) {
        rememberReturnPath();
        toast.error("Your session has expired. Please log in again.");
      }

      window.location.href = "/login";
    } else if (error.response?.status === 403) {
      const code = error.response?.data?.code;
      const currentPath = window.location.pathname;

      if (UPGRADE_CODES.has(code)) {
        useUpgradePromptStore.getState().show({
          code,
          message: error.response.data.message || "Your current plan doesn't include this.",
        });
      }

      if (
        code === "PLAN_SELECTION_REQUIRED" &&
        !currentPath.startsWith("/billing") &&
        !currentPath.startsWith("/pricing")
      ) {
        window.location.href = "/billing";
      } else if (
        (code === "WHATSAPP_ONBOARDING_REQUIRED" ||
          code === "PAYMENT_METHOD_REQUIRED") &&
        !currentPath.startsWith("/onboarding") &&
        !currentPath.startsWith("/whatsapp-onboarding") &&
        !currentPath.startsWith("/billing") &&
        !currentPath.startsWith("/pricing")
      ) {
        window.location.href = "/onboarding/whatsapp";
      }
    }

    return Promise.reject(error);
  },
);

export async function refreshAuthToken() {
  const { data } = await api.post("/api/auth/refresh");
  return data.token;
}

export async function fetchConversations({ before, limit, phoneNumberId } = {}) {
  const { data } = await api.get("/api/conversations", {
    params: { before, limit, phoneNumberId },
  });
  return data; // { conversations, hasMore, nextCursor }
}

export async function fetchMessages(conversationId, { before, limit = 50 } = {}) {
  const { data } = await api.get(`/api/messages/${conversationId}`, {
    params: { before, limit },
  });
  return data; // { messages, hasMore, nextCursor }
}

export async function markConversationRead(conversationId) {
  const { data } = await api.patch(`/api/conversations/${conversationId}/read`);
  return data;
}

// No fallback on failure: saving the message without sending it would show
// the agent a "sent" tick for a message the customer never received.
export async function sendInboxMessage(payload) {
  const { data } = await api.post("/api/send-message", payload);
  return data;
}

// Sends an approved template in a chat (after the 24-hour window, or to start
// a new chat with `phone` instead of `conversationId`).
export async function sendInboxTemplate(payload) {
  const { data } = await api.post("/api/send-template", payload);
  return data;
}

// Sends a photo, video or PDF in a chat.
export async function sendInboxMedia({ conversationId, file, caption }) {
  const form = new FormData();
  form.append("conversationId", conversationId);
  form.append("caption", caption || "");
  form.append("file", file);
  const { data } = await api.post("/api/send-media", form, { timeout: 90000 });
  return data;
}

// The latest chat with a phone number; rejects with 404 when there is none.
export async function findConversationByPhone(phone) {
  const { data } = await api.get("/api/conversations/find", { params: { phone } });
  return data;
}

// An agent takes an unassigned chat.
export async function takeConversation(conversationId) {
  const { data } = await api.patch(`/api/conversations/${conversationId}/take`);
  return data;
}

export async function fetchQuickReplies() {
  const { data } = await api.get("/api/companies/quick-replies");
  return data.quickReplies || [];
}

export async function saveQuickReplies(quickReplies) {
  const { data } = await api.put("/api/companies/quick-replies", { quickReplies });
  return data.quickReplies || [];
}

export async function toggleConversationAi(conversationId, aiEnabled) {
  try {
    const { data } = await api.patch(
      `/api/conversations/${conversationId}/toggle-ai`,
      { aiEnabled },
    );
    return data;
  } catch {
    return { success: false, aiEnabled };
  }
}

export async function updateContactTags(contactId, tags) {
  const response = await api.patch(`/api/messages/contacts/${contactId}/tags`, {
    tags,
  });

  return response.data;
}

export async function updateContactConsent(contactId, optedOut) {
  const response = await api.patch(
    `/api/messages/contacts/${contactId}/consent`,
    {
      optedOut,
    },
  );

  return response.data;
}

export async function assignConversation(conversationId, agentId) {
  const { data } = await api.patch(
    `/api/conversations/${conversationId}/assign`,
    { agentId },
  );
  return data;
}

export async function fetchContacts(params = {}) {
  const { data } = await api.get("/api/contacts", { params });
  return data;
}

export async function fetchContact(id) {
  const { data } = await api.get(`/api/contacts/${id}`);
  return data;
}

export async function createContact(payload) {
  const { data } = await api.post("/api/contacts", payload);
  return data;
}

export async function updateContact(id, payload) {
  const { data } = await api.patch(`/api/contacts/${id}`, payload);
  return data;
}

export async function deleteContact(id) {
  const { data } = await api.delete(`/api/contacts/${id}`);
  return data;
}

export async function bulkDeleteContacts(ids) {
  const { data } = await api.post("/api/contacts/bulk-delete", { ids });
  return data;
}

export async function bulkUpdateContactTags({ ids, tags, action }) {
  const { data } = await api.patch("/api/contacts/bulk-tags", {
    ids,
    tags,
    action,
  });
  return data;
}

export async function importContacts(file, segmentId) {
  const formData = new FormData();
  formData.append("file", file);
  if (segmentId) formData.append("segmentId", segmentId);
  const { data } = await api.post("/api/contacts/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function fetchCostSummary() {
  const { data } = await api.get("/api/campaigns/cost-summary");
  return data;
}

export async function duplicateCampaign(campaignId) {
  const { data } = await api.post(`/api/campaigns/${campaignId}/duplicate`);
  return data;
}

export async function pauseCampaign(campaignId) {
  const { data } = await api.post(`/api/campaigns/${campaignId}/pause`);
  return data;
}

export async function resumeCampaign(campaignId, scheduleAt) {
  const { data } = await api.post(`/api/campaigns/${campaignId}/resume`, {
    scheduleAt,
  });
  return data;
}

export async function cancelCampaign(campaignId) {
  const { data } = await api.post(`/api/campaigns/${campaignId}/cancel`);
  return data;
}

// Per-message rates for the cost estimate shown before sending a campaign.
export async function fetchCampaignRates() {
  const { data } = await api.get("/api/campaigns/rates");
  return data;
}

export async function fetchMetaPricing(range = "30d") {
  const { data } = await api.get("/api/meta-account/pricing", {
    params: { range },
  });
  return data;
}

export async function fetchPricingConfig() {
  const { data } = await api.get("/api/settings/pricing");
  return data;
}

export async function updatePricingConfig(payload) {
  const { data } = await api.put("/api/settings/pricing", payload);
  return data;
}

export async function registerCompany(payload) {
  const { data } = await api.post("/api/auth/register-company", payload);
  return data;
}

// Online store (WooCommerce) connection. The server never returns the key or
// secret, only a hint such as "ck_...a1b2".
export async function fetchStoreConnection() {
  const { data } = await api.get("/api/store");
  return data;
}

export async function connectStore(payload) {
  const { data } = await api.post("/api/store/connect", payload, { timeout: 40000 });
  return data;
}

export async function testStoreConnection() {
  const { data } = await api.post("/api/store/test", {}, { timeout: 40000 });
  return data;
}

export async function disconnectStore() {
  const { data } = await api.delete("/api/store");
  return data;
}

export async function fetchWhatsAppStatus() {
  const { data } = await api.get("/api/companies/whatsapp-status");
  return data;
}

export async function fetchWhatsAppConnectionStatus() {
  const { data } = await api.get("/api/company/whatsapp/status");
  return data;
}

export async function completeEmbeddedSignup(payload) {
  const { data } = await api.post(
    "/api/company/whatsapp/embedded-signup/complete",
    payload,
    { timeout: 45000 },
  );
  return data;
}

export async function fetchWhatsAppNumbers() {
  const { data } = await api.get("/api/company/whatsapp/numbers");
  return data;
}

export async function syncWhatsAppNumbers() {
  const { data } = await api.post("/api/company/whatsapp/numbers/sync", null, { timeout: 30000 });
  return data;
}

export async function setDefaultWhatsAppNumber(phoneNumberId) {
  const { data } = await api.put("/api/company/whatsapp/numbers/default", { phoneNumberId });
  return data;
}

export async function connectWhatsApp(payload) {
  const { data } = await api.post("/api/companies/connect-whatsapp", payload);
  return data;
}

export async function disconnectWhatsApp() {
  const { data } = await api.post("/api/companies/disconnect-whatsapp");
  return data;
}

export async function fetchTemplateCategories() {
  const { data } = await api.get("/api/template-categories");
  return data.categories || [];
}

export async function fetchSegments() {
  const { data } = await api.get("/api/segments");
  return data;
}

export async function createSegment(payload) {
  const { data } = await api.post("/api/segments", payload);
  return data;
}

export async function deleteSegment(id) {
  const { data } = await api.delete(`/api/segments/${id}`);
  return data;
}

export async function fetchSegmentContacts(id) {
  const { data } = await api.get(`/api/segments/${id}/contacts`);
  return data;
}

export async function addContactsToSegment(id, contactIds) {
  const { data } = await api.post(`/api/segments/${id}/contacts`, {
    contactIds,
  });
  return data;
}

export async function removeContactFromSegment(id, contactId) {
  const { data } = await api.delete(
    `/api/segments/${id}/contacts/${contactId}`,
  );
  return data;
}

export async function fetchContactSegmentationStats() {
  const { data } = await api.get("/api/contacts/stats/segmentation");
  return data;
}

export async function fetchAgents() {
  const { data } = await api.get("/api/users");
  const list = Array.isArray(data) ? data : data.users || [];
  return list.filter((u) => u.role === "SUPPORT_AGENT");
}

export async function fetchPlans() {
  const { data } = await api.get("/api/plans");
  return data;
}

export async function fetchMySubscription() {
  const { data } = await api.get("/api/subscription/me");
  return data;
}

export async function fetchPlanAccess() {
  const { data } = await api.get("/api/subscription/plan-access");
  return data;
}

export async function selectPlan(payload) {
  const { data } = await api.patch("/api/subscription/me", payload);
  return data;
}

export async function endTrial() {
  const { data } = await api.post("/api/subscription/me/end-trial");
  return data;
}

export async function fetchCompanySetupStatus() {
  const { data } = await api.get("/api/company/setup-status");
  return data;
}

export async function checkWhatsAppHealth() {
  const { data } = await api.get("/api/company/whatsapp/health-check", {
    timeout: 15000,
  });
  return data;
}

export default api;
export { API_BASE_URL };

