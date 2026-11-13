import { create } from "zustand";

// Server answers that mean "your plan doesn't allow this". The API layer
// raises them here and <UpgradePrompt /> shows one consistent popup with a
// way to upgrade, instead of each page showing its own raw error.
export const UPGRADE_CODES = new Set([
  "FEATURE_LOCKED",
  "USER_LIMIT_REACHED",
  "CONTACT_LIMIT_REACHED",
  "TEMPLATE_LIMIT_REACHED",
  "WHATSAPP_NUMBER_LIMIT_REACHED",
  "CAMPAIGN_LIMIT_REACHED",
  "TRIAL_EXPIRED",
  "SUBSCRIPTION_INACTIVE",
  "NO_SUBSCRIPTION",
  "NO_PLAN",
]);

const useUpgradePromptStore = create((set) => ({
  prompt: null, // { code, message }
  show: (prompt) => set({ prompt }),
  close: () => set({ prompt: null }),
}));

export default useUpgradePromptStore;
