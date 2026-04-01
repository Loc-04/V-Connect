import { apiRequest } from './api';
import type {
  AvailabilitySlotsResponse,
  ProfileMeResponse,
  SkillsAvailabilityResponse,
  VolunteerAvailabilityChoice,
} from '../types/profile';

export async function getProfileMe(accessToken: string): Promise<ProfileMeResponse> {
  return apiRequest<ProfileMeResponse>('/profile/me', { accessToken });
}

export interface PatchProfilePayload {
  fullName?: string;
  phone?: string;
  avatarUrl?: string | null;
  skills?: string[];
  interests?: string[];
  availableChoices?: VolunteerAvailabilityChoice[];
}

export async function patchProfileMe(payload: PatchProfilePayload, accessToken: string): Promise<ProfileMeResponse> {
  return apiRequest<ProfileMeResponse>('/profile/me', {
    method: 'PATCH',
    accessToken,
    body: payload,
  });
}

export interface PutSkillsAvailabilityPayload {
  skills?: string[];
  interests?: string[];
  availableChoices?: VolunteerAvailabilityChoice[];
}

export async function getSkillsAvailability(accessToken: string): Promise<SkillsAvailabilityResponse> {
  return apiRequest<SkillsAvailabilityResponse>('/profile/skills-availability', { accessToken });
}

export async function putSkillsAvailability(
  payload: PutSkillsAvailabilityPayload,
  accessToken: string
): Promise<SkillsAvailabilityResponse> {
  return apiRequest<SkillsAvailabilityResponse>('/profile/skills-availability', {
    method: 'PUT',
    accessToken,
    body: payload,
  });
}

export async function getAvailabilitySlots(accessToken: string): Promise<AvailabilitySlotsResponse> {
  return apiRequest<AvailabilitySlotsResponse>('/availability-slots', { accessToken });
}
