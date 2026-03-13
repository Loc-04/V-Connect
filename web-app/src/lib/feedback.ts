import { apiRequest } from './api';
import type { FeedbackPayload, FeedbackRecord } from '../types/feedback';

interface FeedbackResponse {
  feedback: FeedbackRecord;
}

interface FeedbackListResponse {
  feedbacks: FeedbackRecord[];
}

export interface ListFeedbackOptions {
  accessToken: string;
  mine?: boolean;
  rating?: number;
  participationId?: string;
  limit?: number;
}

function createQueryString(options: Omit<ListFeedbackOptions, 'accessToken'>) {
  const params = new URLSearchParams();

  if (typeof options.mine === 'boolean') {
    params.set('mine', String(options.mine));
  }

  if (typeof options.rating === 'number' && Number.isInteger(options.rating)) {
    params.set('rating', String(options.rating));
  }

  if (options.participationId) {
    params.set('participationId', options.participationId);
  }

  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    params.set('limit', String(Math.trunc(options.limit)));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function listFeedbacks(options: ListFeedbackOptions): Promise<FeedbackRecord[]> {
  const query = createQueryString({
    mine: options.mine,
    rating: options.rating,
    participationId: options.participationId,
    limit: options.limit,
  });

  const response = await apiRequest<FeedbackListResponse>(`/feedback${query}`, {
    accessToken: options.accessToken,
  });

  return response.feedbacks;
}

export async function createFeedback(payload: FeedbackPayload, accessToken: string): Promise<FeedbackRecord> {
  const response = await apiRequest<FeedbackResponse>('/feedback', {
    method: 'POST',
    accessToken,
    body: payload,
  });

  return response.feedback;
}
