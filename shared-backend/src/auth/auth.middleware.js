import { supabaseAdmin } from '../database/supabase.js';
import { getProfileByUserId } from '../users/users.service.js';

function extractBearerToken(req) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }
  return authorization.slice('Bearer '.length).trim();
}

async function requireAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ message: 'Missing Bearer token.' });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ message: error?.message ?? 'Invalid access token.' });
    return;
  }

  try {
    const profile = await getProfileByUserId(data.user.id);
    req.auth = { token, user: data.user, profile };
    next();
  } catch (profileError) {
    const message = profileError instanceof Error ? profileError.message : 'Failed to load user profile.';
    res.status(500).json({ message });
  }
}

function requireAdmin(req, res, next) {
  const role = req.auth?.profile?.role;
  if (!role) {
    res.status(403).json({ message: 'Profile not found in public.users.' });
    return;
  }

  if (role !== 'admin') {
    res.status(403).json({ message: 'Admin role required.' });
    return;
  }

  next();
}

export { requireAuth, requireAdmin };
