export interface ProvinceRecord {
  code: string;
  name: string;
}

export interface WardRecord {
  code: string;
  province_code: string;
  name: string;
}

export interface GeocodeLocationPayload {
  address: string;
  provinceCode?: string | null;
  wardCode?: string | null;
  province?: string | null;
  ward?: string | null;
}

export interface GeocodedLocationRecord {
  address: string;
  city?: string | null;
  province?: string | null;
  ward?: string | null;
  formattedAddress: string;
  provinceCode?: string | null;
  wardCode?: string | null;
  mapProvider?: string | null;
  geocodedAt?: string | null;
  geocodeConfidence?: number | null;
  lat: number;
  lng: number;
  providerDisplayName?: string | null;
}

export interface ReverseGeocodeLocationPayload {
  lat: number;
  lng: number;
}
