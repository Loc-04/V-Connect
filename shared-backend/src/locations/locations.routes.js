import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { geocodeAddress, listProvinces, listWardsByProvince } from './locations.service.js';
import { normalizeGeocodePayload } from './locations.validation.js';

const router = Router();

router.get('/locations/provinces', requireAuth, async (_req, res) => {
  try {
    const provinces = await listProvinces();
    res.json({ provinces });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load provinces.';
    res.status(500).json({ message });
  }
});

router.get('/locations/wards', requireAuth, async (req, res) => {
  const provinceCode = typeof req.query.provinceCode === 'string' ? req.query.provinceCode.trim() : '';
  if (!provinceCode) {
    res.status(400).json({ message: 'provinceCode is required.' });
    return;
  }

  try {
    const wards = await listWardsByProvince(provinceCode);
    res.json({ wards });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load wards.';
    res.status(500).json({ message });
  }
});

router.post('/locations/geocode', requireAuth, async (req, res) => {
  let payload;
  try {
    payload = normalizeGeocodePayload(req.body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid geocode payload.' });
    return;
  }

  try {
    const geocodedLocation = await geocodeAddress(payload);
    res.json({ geocodedLocation });
  } catch (error) {
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : 'Failed to geocode location.';
    res.status(statusCode).json({ message });
  }
});

export default router;
