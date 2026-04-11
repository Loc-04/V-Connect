import dotenv from 'dotenv';

dotenv.config();

function normalizeProvider(rawValue, fallback = 'internal') {
  const normalized = String(rawValue ?? '').trim().toLowerCase();
  if (normalized === 'internal' || normalized === 'external') {
    return normalized;
  }
  return fallback;
}

function normalizeExternalAiProvider(rawValue, fallback = 'gemini') {
  const normalized = String(rawValue ?? '').trim().toLowerCase();
  if (normalized === 'gemini') {
    return normalized;
  }
  return fallback;
}

function parseInteger(rawValue, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY in shared-backend/.env');
}

const CORS_ORIGINS = FRONTEND_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const primaryOrigin = (CORS_ORIGINS[0] ?? 'http://localhost:5173').replace(/\/+$/, '');
const PASSWORD_RESET_REDIRECT_TO =
  process.env.PASSWORD_RESET_REDIRECT_TO ?? `${primaryOrigin}/reset-password`;
const MAP_GEOCODING_PROVIDER = String(process.env.MAP_GEOCODING_PROVIDER ?? 'nominatim').trim().toLowerCase();
const MAP_GEOCODING_BASE_URL =
  process.env.MAP_GEOCODING_BASE_URL ?? 'https://nominatim.openstreetmap.org/';
const MAP_GEOCODING_USER_AGENT =
  process.env.MAP_GEOCODING_USER_AGENT ?? 'V-Connect shared-backend/1.0 (local development)';
const MAP_GEOCODING_EMAIL = process.env.MAP_GEOCODING_EMAIL ?? '';
const MAP_GEOCODING_COUNTRY_CODES = process.env.MAP_GEOCODING_COUNTRY_CODES ?? 'vn';
const AI_PROVIDER_RECOMMEND = normalizeProvider(process.env.AI_PROVIDER_RECOMMEND, 'internal');
const AI_PROVIDER_CLASSIFY = normalizeProvider(process.env.AI_PROVIDER_CLASSIFY, 'internal');
const AI_PROVIDER_SUMMARIZE = normalizeProvider(process.env.AI_PROVIDER_SUMMARIZE, 'internal');
const AI_EXTERNAL_PROVIDER = normalizeExternalAiProvider(process.env.AI_EXTERNAL_PROVIDER, 'gemini');
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY ?? '').trim();
const AI_TIMEOUT_MS = parseInteger(process.env.AI_TIMEOUT_MS, 8000, { min: 500, max: 120000 });
const AI_CACHE_TTL_SECONDS = parseInteger(process.env.AI_CACHE_TTL_SECONDS, 3600, {
  min: 0,
  max: 86400,
});
const CHECKIN_CODE_SALT = String(process.env.CHECKIN_CODE_SALT ?? 'v-connect-checkin-salt').trim();

export {
  CORS_ORIGINS,
  FRONTEND_ORIGIN,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PASSWORD_RESET_REDIRECT_TO,
  MAP_GEOCODING_PROVIDER,
  MAP_GEOCODING_BASE_URL,
  MAP_GEOCODING_USER_AGENT,
  MAP_GEOCODING_EMAIL,
  MAP_GEOCODING_COUNTRY_CODES,
  AI_PROVIDER_RECOMMEND,
  AI_PROVIDER_CLASSIFY,
  AI_PROVIDER_SUMMARIZE,
  AI_EXTERNAL_PROVIDER,
  GEMINI_API_KEY,
  AI_TIMEOUT_MS,
  AI_CACHE_TTL_SECONDS,
  CHECKIN_CODE_SALT,
};
