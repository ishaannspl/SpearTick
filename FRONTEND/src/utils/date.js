export function formatRelativeDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en", { weekday: "short" });
  return d.toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Returns dynamic activity presence for WhatsApp contacts.
 * Since Meta's WhatsApp Cloud API does not expose raw online/offline presence for
 * consumer privacy reasons, presence is derived dynamically from the contact's
 * most recent interaction (lastMessageTime / read receipt).
 */
export function getActivityStatus(lastMessageTime, isExplicitOnline = false) {
  if (isExplicitOnline) {
    return {
      isOnline: true,
      label: "Active now",
      shortLabel: "Online",
    };
  }

  if (!lastMessageTime) {
    return {
      isOnline: false,
      label: "Offline",
      shortLabel: "Offline",
    };
  }

  const d = new Date(lastMessageTime);
  const time = d.getTime();
  if (isNaN(time)) {
    return {
      isOnline: false,
      label: "Offline",
      shortLabel: "Offline",
    };
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - time);
  const diffMinutes = Math.floor(diffMs / (60 * 1000));

  // Active within the last 15 minutes
  if (diffMinutes < 15) {
    return {
      isOnline: true,
      label: diffMinutes <= 1 ? "Active just now" : `Active ${diffMinutes}m ago`,
      shortLabel: "Active recently",
    };
  }

  // Active within the last hour
  if (diffMinutes < 60) {
    return {
      isOnline: false,
      label: `Last active ${diffMinutes}m ago`,
      shortLabel: `${diffMinutes}m ago`,
    };
  }

  // Active today
  const nowDate = new Date(now);
  const isToday =
    d.getDate() === nowDate.getDate() &&
    d.getMonth() === nowDate.getMonth() &&
    d.getFullYear() === nowDate.getFullYear();

  const timeString = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) {
    return {
      isOnline: false,
      label: `Last active today at ${timeString}`,
      shortLabel: `Today ${timeString}`,
    };
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return {
      isOnline: false,
      label: `Last active yesterday at ${timeString}`,
      shortLabel: `Yesterday`,
    };
  }

  // Older than yesterday
  const dateString = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return {
    isOnline: false,
    label: `Last active ${dateString}`,
    shortLabel: dateString,
  };
}

