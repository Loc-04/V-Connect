import { apiRequest } from './api';
import type { ProvinceRecord, WardRecord } from '../types/location';

interface ProvincesResponse {
  provinces: ProvinceRecord[];
}

interface WardsResponse {
  wards: WardRecord[];
}

export async function listProvinces(accessToken: string): Promise<ProvinceRecord[]> {
  const response = await apiRequest<ProvincesResponse>('/locations/provinces', {
    accessToken,
  });

  return response.provinces ?? [];
}

export async function listWards(provinceCode: string, accessToken: string): Promise<WardRecord[]> {
  const response = await apiRequest<WardsResponse>(`/locations/wards?provinceCode=${encodeURIComponent(provinceCode)}`, {
    accessToken,
  });

  return response.wards ?? [];
}
