import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRegistrationPayload } from './auth.validation.js';

function expectValidationError(payload, expectedMessage) {
  assert.throws(() => normalizeRegistrationPayload(payload), {
    message: expectedMessage,
  });
}

test('accepts a valid registration payload', () => {
  const payload = normalizeRegistrationPayload({
    fullName: 'John Doe',
    phone: '0912345678',
    email: 'Example@Gmail.com',
    password: 'Abcd1234!',
    confirmPassword: 'Abcd1234!',
    role: 'volunteer',
  });

  assert.equal(payload.fullName, 'John Doe');
  assert.equal(payload.phone, '0912345678');
  assert.equal(payload.email, 'example@gmail.com');
});

test('rejects empty input', () => {
  expectValidationError(
    {
      fullName: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: '',
    },
    'All fields are required.'
  );
});

test('rejects extremely long full name', () => {
  expectValidationError(
    {
      fullName: 'A'.repeat(51),
      phone: '0912345678',
      email: 'valid@example.com',
      password: 'Abcd1234!',
      confirmPassword: 'Abcd1234!',
      role: 'volunteer',
    },
    'Full name must be 2–50 characters and contain only letters'
  );
});

test('rejects special characters in full name', () => {
  expectValidationError(
    {
      fullName: 'John!!!',
      phone: '0912345678',
      email: 'valid@example.com',
      password: 'Abcd1234!',
      confirmPassword: 'Abcd1234!',
      role: 'volunteer',
    },
    'Full name must be 2–50 characters and contain only letters'
  );
});

test('rejects SQL injection strings', () => {
  expectValidationError(
    {
      fullName: "Robert'); DROP TABLE users;--",
      phone: '0912345678',
      email: 'valid@example.com',
      password: 'Abcd1234!',
      confirmPassword: 'Abcd1234!',
      role: 'volunteer',
    },
    'Full name must be 2–50 characters and contain only letters'
  );
});

test('rejects invalid phone prefix and non-digit characters', () => {
  expectValidationError(
    {
      fullName: 'John Doe',
      phone: '02123abc78',
      email: 'valid@example.com',
      password: 'Abcd1234!',
      confirmPassword: 'Abcd1234!',
      role: 'volunteer',
    },
    'Invalid phone number format'
  );
});

test('rejects invalid email format', () => {
  expectValidationError(
    {
      fullName: 'John Doe',
      phone: '0912345678',
      email: 'invalid@@example.com',
      password: 'Abcd1234!',
      confirmPassword: 'Abcd1234!',
      role: 'volunteer',
    },
    'Email is not valid'
  );
});

test('rejects weak password and spaces in password', () => {
  expectValidationError(
    {
      fullName: 'John Doe',
      phone: '0912345678',
      email: 'valid@example.com',
      password: 'abc 12345',
      confirmPassword: 'abc 12345',
      role: 'volunteer',
    },
    'Password must be at least 8 characters and include uppercase, lowercase, number and special character'
  );
});

test('rejects confirm password mismatch', () => {
  expectValidationError(
    {
      fullName: 'John Doe',
      phone: '0912345678',
      email: 'valid@example.com',
      password: 'Abcd1234!',
      confirmPassword: 'Abcd1234@',
      role: 'volunteer',
    },
    'Passwords do not match'
  );
});
