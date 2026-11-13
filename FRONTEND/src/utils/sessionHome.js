import { isTokenExpired } from "./jwt";

// Where a company user should land given their setup status and role.
// Previously this lived in the "/" redirect; "/" is now the public home page.
export function getCompanyHomePath(user, setupStatus) {
  if (setupStatus === "PLAN_SELECTION_REQUIRED") return "/billing";
  if (setupStatus === "WHATSAPP_ONBOARDING_REQUIRED" || setupStatus === "PAYMENT_REQUIRED") {
    return "/onboarding/whatsapp";
  }

  switch (user?.role) {
    case "ADMIN":
    case "CAMPAIGN_MANAGER":
    case "TEAM_LEAD":
      return "/dashboard";
    case "SUPPORT_AGENT":
      return "/inbox";
    default:
      return "/login";
  }
}

// The app entry for whoever is signed in on this browser, or null.
// Only a present, unexpired token counts — a leftover `user` object alone
// must never be treated as a session. Company sessions win over platform.
export function getActiveSessionPath({ token, user, setupStatus, platformToken }) {
  if (token && user && !isTokenExpired(token)) {
    return { path: getCompanyHomePath(user, setupStatus), label: "Open dashboard" };
  }
  if (platformToken && !isTokenExpired(platformToken)) {
    return { path: "/platform/dashboard", label: "Open admin console" };
  }
  return null;
}

// Where to send the user back to after they sign in again, so a timed-out
// session doesn't dump them on the dashboard. Read once by LoginPage.
const RETURN_PATH_KEY = "returnAfterLogin";

export function rememberReturnPath() {
  try {
    sessionStorage.setItem(RETURN_PATH_KEY, window.location.pathname + window.location.search);
  } catch {
    // ignore storage errors
  }
}

export function takeReturnPath() {
  try {
    const path = sessionStorage.getItem(RETURN_PATH_KEY);
    sessionStorage.removeItem(RETURN_PATH_KEY);
    // Only same-app paths, never the login/signup screens themselves.
    if (path && path.startsWith("/") && !path.startsWith("//") && !/^\/(login|signup)\b/.test(path)) return path;
  } catch {
    // ignore storage errors
  }
  return null;
}
