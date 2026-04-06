export const APP_ROLES = ['admin', 'organizer', 'volunteer'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function normalizeRole(role: string | null | undefined): string {
  return String(role ?? '').trim().toLowerCase();
}

export function normalizeRoleList(roles: readonly string[]): string[] {
  return roles.map((role) => normalizeRole(role)).filter((role) => role.length > 0);
}

export function getRoleLabel(role: string | null | undefined, fallback: string): string {
  const normalized = normalizeRole(role);
  if (!normalized) {
    return fallback;
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

