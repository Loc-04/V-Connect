import { validActivityStatuses } from '../config/constants.js';
import { isPlainObject, normalizeStringArray, toIsoDateString } from '../common/utils/validators.js';
import { normalizeActivityMapLocation } from '../locations/locations.validation.js';
import { resolveActivityCoverImageUrl } from './activities.cover.js';

const allowedCoverImageMimeTypes = new Set(['image/png', 'image/jpeg', 'image/gif']);
const maxCoverImageBytes = 700 * 1024;
const validSkillRequirementPriorities = new Set(['low', 'normal', 'urgent']);

function normalizeCoverImageUrl(value) {
  if (value == null) {
    return resolveActivityCoverImageUrl(null);
  }

  if (typeof value !== 'string') {
    throw new Error('coverImageUrl must be a string or null.');
  }

  const normalized = value.trim();
  if (!normalized) {
    return resolveActivityCoverImageUrl(null);
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const dataUrlMatch = normalized.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!dataUrlMatch) {
    throw new Error('coverImageUrl must be an HTTP URL or base64 image data URL.');
  }

  const mimeType = dataUrlMatch[1].toLowerCase();
  if (!allowedCoverImageMimeTypes.has(mimeType)) {
    throw new Error('coverImageUrl must be PNG, JPG, or GIF.');
  }

  const base64Payload = dataUrlMatch[2];
  const paddingBytes = base64Payload.endsWith('==') ? 2 : base64Payload.endsWith('=') ? 1 : 0;
  const fileSizeBytes = Math.floor((base64Payload.length * 3) / 4) - paddingBytes;
  if (fileSizeBytes > maxCoverImageBytes) {
    throw new Error('Cover image must be smaller than 700KB.');
  }

  return normalized;
}

function normalizeActivityLocation(value) {
  if (typeof value === 'string') {
    const address = value.trim();
    if (!address) {
      throw new Error('location cannot be empty.');
    }

    return {
      address,
      city: '',
      province: '',
      ward: '',
      formattedAddress: address,
      mapProvider: null,
      geocodedAt: null,
      geocodeConfidence: null,
      lat: null,
      lng: null,
    };
  }

  if (!isPlainObject(value)) {
    throw new Error('location must be an object or string.');
  }

  const normalizedLocation = normalizeActivityMapLocation(value);
  const address = normalizedLocation.address;
  if (!address) {
    throw new Error('location.address is required.');
  }

  return {
    address,
    city: normalizedLocation.city,
    province: normalizedLocation.province,
    ward: normalizedLocation.ward,
    formattedAddress: normalizedLocation.formattedAddress || address,
    mapProvider: normalizedLocation.mapProvider || null,
    geocodedAt: normalizedLocation.geocodedAt || null,
    geocodeConfidence: normalizedLocation.geocodeConfidence,
    lat: normalizedLocation.lat,
    lng: normalizedLocation.lng,
  };
}

function normalizeSkillRequirements(value) {
  if (!Array.isArray(value)) {
    throw new Error('skillRequirements must be an array.');
  }

  const normalized = [];
  const seenSkills = new Set();

  value.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`skillRequirements[${index}] must be an object.`);
    }

    const skill = typeof item.skill === 'string' ? item.skill.trim() : '';
    if (!skill) {
      throw new Error(`skillRequirements[${index}].skill is required.`);
    }

    const key = skill.toLowerCase();
    if (seenSkills.has(key)) {
      throw new Error(`Duplicate skill in skillRequirements: "${skill}".`);
    }
    seenSkills.add(key);

    const priorityRaw = typeof item.priority === 'string' ? item.priority.trim().toLowerCase() : 'normal';
    if (!validSkillRequirementPriorities.has(priorityRaw)) {
      throw new Error(`skillRequirements[${index}].priority must be one of: low, normal, urgent.`);
    }

    normalized.push({
      skill,
      priority: priorityRaw,
    });
  });

  return normalized;
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

  if (Object.hasOwn(body, 'coverImageUrl')) {
    payload.cover_image_url = normalizeCoverImageUrl(body.coverImageUrl);
  } else if (!partial) {
    payload.cover_image_url = resolveActivityCoverImageUrl(null);
  }

  if (Object.hasOwn(body, 'location')) {
    payload.location = normalizeActivityLocation(body.location);
  } else if (!partial) {
    throw new Error('location is required.');
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

  if (Object.hasOwn(body, 'skillRequirements')) {
    const normalizedSkillRequirements = normalizeSkillRequirements(body.skillRequirements);
    payload.required_skills = normalizedSkillRequirements.map((item) => item.skill);
  } else if (Object.hasOwn(body, 'requiredSkills')) {
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
  } else if (!partial) {
    throw new Error('provinceCode is required.');
  }

  if (Object.hasOwn(body, 'wardCode')) {
    if (body.wardCode != null && typeof body.wardCode !== 'string') {
      throw new Error('wardCode must be a string or null.');
    }
    payload.ward_code = body.wardCode ? body.wardCode.trim() : null;
  } else if (!partial) {
    throw new Error('wardCode is required.');
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
