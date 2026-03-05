export function getRoleHomePath(role: string | null | undefined): string {
  if (role === 'admin') {
    return '/admin/dashboard';
  }

  if (role === 'organizer') {
    return '/organizer/dashboard';
  }

  if (role === 'volunteer') {
    return '/volunteer/home';
  }

  return '/unauthorized';
}
