import { isPlainObject, isUuid } from '../common/utils/validators.js';

function normalizeParticipationCreatePayload(body) {
  if (!isPlainObject(body)) {
    throw new Error('Body must be a JSON object.');
  }

  const activityId = typeof body.activityId === 'string' ? body.activityId.trim() : '';
  if (!activityId) {
    throw new Error('activityId is required.');
  }
  if (!isUuid(activityId)) {
    throw new Error('activityId must be a valid UUID.');
  }

  return {
    activity_id: activityId,
  };
}

export { normalizeParticipationCreatePayload };
