// Small per-company flags for the dashboard "Get started" checklist that the
// server doesn't track (e.g. "sent yourself a test message"). Browser-only
// conveniences: losing them just re-shows a checklist step.

const key = (companyId, name) => `wg:${name}:${companyId || "default"}`;

function read(name, companyId) {
  try {
    return localStorage.getItem(key(companyId, name)) === "1";
  } catch {
    return false;
  }
}

function write(name, companyId, on = true) {
  try {
    if (on) localStorage.setItem(key(companyId, name), "1");
    else localStorage.removeItem(key(companyId, name));
  } catch {
    // ignore storage errors
  }
}

export const hasSentTest = (companyId) => read("testSent", companyId);
export const markTestSent = (companyId) => write("testSent", companyId);

export const isChecklistHidden = (companyId) => read("checklistHidden", companyId);
export const setChecklistHidden = (companyId, hidden) => write("checklistHidden", companyId, hidden);
