import { isPlainObject } from '../common/utils/validators.js';

function normalizeOptionalString(value) {
  if (value == null) {
    return '';
  }

  if (typeof value !== 'string') {
    throw new Error('Address fields must be strings.');
  }

  return value.trim();
}

function normalizeOptionalCoordinate(value, fieldName) {
  if (value == null || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  return numeric;
}

function normalizeGeocodePayload(body) {
  if (!isPlainObject(body)) {
    throw new Error('Body must be a JSON object.');
  }

  const address = normalizeOptionalString(body.address);
  if (!address) {
    throw new Error('address is required.');
  }

  const provinceCode = normalizeOptionalString(body.provinceCode);
  const wardCode = normalizeOptionalString(body.wardCode);
  const province = normalizeOptionalString(body.province);
  const ward = normalizeOptionalString(body.ward);

  return {
    address,
    provinceCode: provinceCode || null,
    wardCode: wardCode || null,
    province: province || null,
    ward: ward || null,
  };
}

function normalizeActivityMapLocation(value) {
  if (value == null) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new Error('location must be an object or string.');
  }

  return {
    address: normalizeOptionalString(value.address),
    city: normalizeOptionalString(value.city),
    province: normalizeOptionalString(value.province),
    ward: normalizeOptionalString(value.ward),
    formattedAddress: normalizeOptionalString(value.formattedAddress),
    mapProvider: normalizeOptionalString(value.mapProvider),
    geocodedAt: normalizeOptionalString(value.geocodedAt),
    geocodeConfidence: value.geocodeConfidence == null || value.geocodeConfidence === ''
      ? null
      : normalizeOptionalCoordinate(value.geocodeConfidence, 'location.geocodeConfidence'),
    lat: normalizeOptionalCoordinate(value.lat, 'location.lat'),
    lng: normalizeOptionalCoordinate(value.lng, 'location.lng'),
  };
}

export { normalizeActivityMapLocation, normalizeGeocodePayload };
