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

function normalizeNotificationUpdatePayload(body) {
  if (!isPlainObject(body)) {
    throw new Error('Body must be a JSON object.');
  }

  const payload = {};

  if (Object.hasOwn(body, 'userId') || Object.hasOwn(body, 'user_id')) {
    const userId =
      typeof body.userId === 'string'
        ? body.userId.trim()
        : typeof body.user_id === 'string'
          ? body.user_id.trim()
          : '';

    if (!userId) {
      throw new Error('userId cannot be empty.');
    }

    payload.userId = userId;
  }

  if (Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      throw new Error('title must be a non-empty string.');
    }

    payload.title = body.title.trim();
  }

  if (Object.hasOwn(body, 'message')) {
    if (typeof body.message !== 'string' || body.message.trim().length === 0) {
      throw new Error('message must be a non-empty string.');
    }

    payload.message = body.message.trim();
  }

  if (Object.hasOwn(body, 'type')) {
    if (typeof body.type !== 'string' || body.type.trim().length === 0) {
      throw new Error('type must be a non-empty string.');
    }

    payload.type = body.type.trim().toLowerCase();
  }

  if (Object.hasOwn(body, 'data')) {
    if (body.data !== null && typeof body.data !== 'object') {
      throw new Error('data must be an object or null.');
    }

    payload.data = body.data ?? {};
  }

  if (Object.hasOwn(body, 'readAt') || Object.hasOwn(body, 'read_at')) {
    const readAt = Object.hasOwn(body, 'readAt') ? body.readAt : body.read_at;
    if (readAt !== null && (typeof readAt !== 'string' || Number.isNaN(new Date(readAt).getTime()))) {
      throw new Error('readAt must be a valid ISO date string or null.');
    }

    payload.readAt = readAt === null ? null : new Date(readAt).toISOString();
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('At least one field is required to update the notification.');
  }

  return payload;
}

export { normalizeNotificationPayload, normalizeNotificationUpdatePayload };
