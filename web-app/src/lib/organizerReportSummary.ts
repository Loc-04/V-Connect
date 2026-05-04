import type { BadgeTone } from '../components/ui';

export type ReportIssuePriority = 'high' | 'medium' | 'low';
export type ReportBarTone = 'accent' | 'success' | 'muted';

export interface ReportMiniMetric {
  label: string;
  value: string;
}

export interface ReportParticipationBreakdownItem {
  label: string;
  value: number | string;
  progress: number;
  tone: ReportBarTone;
  helper?: string;
}

export interface ReportSentimentChip {
  label: string;
  tone: BadgeTone;
}

export interface ReportIssueHighlight {
  id: string;
  title: string;
  description: string;
  priority: ReportIssuePriority;
}

export interface ReportAnalyticsFact {
  key: string;
  label: string;
  value: string;
}

export interface ReportIssueTagHighlight {
  id: string;
  tag: string;
  label: string;
  count: number;
  priority: ReportIssuePriority;
}

export interface ReportParticipationStats {
  registeredCount: number;
  checkedInCount: number;
  pendingApprovalCount: number;
  approvedCount: number;
  totalParticipations: number;
  capacity: number | null;
  completionRatePercent: number;
  capacityFilledPercent: number | null;
}

export interface OrganizerReportSummaryData {
  liveLabel: string;
  activityTitle: string;
  durationLabel: string;
  durationValue: string;
  summary: string;
  miniMetrics: ReportMiniMetric[];
  participationTotal: string;
  participationTrend: string;
  participationTrendLabel: string;
  participationBreakdown: ReportParticipationBreakdownItem[];
  feedbackRating: number | null;
  feedbackQuote: string;
  sentimentChips: ReportSentimentChip[];
  issues: ReportIssueHighlight[];
  analyticsFacts?: ReportAnalyticsFact[];
  strengths?: string[];
  weaknesses?: string[];
  issueHighlights?: ReportIssueTagHighlight[];
  participationStats?: ReportParticipationStats;
  feedbackStats?: {
    totalCount: number;
    validCount: number;
    spamCount: number;
    lowSignalCount?: number;
    averageRating: number | null;
  };
  modelVersion?: string;
}

export const organizerReportSummaryMock: OrganizerReportSummaryData = {
  liveLabel: 'Live Activity',
  activityTitle: 'Q4 Community Outreach Program',
  durationLabel: 'Duration',
  durationValue: 'Oct 12 - Nov 15, 2023',
  summary:
    'The Q4 Community Outreach initiative has successfully engaged with multiple local stakeholders to increase digital literacy. Engagement rates are currently 15% above the projected target for this phase of the rollout. The following summary details the current status of participation, qualitative feedback, and critical operational highlights.',
  miniMetrics: [
    { label: 'Completion Rate', value: '84.2%' },
    { label: 'Avg. Engagement', value: '42m' },
    { label: 'Resource Usage', value: '68%' },
  ],
  participationTotal: '1,284',
  participationTrend: '+12.5%',
  participationTrendLabel: 'vs last month',
  participationBreakdown: [
    { label: 'Registered Users', value: 850, progress: 76, tone: 'accent' },
    { label: 'Guest Participants', value: 434, progress: 49, tone: 'success' },
    { label: 'New Enrollments', value: 122, progress: 25, tone: 'muted' },
  ],
  feedbackRating: 4.5,
  feedbackQuote: 'Highly intuitive and impactful for the local residents.',
  sentimentChips: [
    { label: 'Positive', tone: 'success' },
    { label: 'Enthusiastic', tone: 'success' },
    { label: 'Neutral', tone: 'neutral' },
    { label: 'Collaborative', tone: 'info' },
    { label: 'Helpful', tone: 'success' },
  ],
  issues: [
    {
      id: 'server-latency-zone-b',
      title: 'Server Latency in Zone B',
      description: 'Peak hour delays affecting registration flow. Hardware upgrade scheduled.',
      priority: 'high',
    },
    {
      id: 'feedback-form-accessibility',
      title: 'Feedback Form Accessibility',
      description: 'Screen reader compatibility reported on Android devices. Patch pending.',
      priority: 'medium',
    },
    {
      id: 'marketing-asset-link-error',
      title: 'Marketing Asset Link Error',
      description: 'Broken redirect on one social media banner. Rectification in progress.',
      priority: 'low',
    },
  ],
  analyticsFacts: [
    { key: 'total_participations', label: 'Participation records', value: '1,284' },
    { key: 'feedback_count', label: 'Feedback submissions', value: '420' },
  ],
  strengths: ['Average volunteer rating remains above 4.0/5.'],
  weaknesses: ['Check-in throughput dips during peak slots.'],
  issueHighlights: [
    { id: 'feedback-issue-logistics', tag: 'logistics', label: 'Logistics', count: 12, priority: 'medium' },
  ],
  feedbackStats: {
    totalCount: 420,
    validCount: 420,
    spamCount: 0,
    averageRating: 4.5,
  },
  modelVersion: 'report-summary-v1-2026-04',
};
