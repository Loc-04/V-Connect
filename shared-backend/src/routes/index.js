import { Router } from 'express';
import authRoutes from '../auth/auth.routes.js';
import usersRoutes from '../users/users.routes.js';
import activitiesRoutes from '../activities/activities.routes.js';
import participationsRoutes from '../participations/participations.routes.js';
import feedbackRoutes from '../feedback/feedback.routes.js';
import notificationsRoutes from '../notifications/notifications.routes.js';
import recommendationsRoutes from '../recommendations/recommendations.routes.js';
import adminRoutes from '../admin/admin.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

router.use(authRoutes);
router.use(usersRoutes);
router.use(activitiesRoutes);
router.use(participationsRoutes);
router.use(feedbackRoutes);
router.use(notificationsRoutes);
router.use(recommendationsRoutes);
router.use(adminRoutes);

export default router;
