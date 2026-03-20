import { apiRequest } from './api';
import { normalizeParticipationList, normalizeParticipationRecord } from './participations';
import type { ParticipationRecord } from '../types/participation';

interface RegistrationResponse {
  registration?: ParticipationRecord;
  participation?: ParticipationRecord;
  message?: string;
}

interface RegistrationListResponse {
  registrations?: ParticipationRecord[];
}

function getRegistrationPayload(response: RegistrationResponse): ParticipationRecord {
  const registration = response.registration ?? response.participation;
  if (!registration) {
    throw new Error('Registration response did not include a registration payload.');
  }

  return normalizeParticipationRecord(registration);
}

export async function listActivityRegistrations(activityId: string, accessToken: string): Promise<ParticipationRecord[]> {
  const response = await apiRequest<RegistrationListResponse>(`/activities/${activityId}/registrations`, {
    accessToken,
  });

  return normalizeParticipationList(response.registrations);
}

export async function getRegistrationById(registrationId: string, accessToken: string): Promise<ParticipationRecord> {
  const response = await apiRequest<RegistrationResponse>(`/registrations/${registrationId}`, {
    accessToken,
  });

  return getRegistrationPayload(response);
}

export async function approveRegistration(
  registrationId: string,
  accessToken: string
): Promise<{ registration: ParticipationRecord; message?: string }> {
  const response = await apiRequest<RegistrationResponse>(`/registrations/${registrationId}/approve`, {
    method: 'PUT',
    accessToken,
  });

  return {
    registration: getRegistrationPayload(response),
    message: response.message,
  };
}

export async function rejectRegistration(
  registrationId: string,
  accessToken: string
): Promise<{ registration: ParticipationRecord; message?: string }> {
  const response = await apiRequest<RegistrationResponse>(`/registrations/${registrationId}/reject`, {
    method: 'PUT',
    accessToken,
  });

  return {
    registration: getRegistrationPayload(response),
    message: response.message,
  };
}
