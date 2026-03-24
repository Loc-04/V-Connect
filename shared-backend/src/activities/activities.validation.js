import { validActivityStatuses } from '../config/constants.js';
import { isPlainObject, normalizeStringArray, toIsoDateString } from '../common/utils/validators.js';

function normalizeActivityLocation(value) {
  if (typeof value === 'string') {
    const address = value.trim();
    if (!address) {
      throw new Error('location cannot be empty.');
    }

    return {
      address,
      city: '',
      lat: 0,
      lng: 0,
    };
  }

  if (!isPlainObject(value)) {
    throw new Error('location must be an object or string.');
  }

  const address = typeof value.address === 'string' ? value.address.trim() : '';
  if (!address) {
    throw new Error('location.address is required.');
  }

  const city = typeof value.city === 'string' ? value.city.trim() : '';
  const lat = Number(value.lat ?? 0);
  const lng = Number(value.lng ?? 0);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('location.lat and location.lng must be numbers.');
  }

  return {
    address,
    city,
    lat,
    lng,
  };
}

function normalizeActivityPayload(body, { partial = false } = {}) {
  if (!isPlainObject(body)) {
    throw new Error('Body must be a JSON object.');
  }

  const payload = {};

  if (Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string') {
      throw new Error('title must be a string.');
    }
    const title = body.title.trim();
    if (!title) {
      throw new Error('title cannot be empty.');
    }
    payload.title = title;
  } else if (!partial) {
    throw new Error('title is required.');
  }

  if (Object.hasOwn(body, 'description')) {
    if (typeof body.description !== 'string') {
      throw new Error('description must be a string.');
    }
    payload.description = body.description.trim();
  } else if (!partial) {
    payload.description = '';
  }

  if (Object.hasOwn(body, 'location')) {
    payload.location = normalizeActivityLocation(body.location);
  } else if (!partial) {
    payload.location = {
      address: 'TBD',
      city: '',
      lat: 0,
      lng: 0,
    };
  }

  if (Object.hasOwn(body, 'startTime')) {
    payload.start_time = toIsoDateString(body.startTime, 'startTime');
  } else if (!partial) {
    throw new Error('startTime is required.');
  }

  if (Object.hasOwn(body, 'endTime')) {
    payload.end_time = toIsoDateString(body.endTime, 'endTime');
  } else if (!partial) {
    throw new Error('endTime is required.');
  }

  if (Object.hasOwn(body, 'capacity')) {
    const capacity = Number(body.capacity);
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('capacity must be a positive integer.');
    }
    payload.capacity = capacity;
  } else if (!partial) {
    throw new Error('capacity is required.');
  }

  if (Object.hasOwn(body, 'requiredSkills')) {
    payload.required_skills = normalizeStringArray(body.requiredSkills, 'requiredSkills');
  } else if (!partial) {
    payload.required_skills = [];
  }

  if (Object.hasOwn(body, 'status')) {
    if (typeof body.status !== 'string') {
      throw new Error('status must be a string.');
    }
    const normalizedStatus = body.status.trim().toLowerCase();
    if (!validActivityStatuses.has(normalizedStatus)) {
      throw new Error(`Invalid status. Allowed: ${Array.from(validActivityStatuses).join(', ')}`);
    }
    payload.status = normalizedStatus;
  } else if (!partial) {
    payload.status = 'draft';
  }

  if (Object.hasOwn(body, 'provinceCode')) {
    if (body.provinceCode != null && typeof body.provinceCode !== 'string') {
      throw new Error('provinceCode must be a string or null.');
    }
    payload.province_code = body.provinceCode ? body.provinceCode.trim() : null;
  }

  if (Object.hasOwn(body, 'wardCode')) {
    if (body.wardCode != null && typeof body.wardCode !== 'string') {
      throw new Error('wardCode must be a string or null.');
    }
    payload.ward_code = body.wardCode ? body.wardCode.trim() : null;
  }

  if (partial && Object.keys(payload).length === 0) {
    throw new Error('No valid activity fields provided.');
  }

  const hasBothTimeValues = Object.hasOwn(payload, 'start_time') && Object.hasOwn(payload, 'end_time');
  if (hasBothTimeValues) {
    const startTime = new Date(payload.start_time);
    const endTime = new Date(payload.end_time);
    if (endTime <= startTime) {
      throw new Error('endTime must be later than startTime.');
    }
  }

  return payload;
}

export { normalizeActivityLocation, normalizeActivityPayload };
