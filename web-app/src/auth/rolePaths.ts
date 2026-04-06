import { normalizeRole } from './roleUtils';

export function getRoleHomePath(role: string | null | undefined): string {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === 'admin') {
    return '/admin/dashboard';
  }

  if (normalizedRole === 'organizer') {
    return '/organizer/dashboard';
  }

  if (normalizedRole === 'volunteer') {
    return '/volunteer/home';
  }

  return '/unauthorized';
}
