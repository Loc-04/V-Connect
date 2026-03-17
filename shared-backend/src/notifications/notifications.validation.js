import { isPlainObject } from '../common/utils/validators.js';

function normalizeNotificationPayload(body) {
  if (!isPlainObject(body)) {
    throw new Error('Body must be a JSON object.');
  }

  const userId =
    typeof body.userId === 'string'
      ? body.userId.trim()
      : typeof body.user_id === 'string'
        ? body.user_id.trim()
        : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const type =
    typeof body.type === 'string' && body.type.trim().length > 0 ? body.type.trim().toLowerCase() : 'info';
  const data = body.data ?? {};

  if (!title) {
    throw new Error('title is required.');
  }
  if (!message) {
    throw new Error('message is required.');
  }
  if (data !== null && typeof data !== 'object') {
    throw new Error('data must be an object.');
  }

  return {
    userId,
    title,
    message,
    type,
    data: data ?? {},
  };
}

export { normalizeNotificationPayload };
