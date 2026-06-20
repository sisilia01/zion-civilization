export function formatTimeUS(date: Date | string | number): string {
  const d = typeof date === "object" ? date : new Date(date);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDateTimeUS(date: Date | string | number): string {
  const d = typeof date === "object" ? date : new Date(date);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
