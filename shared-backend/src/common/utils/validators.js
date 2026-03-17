function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings.`);
  }

  const normalized = value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  if (normalized.length !== value.length) {
    throw new Error(`${fieldName} contains invalid empty values.`);
  }

  return normalized;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toIsoDateString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be an ISO date string.`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return parsed.toISOString();
}

export { isPlainObject, normalizeStringArray, isValidEmail, isUuid, toIsoDateString };
