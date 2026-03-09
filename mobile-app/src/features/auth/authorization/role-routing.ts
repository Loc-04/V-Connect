import type { UserRole } from '../types';
import { ROUTES } from '@/src/shared/constants/route-constants';

export function getHomeRouteForRole(role: UserRole): string {
  if (role === 'organizer' || role === 'admin') {
    return ROUTES.ORGANIZER.DASHBOARD;
  }
  return ROUTES.VOLUNTEER.HOME;
}

export function canAccessRouteGroup(role: UserRole, group: string | undefined): boolean {
  if (!group) return true;
  if (group === '(auth)') return false;
  if (role === 'organizer' || role === 'admin') {
    return group === '(organizer)';
  }
  return group === '(volunteer)';
}
