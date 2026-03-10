const RESET_PASSWORD_PATH = '/reset-password';

export function getPasswordResetRedirectUrl(): string {
  const configuredUrl = import.meta.env.VITE_SUPABASE_PASSWORD_RESET_REDIRECT_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window === 'undefined') {
    return RESET_PASSWORD_PATH;
  }

  return `${window.location.origin}${RESET_PASSWORD_PATH}`;
}
