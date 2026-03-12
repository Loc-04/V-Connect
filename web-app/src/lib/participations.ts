import { apiRequest } from './api';
import type { ParticipationResponse, ParticipationRecord } from '../types/participation';

export async function listParticipations(accessToken: string, limit?: number): Promise<ParticipationRecord[]> {
  const query = Number.isFinite(limit) ? `?limit=${limit}` : '';
  const response = await apiRequest<ParticipationResponse>(`/participations${query}`, { accessToken });
  return response.participations;
}

