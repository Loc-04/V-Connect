import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { isUuid } from '../common/utils/validators.js';
import { getActivityById } from '../activities/activities.service.js';
import { getRecommendationsForActivity, getRecommendationsForUser } from './recommendations.service.js';

const router = Router();

function getRequestedLimit(rawValue, fallback = 10, max = 50) {
  const requestedLimit = Number(rawValue ?? fallback);
  return Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), max) : fallback;
}

router.get('/recommendations/:userId', requireAuth, async (req, res) => {
  const userId = typeof req.params.userId === 'string' ? req.params.userId.trim() : '';
  if (!isUuid(userId)) {
    res.status(400).json({ message: 'userId must be a valid UUID.' });
    return;
  }

  const requesterRole = String(req.auth?.profile?.role ?? '');
  const requesterId = String(req.auth?.user?.id ?? '');
  if (requesterRole !== 'admin' && requesterId !== userId) {
    res.status(403).json({ message: 'You can request recommendations only for your own account.' });
    return;
  }

  try {
    const result = await getRecommendationsForUser(userId, getRequestedLimit(req.query.limit));
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load recommendations.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.get('/recommendations/activity/:id', requireAuth, async (req, res) => {
  const activityId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(activityId)) {
    res.status(400).json({ message: 'Activity id must be a valid UUID.' });
    return;
  }

  const requesterRole = String(req.auth?.profile?.role ?? '');
  if (requesterRole !== 'organizer' && requesterRole !== 'admin') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  try {
    const activity = await getActivityById(activityId);
    if (!activity) {
      res.status(404).json({ message: 'Activity not found.' });
      return;
    }

    if (requesterRole !== 'admin' && activity.organizer_id !== req.auth.user.id) {
      res.status(403).json({ message: 'You can request recommendations only for your own activities.' });
      return;
    }

    const result = await getRecommendationsForActivity(activityId, getRequestedLimit(req.query.limit));
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load activity recommendations.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

export default router;
