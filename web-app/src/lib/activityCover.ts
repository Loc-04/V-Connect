export const DEFAULT_ACTIVITY_COVER_IMAGE_URL = '/assets/default_cover_img.png';

export function resolveActivityCoverImageUrl(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return DEFAULT_ACTIVITY_COVER_IMAGE_URL;
  }

  if (normalized.includes('/assets/default_cover_img.png')) {
    return DEFAULT_ACTIVITY_COVER_IMAGE_URL;
  }

  if (normalized.includes('/assets/v-connect-default-cover.svg')) {
    return DEFAULT_ACTIVITY_COVER_IMAGE_URL;
  }

  return normalized;
}
