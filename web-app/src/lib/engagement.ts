import { mockParticipationHistory } from './participationMocks';

export interface CompletedActivityOption {
  id: string;
  title: string;
  completedAt: string;
}

export interface FeedbackEntry {
  id: string;
  activityId: string;
  activityTitle: string;
  rating: number;
  categories: string[];
  details: string;
  submittedAt: string;
}

export type NotificationType =
  | 'opportunity'
  | 'feedback'
  | 'approval'
  | 'certificate'
  | 'security'
  | 'message';

export interface NotificationEntry {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
}

export interface SubmitFeedbackInput {
  activityId: string;
  activityTitle: string;
  rating: number;
  categories: string[];
  details: string;
}

const FEEDBACK_KEY_PREFIX = 'vconnect_feedback_v1_';
const NOTIFICATIONS_KEY_PREFIX = 'vconnect_notifications_v1_';

const completedActivityFallback: CompletedActivityOption[] = mockParticipationHistory
  .filter((record) => record.status === 'completed')
  .map((record) => ({
    id: record.id,
    title: record.activityName,
    completedAt: record.date,
  }));

const feedbackSeed: FeedbackEntry[] = [
  {
    id: 'seed-feedback-1',
    activityId: 'city-park-reforestation',
    activityTitle: 'City Park Reforestation',
    rating: 5,
    categories: ['Organization', 'Staff Support'],
    details: 'Well-organized event with clear instructions. Team leaders were very supportive.',
    submittedAt: '2026-03-09T08:45:00.000Z',
  },
  {
    id: 'seed-feedback-2',
    activityId: 'community-garden-workshop',
    activityTitle: 'Community Garden Workshop',
    rating: 4,
    categories: ['Activity Quality', 'Venue'],
    details: 'Great learning environment. Venue was convenient, but check-in could be faster.',
    submittedAt: '2026-03-06T10:30:00.000Z',
  },
];

const notificationsSeed: NotificationEntry[] = [
  {
    id: 'notif-1',
    type: 'opportunity',
    title: 'New Opportunity',
    description: 'A new beach cleanup activity is available near your area.',
    timestamp: '2026-03-12T04:00:00.000Z',
    read: false,
  },
  {
    id: 'notif-2',
    type: 'feedback',
    title: 'Feedback Received',
    description: 'Thank you for submitting feedback for City Park Reforestation.',
    timestamp: '2026-03-11T07:15:00.000Z',
    read: false,
  },
  {
    id: 'notif-3',
    type: 'approval',
    title: 'Activity Approved',
    description: 'Your request to join Community Garden Workshop has been approved.',
    timestamp: '2026-03-10T03:30:00.000Z',
    read: false,
  },
  {
    id: 'notif-4',
    type: 'certificate',
    title: 'Certificate Available',
    description: 'Your participation certificate for Animal Shelter Cleaning is ready.',
    timestamp: '2026-03-09T09:00:00.000Z',
    read: true,
  },
  {
    id: 'notif-5',
    type: 'security',
    title: 'Security Update',
    description: 'Please review your account security settings and update your password.',
    timestamp: '2026-03-08T06:10:00.000Z',
    read: true,
  },
  {
    id: 'notif-6',
    type: 'message',
    title: 'Message from Coordinator',
    description: 'Coordinator Anna thanked you for your excellent teamwork this week.',
    timestamp: '2026-03-07T01:20:00.000Z',
    read: false,
  },
  {
    id: 'notif-7',
    type: 'opportunity',
    title: 'New Opportunity',
    description: 'Weekend tutoring support event is now open for volunteers.',
    timestamp: '2026-03-05T02:00:00.000Z',
    read: true,
  },
  {
    id: 'notif-8',
    type: 'message',
    title: 'Message from Coordinator',
    description: 'Schedule update: meeting point changed to the north gate.',
    timestamp: '2026-03-03T11:00:00.000Z',
    read: true,
  },
];

function getFeedbackKey(userId: string): string {
  return `${FEEDBACK_KEY_PREFIX}${userId}`;
}

function getNotificationsKey(userId: string): string {
  return `${NOTIFICATIONS_KEY_PREFIX}${userId}`;
}

function safeParseArray<T>(raw: string | null): T[] | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed as T[];
  } catch {
    return null;
  }
}

function sortByNewest<T>(items: T[], pickDate: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const aValue = new Date(pickDate(a)).getTime();
    const bValue = new Date(pickDate(b)).getTime();
    return bValue - aValue;
  });
}

function readFeedbackStore(userId: string): FeedbackEntry[] {
  if (typeof window === 'undefined') {
    return sortByNewest(feedbackSeed, (item) => item.submittedAt);
  }

  const key = getFeedbackKey(userId);
  const parsed = safeParseArray<FeedbackEntry>(window.localStorage.getItem(key));
  if (parsed && parsed.length > 0) {
    return sortByNewest(parsed, (item) => item.submittedAt);
  }

  window.localStorage.setItem(key, JSON.stringify(feedbackSeed));
  return sortByNewest(feedbackSeed, (item) => item.submittedAt);
}

function writeFeedbackStore(userId: string, nextEntries: FeedbackEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(getFeedbackKey(userId), JSON.stringify(nextEntries));
}

function readNotificationStore(userId: string): NotificationEntry[] {
  if (typeof window === 'undefined') {
    return sortByNewest(notificationsSeed, (item) => item.timestamp);
  }

  const key = getNotificationsKey(userId);
  const parsed = safeParseArray<NotificationEntry>(window.localStorage.getItem(key));
  if (parsed && parsed.length > 0) {
    return sortByNewest(parsed, (item) => item.timestamp);
  }

  window.localStorage.setItem(key, JSON.stringify(notificationsSeed));
  return sortByNewest(notificationsSeed, (item) => item.timestamp);
}

function writeNotificationStore(userId: string, nextEntries: NotificationEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(getNotificationsKey(userId), JSON.stringify(nextEntries));
}

function makeClientId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getCompletedActivitiesForUser(userId: string): Promise<CompletedActivityOption[]> {
  void userId;
  return sortByNewest(
    completedActivityFallback.map((item) => ({ ...item })),
    (item) => item.completedAt
  );
}

export async function getFeedbackForUser(userId: string): Promise<FeedbackEntry[]> {
  return readFeedbackStore(userId);
}

export async function submitFeedbackForUser(userId: string, input: SubmitFeedbackInput): Promise<FeedbackEntry> {
  const entry: FeedbackEntry = {
    id: makeClientId('feedback'),
    activityId: input.activityId,
    activityTitle: input.activityTitle,
    rating: input.rating,
    categories: [...input.categories],
    details: input.details,
    submittedAt: new Date().toISOString(),
  };

  const currentEntries = readFeedbackStore(userId);
  const nextEntries = sortByNewest([entry, ...currentEntries], (item) => item.submittedAt);
  writeFeedbackStore(userId, nextEntries);
  return entry;
}

export async function getNotificationsForUser(userId: string): Promise<NotificationEntry[]> {
  return readNotificationStore(userId);
}

export async function markNotificationAsReadForUser(userId: string, notificationId: string): Promise<NotificationEntry[]> {
  const nextEntries = readNotificationStore(userId).map((item) =>
    item.id === notificationId ? { ...item, read: true } : item
  );
  writeNotificationStore(userId, nextEntries);
  return nextEntries;
}

export async function markAllNotificationsAsReadForUser(userId: string): Promise<NotificationEntry[]> {
  const nextEntries = readNotificationStore(userId).map((item) => ({ ...item, read: true }));
  writeNotificationStore(userId, nextEntries);
  return nextEntries;
}

export async function clearNotificationsForUser(userId: string): Promise<NotificationEntry[]> {
  const nextEntries: NotificationEntry[] = [];
  writeNotificationStore(userId, nextEntries);
  return nextEntries;
}
