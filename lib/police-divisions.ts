/** Display labels for police_divisions.role values from the DB. */
export const POLICE_ROLE_DISPLAY: Record<
  string,
  { badge: string; description: string }
> = {
  gang_raids: {
    badge: "COMBAT",
    description: "Gang raids & tactical response",
  },
  tax_collection: {
    badge: "ENFORCEMENT",
    description: "Tax collection & evasion enforcement",
  },
  president_guard: {
    badge: "SECURITY",
    description: "Presidential protection detail",
  },
  anti_corruption: {
    badge: "INVESTIGATION",
    description: "Corruption & fraud investigation",
  },
  riot_control: {
    badge: "CROWD CONTROL",
    description: "Civil unrest & riot suppression",
  },
  patrol: {
    badge: "PATROL",
    description: "Division operations",
  },
};

function titleCaseRole(role: string): string {
  return role
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function policeRoleBadge(role?: string | null, roleLabel?: string | null): string {
  if (roleLabel?.trim()) return roleLabel.trim();
  const key = (role || "").trim().toLowerCase();
  return POLICE_ROLE_DISPLAY[key]?.badge ?? titleCaseRole(key || "patrol");
}

export function policeRoleDescription(
  role?: string | null,
  roleDescription?: string | null,
): string {
  if (roleDescription?.trim()) return roleDescription.trim();
  const key = (role || "").trim().toLowerCase();
  return POLICE_ROLE_DISPLAY[key]?.description ?? "Division operations";
}
