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
    labelWritable?: boolean;
  };
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    hasPrev?: boolean;
    hasNext?: boolean;
  };
}

interface FeedbackDetailResponse {
  feedback: FeedbackRecord;
  moderation?: {
    statusWritable?: boolean;
    flagWritable?: boolean;
    labelWritable?: boolean;
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
  page?: number;
}

export interface FeedbackReviewResult {
  feedbacks: FeedbackRecord[];
  moderation: {
    statusWritable: boolean;
    flagWritable: boolean;
    labelWritable: boolean;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
  };
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

  if (typeof options.page === 'number' && Number.isFinite(options.page)) {
    params.set('page', String(Math.trunc(options.page)));
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

export async function listFeedbackReview(options: ReviewFeedbackOptions): Promise<FeedbackReviewResult> {
  const query = createQueryString({
    status: options.status,
    flagged: options.flagged,
    keyword: options.keyword,
    rating: options.rating,
    limit: options.limit,
    page: options.page,
  });

  const response = await apiRequest<FeedbackReviewResponse>(`/feedback/review${query}`, {
    accessToken: options.accessToken,
  });

  const fallbackLimit =
    typeof options.limit === 'number' && Number.isFinite(options.limit) ? Math.max(1, Math.trunc(options.limit)) : 100;
  const fallbackPage =
    typeof options.page === 'number' && Number.isFinite(options.page) ? Math.max(1, Math.trunc(options.page)) : 1;
  const fallbackTotal = Array.isArray(response.feedbacks) ? response.feedbacks.length : 0;
  const fallbackTotalPages = Math.max(1, Math.ceil(fallbackTotal / fallbackLimit));
  const pagination = response.pagination ?? {};
  const moderation = response.moderation ?? {};

  return {
    feedbacks: response.feedbacks ?? [],
    moderation: {
      statusWritable: Boolean(moderation.statusWritable),
      flagWritable: Boolean(moderation.flagWritable),
      labelWritable: Boolean(moderation.labelWritable),
    },
    pagination: {
      page:
        typeof pagination.page === 'number' && Number.isFinite(pagination.page)
          ? Math.max(1, Math.trunc(pagination.page))
          : fallbackPage,
      limit:
        typeof pagination.limit === 'number' && Number.isFinite(pagination.limit)
          ? Math.max(1, Math.trunc(pagination.limit))
          : fallbackLimit,
      total:
        typeof pagination.total === 'number' && Number.isFinite(pagination.total)
          ? Math.max(0, Math.trunc(pagination.total))
          : fallbackTotal,
      totalPages:
        typeof pagination.totalPages === 'number' && Number.isFinite(pagination.totalPages)
          ? Math.max(1, Math.trunc(pagination.totalPages))
          : fallbackTotalPages,
      hasPrev: typeof pagination.hasPrev === 'boolean' ? pagination.hasPrev : fallbackPage > 1,
      hasNext: typeof pagination.hasNext === 'boolean' ? pagination.hasNext : fallbackPage < fallbackTotalPages,
    },
  };
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

export async function updateFeedbackAiLabel(
  feedbackId: string,
  label: 'spam' | 'not_spam' | 'auto',
  accessToken: string
): Promise<FeedbackRecord> {
  const response = await apiRequest<FeedbackDetailResponse>(`/feedback/${feedbackId}/ai-label`, {
    method: 'PUT',
    accessToken,
    body: { label },
  });

  return response.feedback;
}
