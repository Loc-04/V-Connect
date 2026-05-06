import { isPlainObject } from '../common/utils/validators.js';

const FULL_NAME_MIN_LENGTH = 2;
const FULL_NAME_MAX_LENGTH = 50;
const PHONE_PREFIXES = new Set(['03', '05', '07', '08', '09']);

const FRIENDLY_MESSAGES = {
  required: 'All fields are required.',
  fullName: 'Full name must be 2–50 characters and contain only letters',
  phone: 'Invalid phone number format',
  email: 'Email is not valid',
  password:
    'Password must be at least 8 characters and include uppercase, lowercase, number and special character',
  confirmPassword: 'Passwords do not match',
};

function sanitizeInput(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

function isValidFullName(fullName) {
  if (fullName.length < FULL_NAME_MIN_LENGTH || fullName.length > FULL_NAME_MAX_LENGTH) {
    return false;
  }

  if (/\s{2,}/.test(fullName)) {
    return false;
  }

  if (!/^[A-Za-z ]+$/.test(fullName)) {
    return false;
  }

  const normalized = fullName.replace(/\s/g, '').toLowerCase();
  if (!normalized) {
    return false;
  }

  // Reject repeated-character spam names like "aaa".
  if (/^([a-z])\1+$/.test(normalized)) {
    return false;
  }

  return true;
}

function isValidVietnamPhone(phone) {
  if (!/^\d{10}$/.test(phone)) {
    return false;
  }

  return PHONE_PREFIXES.has(phone.slice(0, 2));
}

function isValidEmail(email) {
  if (!email || /\s/.test(email)) {
    return false;
  }

  const atCount = (email.match(/@/g) ?? []).length;
  if (atCount !== 1) {
    return false;
  }

  const emailRegex = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
  if (!emailRegex.test(email)) {
    return false;
  }

  const [, domain] = email.split('@');
  if (!domain) {
    return false;
  }

  const labels = domain.split('.');
  return labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
}

function isValidPassword(password) {
  if (password.length < 8) {
    return false;
  }

  if (/\s/.test(password)) {
    return false;
  }

  return /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function normalizeRegistrationPayload(body) {
  if (!isPlainObject(body)) {
    throw new Error(FRIENDLY_MESSAGES.required);
  }

  const fullName = sanitizeInput(body.fullName);
  const phone = sanitizeInput(body.phone);
  const email = sanitizeInput(body.email).toLowerCase();
  const password = sanitizeInput(body.password);
  const confirmPassword = sanitizeInput(body.confirmPassword);
  const role = sanitizeInput(body.role).toLowerCase();

  if (!fullName || !phone || !email || !password || !confirmPassword || !role) {
    throw new Error(FRIENDLY_MESSAGES.required);
  }

  if (!isValidFullName(fullName)) {
    throw new Error(FRIENDLY_MESSAGES.fullName);
  }

  if (!isValidVietnamPhone(phone)) {
    throw new Error(FRIENDLY_MESSAGES.phone);
  }

  if (!isValidEmail(email)) {
    throw new Error(FRIENDLY_MESSAGES.email);
  }

  if (!isValidPassword(password)) {
    throw new Error(FRIENDLY_MESSAGES.password);
  }

  if (password !== confirmPassword) {
    throw new Error(FRIENDLY_MESSAGES.confirmPassword);
  }

  return {
    fullName,
    phone,
    email,
    password,
    confirmPassword,
    role,
  };
}

function normalizeProfileSeedPayload(body) {
  if (!isPlainObject(body)) {
    throw new Error(FRIENDLY_MESSAGES.required);
  }

  const fullName = sanitizeInput(body.fullName);
  const phone = sanitizeInput(body.phone);
  const role = sanitizeInput(body.role).toLowerCase();

  if (!fullName || !phone || !role) {
    throw new Error(FRIENDLY_MESSAGES.required);
  }

  if (!isValidFullName(fullName)) {
    throw new Error(FRIENDLY_MESSAGES.fullName);
  }

  if (!isValidVietnamPhone(phone)) {
    throw new Error(FRIENDLY_MESSAGES.phone);
  }

  return { fullName, phone, role };
}

export {
  FRIENDLY_MESSAGES,
  isValidEmail,
  isValidFullName,
  isValidPassword,
  isValidVietnamPhone,
  normalizeProfileSeedPayload,
  normalizeRegistrationPayload,
  sanitizeInput,
};
