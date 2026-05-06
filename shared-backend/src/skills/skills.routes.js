import { Router } from 'express';
import { listSharedSkills } from './skills.service.js';

const router = Router();

router.get('/skills', async (req, res) => {
  const limitParam = Number.parseInt(String(req.query.limit ?? ''), 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 300;

  try {
    const skills = await listSharedSkills({ limit });
    if (skills.length === 0) {
      res.status(200).json({ skills: [], message: 'Skill catalog is empty' });
      return;
    }
    res.json({ skills });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load skill catalog.';
    const missingTableOrColumn =
      message.includes('SKILL_CATALOG_TABLE_NOT_CONFIGURED') || message.includes('SKILL_CATALOG_COLUMN_NOT_CONFIGURED');

    if (missingTableOrColumn) {
      console.error('[skills] Catalog schema is not configured correctly:', message);
      res.status(503).json({
        message: 'Skills catalog table is not configured. Apply the skills catalog SQL script first (public.core_skills).',
      });
      return;
    }

    console.error('[skills] Failed to load skills catalog:', message);
    res.status(500).json({ message: 'Failed to load skill catalog.' });
  }
});

export default router;
