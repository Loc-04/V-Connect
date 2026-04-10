import type { ActivityRecord } from '../types/activity';

export interface ActivityCoordinates {
  lat: number;
  lng: number;
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeLocationParts(location: Exclude<ActivityRecord['location'], null>) {
  if (typeof location === 'string') {
    const text = location.trim();
    return {
      address: text,
      formattedAddress: text,
      ward: '',
      province: '',
    };
  }

  return {
    address: typeof location.address === 'string' ? location.address.trim() : '',
    formattedAddress: typeof location.formattedAddress === 'string' ? location.formattedAddress.trim() : '',
    ward: typeof location.ward === 'string' ? location.ward.trim() : '',
    province: typeof location.province === 'string' ? location.province.trim() : '',
  };
}

export function formatActivityLocation(location: ActivityRecord['location']): string {
  if (!location) {
    return 'Location TBD';
  }

  const { formattedAddress, address, ward, province } = normalizeLocationParts(location);
  return formattedAddress || [address, ward, province].filter(Boolean).join(', ') || 'Location TBD';
}

export function getActivityCoordinates(location: ActivityRecord['location']): ActivityCoordinates | null {
  if (!location || typeof location === 'string') {
    return null;
  }

  if (!isFiniteCoordinate(location.lat) || !isFiniteCoordinate(location.lng)) {
    return null;
  }

  return { lat: location.lat, lng: location.lng };
}

export function getActivityAddressLine(location: ActivityRecord['location']): string {
  if (!location) {
    return '';
  }

  const { address, ward, province } = normalizeLocationParts(location);
  return [address, ward, province].filter(Boolean).join(', ');
}

export function buildActivityMapUrl(location: ActivityRecord['location']): string | null {
  const coordinates = getActivityCoordinates(location);
  if (coordinates) {
    return `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`;
  }

  const query = formatActivityLocation(location);
  if (!query || query === 'Location TBD') {
    return null;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
