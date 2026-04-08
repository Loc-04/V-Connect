import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { isUuid } from '../common/utils/validators.js';
import { summarizeReport } from '../ai/ai.router.js';

const router = Router();

router.get('/organizer/reports/summary', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '').trim().toLowerCase();
  if (role !== 'organizer' && role !== 'admin') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const activityId = typeof req.query.activityId === 'string' ? req.query.activityId.trim() : '';
  if (activityId && !isUuid(activityId)) {
    res.status(400).json({ message: 'activityId must be a valid UUID.' });
    return;
  }

  const organizerIdFromQuery = typeof req.query.organizerId === 'string' ? req.query.organizerId.trim() : '';
  if (organizerIdFromQuery && !isUuid(organizerIdFromQuery)) {
    res.status(400).json({ message: 'organizerId must be a valid UUID.' });
    return;
  }

  if (organizerIdFromQuery && role !== 'admin') {
    res.status(403).json({ message: 'Only admin can query report summaries by organizerId.' });
    return;
  }

  const organizerId = organizerIdFromQuery || req.auth.user.id;

  try {
    const payload = await summarizeReport({
      organizerId,
      activityId: activityId || null,
    });
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load organizer report summary.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

export default router;
