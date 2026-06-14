const ACTIVITY_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

/** Strict event_type sets for Governance Activity Log branches. */
export const GOVERNANCE_EVENT_TYPES = {
  president: ["president"],
  sheriff: ["sheriff"],
  senate: ["senate"],
  zrs: ["zrs", "frs_chief", "central_bank"],
} as const;

export type GovernanceActivityBranch = keyof typeof GOVERNANCE_EVENT_TYPES;

export function matchesGovernanceEventType(
  eventType: string | undefined,
  branch: GovernanceActivityBranch,
): boolean {
  const t = String(eventType ?? "").toLowerCase();
  return (GOVERNANCE_EVENT_TYPES[branch] as readonly string[]).includes(t);
}

export function shouldShowActivityEntry(cleanedDesc: string): boolean {
  if (!cleanedDesc) return false;
  if (cleanedDesc.startsWith("[TICK #")) return false;
  if (/FRS Chief corp QE:\s*0\s+ZION\s+to\s+0\s+corporations/i.test(cleanedDesc)) return false;
  if (/FRS Chief.*QE:\s*0\s+ZION\s+to\s+0\s+corporations/i.test(cleanedDesc)) return false;
  return true;
}

export function filterAndDedupeActivityLog<T extends { description: string; created_at: string }>(
  entries: T[],
  cleanDescription: (desc: string) => string,
  windowMs = ACTIVITY_DEDUPE_WINDOW_MS,
): T[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const result: T[] = [];

  for (const entry of sorted) {
    const desc = cleanDescription(entry.description);
    if (!shouldShowActivityEntry(desc)) continue;

    const t = new Date(entry.created_at).getTime();
    const hasRecentDup = result.some((kept) => {
      if (cleanDescription(kept.description) !== desc) return false;
      const kt = new Date(kept.created_at).getTime();
      return Number.isFinite(t) && Number.isFinite(kt) && Math.abs(kt - t) <= windowMs;
    });
    if (hasRecentDup) continue;

    result.push(entry);
  }

  return result;
}

export function filterGovernanceBranchLog<T extends { description: string; created_at: string; event_type?: string }>(
  entries: T[],
  branch: GovernanceActivityBranch,
  cleanDescription: (desc: string) => string,
  windowMs = ACTIVITY_DEDUPE_WINDOW_MS,
): T[] {
  const typed = entries.filter(
    (e) => !e.event_type || matchesGovernanceEventType(e.event_type, branch),
  );
  return filterAndDedupeActivityLog(typed, cleanDescription, windowMs);
}
