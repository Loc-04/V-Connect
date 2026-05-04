import { apiRequest } from './api';
import type { OrganizerReportSummaryData } from './organizerReportSummary';

export interface ActivitySummaryOption {
  id: string;
  title: string;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  capacity?: number | null;
}

interface OrganizerReportSummaryMeta {
  generatedAt: string;
  hasActivities: boolean;
  activityId: string | null;
  availableActivities: ActivitySummaryOption[];
}

export interface OrganizerReportSummaryResponse {
  report: OrganizerReportSummaryData;
  meta: OrganizerReportSummaryMeta;
}

export async function getOrganizerReportSummary(
  accessToken: string,
  activityId?: string
): Promise<OrganizerReportSummaryResponse> {
  const params = new URLSearchParams();
  if (activityId) {
    params.set('activityId', activityId);
  }
  const query = params.toString();

  return apiRequest<OrganizerReportSummaryResponse>(`/organizer/reports/summary${query ? `?${query}` : ''}`, {
    accessToken,
  });
}
