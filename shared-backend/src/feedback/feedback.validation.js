import { isPlainObject, isUuid } from '../common/utils/validators.js';

function normalizeFeedbackPayload(body) {
  if (!isPlainObject(body)) {
    throw new Error('Body must be a JSON object.');
  }

  const participationId =
    typeof body.participationId === 'string'
      ? body.participationId.trim()
      : typeof body.participation_id === 'string'
        ? body.participation_id.trim()
        : '';
  if (!participationId) {
    throw new Error('participationId is required.');
  }
  if (!isUuid(participationId)) {
    throw new Error('participationId must be a valid UUID.');
  }

  const commentRaw =
    typeof body.comment === 'string'
      ? body.comment
      : typeof body.message === 'string'
        ? body.message
        : '';
  const comment = commentRaw.trim();
  if (!comment) {
    throw new Error('comment is required.');
  }
  if (comment.length > 2000) {
    throw new Error('comment must be 2000 characters or fewer.');
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('rating must be an integer between 1 and 5.');
  }

  return {
    participation_id: participationId,
    rating,
    comment,
  };
}

export { normalizeFeedbackPayload };
