import { createHash } from 'crypto';

import { CHECKIN_CODE_SALT } from '../config/env.js';

function normalizeCheckInCode(value) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .trim();
}

function formatCheckInCode(value) {
  const normalized = normalizeCheckInCode(value);
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, 5).padStart(5, '0');
}

function generateCheckInCode(participationId) {
  const normalizedParticipationId = String(participationId ?? '').trim().toLowerCase();
  if (!normalizedParticipationId) {
    return '';
  }

  const digest = createHash('sha256')
    .update(`${normalizedParticipationId}:${CHECKIN_CODE_SALT}`)
    .digest('hex');

  const numericSeed = Number.parseInt(digest.slice(0, 12), 16);
  const codeValue = Number.isFinite(numericSeed) ? numericSeed % 100000 : 0;
  return String(codeValue).padStart(5, '0');
}

function toLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameCalendarDate(left, right = new Date()) {
  const leftKey = toLocalDateKey(left);
  const rightKey = toLocalDateKey(right);
  return Boolean(leftKey) && leftKey === rightKey;
}

export { formatCheckInCode, generateCheckInCode, isSameCalendarDate, normalizeCheckInCode, toLocalDateKey };
