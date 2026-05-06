export interface RegisterFormValues {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface RegisterValidationResult {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  password: string | null;
  confirmPassword: string | null;
}

export const REGISTER_MESSAGES = {
  required: 'All fields are required.',
  fullName: 'Full name must be 2–50 characters and contain only letters',
  phone: 'Invalid phone number format',
  email: 'Email is not valid',
  password:
    'Password must be at least 8 characters and include uppercase, lowercase, number and special character',
  confirmPassword: 'Passwords do not match',
};

function sanitizeInput(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

function isValidFullName(fullName: string): boolean {
  if (fullName.length < 2 || fullName.length > 50) {
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

  return !/^([a-z])\1+$/.test(normalized);
}

function isValidVietnamPhone(phone: string): boolean {
  if (!/^\d{10}$/.test(phone)) {
    return false;
  }

  return ['03', '05', '07', '08', '09'].includes(phone.slice(0, 2));
}

function isValidEmail(email: string): boolean {
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

  const domain = email.split('@')[1] ?? '';
  const labels = domain.split('.');
  return labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
}

function isValidPassword(password: string): boolean {
  if (password.length < 8 || /\s/.test(password)) {
    return false;
  }

  return /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export function sanitizeRegistrationForm(values: RegisterFormValues): RegisterFormValues {
  return {
    fullName: sanitizeInput(values.fullName),
    phone: sanitizeInput(values.phone),
    email: sanitizeInput(values.email).toLowerCase(),
    password: sanitizeInput(values.password),
    confirmPassword: sanitizeInput(values.confirmPassword),
  };
}

export function validateRegistrationForm(values: RegisterFormValues): RegisterValidationResult {
  const sanitized = sanitizeRegistrationForm(values);

  const requiredMissing = Object.values(sanitized).some((value) => !value);
  if (requiredMissing) {
    return {
      fullName: !sanitized.fullName ? REGISTER_MESSAGES.required : null,
      phone: !sanitized.phone ? REGISTER_MESSAGES.required : null,
      email: !sanitized.email ? REGISTER_MESSAGES.required : null,
      password: !sanitized.password ? REGISTER_MESSAGES.required : null,
      confirmPassword: !sanitized.confirmPassword ? REGISTER_MESSAGES.required : null,
    };
  }

  return {
    fullName: isValidFullName(sanitized.fullName) ? null : REGISTER_MESSAGES.fullName,
    phone: isValidVietnamPhone(sanitized.phone) ? null : REGISTER_MESSAGES.phone,
    email: isValidEmail(sanitized.email) ? null : REGISTER_MESSAGES.email,
    password: isValidPassword(sanitized.password) ? null : REGISTER_MESSAGES.password,
    confirmPassword: sanitized.password === sanitized.confirmPassword ? null : REGISTER_MESSAGES.confirmPassword,
  };
}

export function isRegisterFormValid(result: RegisterValidationResult): boolean {
  return !result.fullName && !result.phone && !result.email && !result.password && !result.confirmPassword;
}

export function getPasswordStrength(password: string): { label: string; score: number } {
  const trimmed = sanitizeInput(password);
  let score = 0;

  if (trimmed.length >= 8) score += 1;
  if (/[a-z]/.test(trimmed)) score += 1;
  if (/[A-Z]/.test(trimmed)) score += 1;
  if (/\d/.test(trimmed)) score += 1;
  if (/[^A-Za-z0-9]/.test(trimmed)) score += 1;
  if (/\s/.test(trimmed)) score = Math.max(score - 1, 0);

  if (score <= 2) return { label: 'Weak', score };
  if (score === 3 || score === 4) return { label: 'Medium', score };
  return { label: 'Strong', score };
}
