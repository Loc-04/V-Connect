import { ACTIVITY_DEFAULT_COVER_IMAGE_URL } from '../config/env.js';

function resolveActivityCoverImageUrl(value) {
  if (typeof value === 'string' && value.trim().length > 0) {
    const normalized = value.trim();
    if (normalized.includes('/assets/default_cover_img.png')) {
      return ACTIVITY_DEFAULT_COVER_IMAGE_URL;
    }
    if (normalized.includes('/assets/v-connect-default-cover.svg')) {
      return ACTIVITY_DEFAULT_COVER_IMAGE_URL;
    }
    return normalized;
  }
  return ACTIVITY_DEFAULT_COVER_IMAGE_URL;
}

function withResolvedActivityCoverImage(activity) {
  if (!activity || typeof activity !== 'object' || Array.isArray(activity)) {
    return activity;
  }

  return {
    ...activity,
    cover_image_url: resolveActivityCoverImageUrl(activity.cover_image_url),
  };
}

function mapActivitiesWithResolvedCoverImage(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => withResolvedActivityCoverImage(row));
}

export { resolveActivityCoverImageUrl, withResolvedActivityCoverImage, mapActivitiesWithResolvedCoverImage };
