import dotenv from 'dotenv';

dotenv.config();

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

export {
  CORS_ORIGINS,
  FRONTEND_ORIGIN,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PASSWORD_RESET_REDIRECT_TO,
};
