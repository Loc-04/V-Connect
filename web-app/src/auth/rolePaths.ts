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

export function canRoleAccessPath(role: string | null | undefined, path: string | null | undefined): boolean {
  const normalizedRole = normalizeRole(role);
  const normalizedPath = typeof path === 'string' ? path.trim() : '';

  if (!normalizedRole || !normalizedPath || normalizedPath === '/unauthorized') {
    return false;
  }

  if (
    normalizedPath === '/' ||
    normalizedPath === '/browse' ||
    normalizedPath === '/feedback' ||
    normalizedPath.startsWith('/guest/') ||
    normalizedPath === '/about' ||
    /^\/volunteer\/activity\/[^/]+$/.test(normalizedPath)
  ) {
    return true;
  }

  if (normalizedPath === '/activities/create' || /^\/activities\/[^/]+\/edit$/.test(normalizedPath)) {
    return normalizedRole === 'organizer' || normalizedRole === 'admin';
  }

  if (normalizedPath.startsWith('/admin/')) {
    return normalizedRole === 'admin';
  }

  if (normalizedPath.startsWith('/organizer/')) {
    return normalizedRole === 'organizer';
  }

  if (normalizedPath.startsWith('/volunteer/')) {
    return normalizedRole === 'volunteer';
  }

  return true;
}
