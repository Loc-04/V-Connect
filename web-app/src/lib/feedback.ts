import { apiRequest } from './api';
import type { FeedbackPayload, FeedbackRecord } from '../types/feedback';

interface FeedbackResponse {
  feedback: FeedbackRecord;
}

interface FeedbackListResponse {
  feedbacks: FeedbackRecord[];
}

interface FeedbackReviewResponse {
  feedbacks: FeedbackRecord[];
  moderation?: {
    statusWritable?: boolean;
    flagWritable?: boolean;
  };
}

interface FeedbackDetailResponse {
  feedback: FeedbackRecord;
  moderation?: {
    statusWritable?: boolean;
    flagWritable?: boolean;
  };
}

export interface ListFeedbackOptions {
  accessToken: string;
  mine?: boolean;
  rating?: number;
  participationId?: string;
  limit?: number;
}

export interface ReviewFeedbackOptions {
  accessToken: string;
  status?: 'all' | 'pending' | 'in_review' | 'resolved' | 'dismissed';
  flagged?: boolean;
  keyword?: string;
  rating?: number;
  limit?: number;
}

function createQueryString(options: Omit<ListFeedbackOptions & ReviewFeedbackOptions, 'accessToken'>) {
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

  if (options.status) {
    params.set('status', options.status);
  }

  if (typeof options.flagged === 'boolean') {
    params.set('flagged', String(options.flagged));
  }

  if (options.keyword) {
    params.set('keyword', options.keyword);
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

export async function listFeedbackReview(options: ReviewFeedbackOptions): Promise<FeedbackRecord[]> {
  const query = createQueryString({
    status: options.status,
    flagged: options.flagged,
    keyword: options.keyword,
    rating: options.rating,
    limit: options.limit,
  });

  const response = await apiRequest<FeedbackReviewResponse>(`/feedback/review${query}`, {
    accessToken: options.accessToken,
  });

  return response.feedbacks;
}

export async function getFeedbackById(feedbackId: string, accessToken: string): Promise<FeedbackRecord> {
  const response = await apiRequest<FeedbackDetailResponse>(`/feedback/${feedbackId}`, {
    accessToken,
  });

  return response.feedback;
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: 'pending' | 'in_review' | 'resolved' | 'dismissed',
  accessToken: string
): Promise<FeedbackRecord> {
  const response = await apiRequest<FeedbackDetailResponse>(`/feedback/${feedbackId}/status`, {
    method: 'PUT',
    accessToken,
    body: { status },
  });

  return response.feedback;
}

export async function updateFeedbackFlag(
  feedbackId: string,
  flag: boolean,
  accessToken: string,
  reason?: string
): Promise<FeedbackRecord> {
  const response = await apiRequest<FeedbackDetailResponse>(`/feedback/${feedbackId}/flag`, {
    method: 'PUT',
    accessToken,
    body: { flag, reason },
  });

  return response.feedback;
}
