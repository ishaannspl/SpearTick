import {
  BarChart3,
  ClipboardList,
  CreditCard,
  FileText,
  Megaphone,
  MessageSquareText,
  Send,
  Settings,
  Users,
} from "lucide-react";

// Single source of truth for company-app navigation (desktop + mobile).
export const NAV_GROUPS = [
  {
    label: "Insights",
    items: [{ id: "dashboard", icon: BarChart3, label: "Dashboard", path: "/dashboard" }],
  },
  {
    label: "Engage",
    items: [
      { id: "inbox", icon: MessageSquareText, label: "Inbox", path: "/inbox" },
      { id: "contacts", icon: Users, label: "Contacts", path: "/contacts" },
    ],
  },
  {
    label: "Grow",
    items: [
      {
        id: "campaigns",
        icon: Megaphone,
        label: "Campaigns",
        matchPrefix: "/campaigns",
        submenu: [
          { label: "Create campaign", path: "/campaigns/upload", icon: Send },
          { label: "Campaign history", path: "/campaigns/history", icon: ClipboardList },
        ],
      },
      // One templates area: a single list with a plain status, one
      // "New template" flow (see TemplatesPage.jsx).
      { id: "templates", icon: FileText, label: "Templates", path: "/templates", matchPrefix: "/templates" },
    ],
  },
  {
    label: "Account",
    items: [
      { id: "billing", icon: CreditCard, label: "Billing & plans", path: "/billing" },
      { id: "settings", icon: Settings, label: "Settings", path: "/settings" },
    ],
  },
];

export const ROLE_NAVIGATION = {
  ADMIN: ["dashboard", "inbox", "campaigns", "contacts", "templates", "billing", "settings"],
  CAMPAIGN_MANAGER: ["dashboard", "campaigns", "contacts", "templates"],
  SUPPORT_AGENT: ["inbox", "contacts"],
  TEAM_LEAD: ["dashboard", "inbox", "contacts"],
};

export const ROLE_LABELS = {
  ADMIN: "Admin",
  CAMPAIGN_MANAGER: "Campaign manager",
  SUPPORT_AGENT: "Support agent",
  TEAM_LEAD: "Team lead",
};

// What each role can do, in plain words (shown when adding a team member or
// changing a role). Must match ROLE_NAVIGATION above.
export const ROLE_DESCRIPTIONS = {
  ADMIN: "Everything, including billing, settings and the team.",
  TEAM_LEAD: "Replies in the inbox, assigns chats to agents, sees contacts and the dashboard. Can't send campaigns.",
  CAMPAIGN_MANAGER: "Sends campaigns, manages templates and contacts, sees reports. Doesn't use the inbox.",
  SUPPORT_AGENT: "Replies to customers in the inbox and manages contacts. Nothing else.",
};

export function getNavGroupsForRole(role) {
  const allowed = ROLE_NAVIGATION[role] || [];
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.includes(item.id)),
  })).filter((group) => group.items.length > 0);
}

export function getHomePathForRole(role) {
  const firstId = ROLE_NAVIGATION[role]?.[0];
  if (!firstId) return "/login";
  for (const group of NAV_GROUPS) {
    const item = group.items.find((entry) => entry.id === firstId);
    if (item) return item.path || item.submenu[0].path;
  }
  return "/login";
}

export function isItemActive(item, pathname) {
  if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
  return pathname === item.path;
}
