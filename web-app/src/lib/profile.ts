import { apiRequest } from './api';
import type { ProfileMeResponse, VolunteerAvailability } from '../types/profile';

export async function getProfileMe(accessToken: string): Promise<ProfileMeResponse> {
  return apiRequest<ProfileMeResponse>('/profile/me', { accessToken });
}

export interface PatchProfilePayload {
  fullName?: string;
  phone?: string;
  avatarUrl?: string | null;
  skills?: string[];
  interests?: string[];
  availability?: VolunteerAvailability;
}

export async function patchProfileMe(payload: PatchProfilePayload, accessToken: string): Promise<ProfileMeResponse> {
  return apiRequest<ProfileMeResponse>('/profile/me', {
    method: 'PATCH',
    accessToken,
    body: payload,
  });
}

