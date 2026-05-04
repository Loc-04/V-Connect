import { Download, Share2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { EmptyLoadingErrorState } from '../components/feedback';
import { FeedbackOverviewCard } from '../components/reports/FeedbackOverviewCard';
import { IssueHighlightsCard } from '../components/reports/IssueHighlightsCard';
import { ParticipationCountCard } from '../components/reports/ParticipationCountCard';
import { ReportSummaryHeroCard } from '../components/reports/ReportSummaryHeroCard';
import { EventTimelineReadOnly } from '../components/timeline';
import { Button, Card, Select } from '../components/ui';
import type { BadgeTone } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import type {
  OrganizerReportSummaryData,
  ReportParticipationBreakdownItem,
} from '../lib/organizerReportSummary';
import { getOrganizerReportSummary, type ActivitySummaryOption } from '../lib/reports';
import { listActivityTimeline } from '../lib/timeline';
import type { TimelineMilestone } from '../types/timeline';
import './OrganizerReportSummaryPage.css';

type ReportMode = 'live' | 'completed' | 'upcoming' | 'default';
type ActivityStatusKey = 'live' | 'upcoming' | 'completed' | 'draft' | 'unknown';

interface ReportActionItem {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionLabel?: string;
  onAction?: () => void;
}

interface KpiItem {
  key: string;
  label: string;
  value: string;
  helper?: string;
}

interface FeedbackOverviewModel {
  mode: 'no-feedback' | 'no-valid-feedback' | 'has-valid-feedback';
  title: string;
  description: string;
  validFeedbackCount: number;
  spamFeedbackCount: number;
  averageRating: number | null;
  quote?: string;
  sentiments: Array<{ label: 'Positive' | 'Neutral' | 'Negative'; count: number }>;
  showSpamNote: boolean;
}

interface ActivityStatusMeta {
  key: ActivityStatusKey;
  label: string;
  helper: string;
}

interface ParticipationSectionModel {
  title: string;
  rows: ReportParticipationBreakdownItem[];
}

function matchesSearch(searchTerm: string, value: string) {
  return value.toLowerCase().includes(searchTerm.toLowerCase());
}

function parseCount(value: string) {
  const matched = String(value ?? '').match(/\d+/g);
  if (!matched || matched.length === 0) {
    return 0;
  }
  return Number.parseInt(matched.join(''), 10) || 0;
}

function getFactCount(report: OrganizerReportSummaryData, key: string) {
  const value = report.analyticsFacts?.find((fact) => fact.key === key)?.value;
  return value ? parseCount(value) : 0;
}

function toValidDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateRange(startValue: string | null | undefined, endValue: string | null | undefined) {
  const startDate = toValidDate(startValue);
  const endDate = toValidDate(endValue);

  if (!startDate && !endDate) {
    return 'No schedule available';
  }

  const fullFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });

  if (startDate && endDate) {
    const sameDay =
      startDate.getFullYear() === endDate.getFullYear() &&
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getDate() === endDate.getDate();
    if (sameDay) {
      return fullFormatter.format(startDate);
    }

    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    if (sameYear) {
      const shortFormatter = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: '2-digit',
      });
      return `${shortFormatter.format(startDate)} - ${shortFormatter.format(endDate)}, ${startDate.getFullYear()}`;
    }

    return `${fullFormatter.format(startDate)} - ${fullFormatter.format(endDate)}`;
  }

  if (startDate) {
    return `From ${fullFormatter.format(startDate)}`;
  }

  if (endDate) {
    return `Until ${fullFormatter.format(endDate)}`;
  }

  return 'No schedule available';
}

function safePercent(numerator: number, denominator: number, digits = 1) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round((numerator / denominator) * 100 * factor) / factor;
}

function formatPercent(value: number, digits = 1) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${safeValue.toFixed(digits)}%`;
}

function formatCountLabel(count: number, singular: string, plural?: string) {
  if (count === 1) {
    return `1 ${singular}`;
  }
  return `${count} ${plural ?? `${singular}s`}`;
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function isCompletedActivity(status: string | null | undefined) {
  return normalizeStatus(status) === 'completed';
}

function isLiveActivity(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return normalized === 'published' || normalized === 'live';
}

function getReportMode(input: {
  status: string | null | undefined;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  fallbackLiveLabel: string | null | undefined;
}): ReportMode {
  const now = new Date();
  const startDate = toValidDate(input.startTime);
  const endDate = toValidDate(input.endTime);
  const fallbackLive = normalizeStatus(input.fallbackLiveLabel).includes('live');

  if (isCompletedActivity(input.status) || (endDate && endDate.getTime() < now.getTime())) {
    return 'completed';
  }

  if (startDate && startDate.getTime() > now.getTime()) {
    return 'upcoming';
  }

  if (isLiveActivity(input.status) || fallbackLive) {
    return 'live';
  }

  return 'default';
}

function getActivityStatusMeta(input: {
  status: string | null | undefined;
  reportMode: ReportMode;
}): ActivityStatusMeta {
  if (input.reportMode === 'completed') {
    return {
      key: 'completed',
      label: 'Completed',
      helper: 'Activity has ended. Review outcomes, attendance, and feedback quality.',
    };
  }

  if (input.reportMode === 'live') {
    return {
      key: 'live',
      label: 'Live Activity',
      helper: 'Activity is live and participation is ongoing.',
    };
  }

  if (input.reportMode === 'upcoming') {
    return {
      key: 'upcoming',
      label: 'Upcoming',
      helper: 'Activity has not started yet.',
    };
  }

  if (normalizeStatus(input.status) === 'draft') {
    return {
      key: 'draft',
      label: 'Draft',
      helper: 'Review activity performance and participation details.',
    };
  }

  return {
    key: 'unknown',
    label: 'Activity',
    helper: 'Review activity performance and participation details.',
  };
}

function getActivityStatusTone(statusKey: ActivityStatusKey): BadgeTone {
  if (statusKey === 'live') {
    return 'success';
  }
  if (statusKey === 'upcoming') {
    return 'info';
  }
  if (statusKey === 'completed') {
    return 'neutral';
  }
  if (statusKey === 'draft') {
    return 'accent';
  }
  return 'neutral';
}

function buildSentimentCounts(report: OrganizerReportSummaryData) {
  const counts = {
    positive: 0,
    neutral: 0,
    negative: 0,
    spam: 0,
  };

  report.sentimentChips.forEach((chip) => {
    const normalized = chip.label.toLowerCase();
    const value = parseCount(chip.label);
    const safeValue = value > 0 ? value : 0;

    if (normalized.includes('positive') || normalized === 'pos') {
      counts.positive += safeValue;
      return;
    }

    if (normalized.includes('negative') || normalized === 'neg') {
      counts.negative += safeValue;
      return;
    }

    if (normalized.includes('neutral') || normalized === 'neu') {
      counts.neutral += safeValue;
      return;
    }

    if (normalized.includes('spam')) {
      counts.spam += safeValue;
    }
  });

  return counts;
}

function getFeedbackCopyForReportMode(input: {
  reportMode: ReportMode;
  validFeedbackCount: number;
  spamFeedbackCount: number;
}) {
  const { reportMode, validFeedbackCount, spamFeedbackCount } = input;
  if (validFeedbackCount > 0) {
    return null;
  }

  if (spamFeedbackCount > 0) {
    const subject = formatCountLabel(spamFeedbackCount, 'feedback submission');
    const verb = spamFeedbackCount === 1 ? 'was' : 'were';
    if (reportMode === 'completed') {
      return {
        mode: 'no-valid-feedback' as const,
        title: 'No valid feedback collected',
        description: `${subject} ${verb} flagged as spam and excluded from rating, sentiment, and insights.`,
      };
    }
    return {
      mode: 'no-valid-feedback' as const,
      title: 'No valid feedback yet',
      description: `${subject} ${verb} flagged as spam and excluded from rating, sentiment, and insights.`,
    };
  }

  if (reportMode === 'completed') {
    return {
      mode: 'no-feedback' as const,
      title: 'No feedback collected',
      description: 'No valid feedback was collected for this activity.',
    };
  }

  return {
    mode: 'no-feedback' as const,
    title: 'No feedback yet',
    description: 'Feedback insights will appear after volunteers submit valid feedback.',
  };
}

function buildFeedbackOverviewModel(input: {
  reportMode: ReportMode;
  validFeedbackCount: number;
  spamFeedbackCount: number;
  averageRating: number | null;
  quote?: string;
  sentiments: { positive: number; neutral: number; negative: number };
}): FeedbackOverviewModel {
  const feedbackCopy = getFeedbackCopyForReportMode(input);
  if (feedbackCopy) {
    return {
      mode: feedbackCopy.mode,
      title: feedbackCopy.title,
      description: feedbackCopy.description,
      validFeedbackCount: input.validFeedbackCount,
      spamFeedbackCount: input.spamFeedbackCount,
      averageRating: null,
      quote: undefined,
      sentiments: [],
      showSpamNote: false,
    };
  }

  return {
    mode: 'has-valid-feedback',
    title: 'Feedback Overview',
    description: '',
    validFeedbackCount: input.validFeedbackCount,
    spamFeedbackCount: input.spamFeedbackCount,
    averageRating: input.averageRating,
    quote: input.quote,
    sentiments: [
      { label: 'Positive', count: input.sentiments.positive },
      { label: 'Neutral', count: input.sentiments.neutral },
      { label: 'Negative', count: input.sentiments.negative },
    ],
    showSpamNote: input.spamFeedbackCount > 0,
  };
}

function getKpiCardsForReportMode(input: {
  reportMode: ReportMode;
  registeredCount: number;
  checkedInCount: number;
  pendingApprovalCount: number;
  validFeedbackCount: number;
  spamFeedbackCount: number;
  capacity: number | null;
  completionRatePercent: number;
  capacityUsedPercent: number | null;
}): KpiItem[] {
  const checkedInRatePercent = safePercent(input.checkedInCount, input.registeredCount);

  if (input.reportMode === 'completed') {
    return [
      {
        key: 'registered',
        label: 'REGISTERED',
        value: String(input.registeredCount),
        helper: input.capacity ? `of ${input.capacity} slots` : 'No capacity limit',
      },
      {
        key: 'attendance',
        label: 'ATTENDANCE',
        value: String(input.checkedInCount),
        helper: `${formatPercent(checkedInRatePercent)} of registered`,
      },
      {
        key: 'final-turnout',
        label: 'FINAL TURNOUT',
        value: input.capacityUsedPercent === null ? 'N/A' : formatPercent(input.capacityUsedPercent),
        helper:
          input.capacityUsedPercent === null
            ? 'No capacity limit'
            : `${input.registeredCount} of ${input.capacity} slots`,
      },
      {
        key: 'completion-rate',
        label: 'COMPLETION RATE',
        value: formatPercent(input.completionRatePercent),
        helper: 'checked-in / registered',
      },
      {
        key: 'feedback-quality',
        label: 'FEEDBACK QUALITY',
        value:
          input.validFeedbackCount > 0
            ? `${input.validFeedbackCount} valid`
            : input.spamFeedbackCount > 0
              ? 'No valid'
              : 'No feedback',
        helper:
          input.spamFeedbackCount > 0
            ? `${input.spamFeedbackCount} spam excluded`
            : 'based on volunteer feedback',
      },
    ];
  }

  return [
    {
      key: 'registered',
      label: 'REGISTERED',
      value: String(input.registeredCount),
      helper: input.capacity ? `of ${input.capacity} slots` : 'No capacity limit',
    },
    {
      key: 'checked-in',
      label: 'CHECKED-IN',
      value: String(input.checkedInCount),
      helper: `${formatPercent(checkedInRatePercent)} of registered`,
    },
    {
      key: 'pending',
      label: 'PENDING APPROVAL',
      value: String(input.pendingApprovalCount),
      helper: input.pendingApprovalCount > 0 ? 'waiting for review' : 'no pending reviews',
    },
    {
      key: 'completion-rate',
      label: 'COMPLETION RATE',
      value: formatPercent(input.completionRatePercent),
      helper: 'checked-in / registered',
    },
    {
      key: 'capacity-filled',
      label: 'CAPACITY FILLED',
      value: input.capacityUsedPercent === null ? 'N/A' : formatPercent(input.capacityUsedPercent),
      helper:
        input.capacityUsedPercent === null
          ? 'No capacity limit'
          : `${input.registeredCount} of ${input.capacity} slots`,
    },
  ];
}

function getParticipationSectionModel(input: {
  reportMode: ReportMode;
  registeredCount: number;
  checkedInCount: number;
  pendingApprovalCount: number;
  capacity: number | null;
}): ParticipationSectionModel {
  const { reportMode, registeredCount, checkedInCount, pendingApprovalCount, capacity } = input;
  const unusedSlots = capacity ? Math.max(capacity - registeredCount, 0) : 0;
  const notCheckedIn = Math.max(registeredCount - checkedInCount, 0);
  const capacityUsedPercent = capacity ? safePercent(registeredCount, capacity) : 0;
  const attendanceRate = safePercent(checkedInCount, registeredCount);
  const pendingRate = safePercent(pendingApprovalCount, registeredCount);

  if (reportMode === 'completed') {
    return {
      title: 'Outcome Breakdown',
      rows: [
        {
          label: 'Capacity Used',
          value: capacity
            ? `${registeredCount} / ${capacity} slots · ${formatPercent(capacityUsedPercent)}`
            : 'No capacity limit',
          progress: capacity ? capacityUsedPercent : 0,
          tone: 'accent',
        },
        {
          label: 'Attendance Result',
          value: `${checkedInCount} checked-in · ${notCheckedIn} not checked-in`,
          progress: attendanceRate,
          tone: 'success',
          helper: `${formatPercent(attendanceRate)} attendance rate`,
        },
        {
          label: 'Registration Outcome',
          value: capacity
            ? `${registeredCount} registered · ${unusedSlots} unused slots`
            : `${registeredCount} registered`,
          progress: capacity ? capacityUsedPercent : 0,
          tone: 'muted',
        },
        {
          label: 'Approval at Close',
          value:
            pendingApprovalCount > 0
              ? `${pendingApprovalCount} registrations were still pending when the activity ended`
              : 'No pending approvals at close',
          progress: pendingRate,
          tone: 'muted',
        },
      ],
    };
  }

  return {
    title: 'Participation Funnel',
    rows: [
      {
        label: 'Capacity',
        value: capacity ? `${capacity} slots` : 'No capacity limit',
        progress: capacity ? 100 : 0,
        tone: 'accent',
      },
      {
        label: 'Filled Slots',
        value: capacity
          ? `${registeredCount} / ${capacity} slots · ${formatPercent(capacityUsedPercent)}`
          : `${registeredCount} volunteers`,
        progress: capacity ? capacityUsedPercent : 0,
        tone: 'accent',
      },
      {
        label: 'Open Slots',
        value: capacity ? `${unusedSlots} open slots` : 'No capacity limit',
        progress: capacity ? safePercent(unusedSlots, capacity) : 0,
        tone: 'muted',
      },
      {
        label: 'Attendance',
        value: `${checkedInCount} / ${registeredCount} registered · ${formatPercent(attendanceRate)}`,
        progress: attendanceRate,
        tone: 'success',
      },
      {
        label: 'Approval Queue',
        value: `${pendingApprovalCount} waiting`,
        progress: pendingRate,
        tone: 'muted',
      },
    ],
  };
}

function buildReportActions(input: {
  reportMode: ReportMode;
  activityId: string;
  registeredCount: number;
  checkedInCount: number;
  pendingApprovalCount: number;
  capacity: number | null;
  validFeedbackCount: number;
  spamFeedbackCount: number;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const {
    reportMode,
    activityId,
    registeredCount,
    checkedInCount,
    pendingApprovalCount,
    capacity,
    validFeedbackCount,
    spamFeedbackCount,
    navigate,
  } = input;

  const encodedActivityId = activityId ? encodeURIComponent(activityId) : '';
  const capacityUsedPercent = capacity ? safePercent(registeredCount, capacity) : null;
  const checkedInPercent = safePercent(checkedInCount, registeredCount);
  const actions: ReportActionItem[] = [];

  if (reportMode === 'completed') {
    if (capacity && capacityUsedPercent !== null && capacityUsedPercent < 50) {
      actions.push({
        id: 'completed-low-turnout',
        title: 'Low turnout recorded',
        description: `Only ${registeredCount} of ${capacity} slots were filled. Use this insight to improve promotion for future activities.`,
        priority: 'medium',
        actionLabel: 'View Activity',
        onAction: () =>
          navigate(encodedActivityId ? `/organizer/activities?activityId=${encodedActivityId}` : '/organizer/activities'),
      });
    }

    if (registeredCount > 0 && checkedInCount < registeredCount) {
      actions.push({
        id: 'completed-incomplete-attendance',
        title: 'Incomplete attendance',
        description: `${checkedInCount} of ${registeredCount} registered volunteers checked in. Review attendance records if needed.`,
        priority: 'medium',
        actionLabel: 'View Attendance',
        onAction: () =>
          navigate(encodedActivityId ? `/organizer/checkins?activityId=${encodedActivityId}` : '/organizer/checkins'),
      });
    }

    if (pendingApprovalCount > 0) {
      actions.push({
        id: 'completed-pending-at-close',
        title: 'Registrations left pending',
        description: `${pendingApprovalCount} registrations were still pending when the activity ended. Review them for record accuracy.`,
        priority: 'high',
        actionLabel: 'Review Applications',
        onAction: () =>
          navigate(
            encodedActivityId
              ? `/organizer/registrations?activityId=${encodedActivityId}`
              : '/organizer/registrations'
          ),
      });
    }

    if (validFeedbackCount === 0 && spamFeedbackCount > 0) {
      actions.push({
        id: 'completed-no-usable-feedback',
        title: 'No usable feedback collected',
        description: 'All submitted feedback was flagged as spam, so report insights cannot be generated.',
        priority: 'low',
        actionLabel: 'Review Feedback',
        onAction: () => navigate(encodedActivityId ? `/feedback?activityId=${encodedActivityId}` : '/feedback'),
      });
    }

    if (validFeedbackCount === 0 && spamFeedbackCount === 0) {
      actions.push({
        id: 'completed-no-feedback',
        title: 'No feedback collected',
        description: 'No valid feedback was collected for this activity.',
        priority: 'low',
        actionLabel: 'View Feedback',
        onAction: () => navigate(encodedActivityId ? `/feedback?activityId=${encodedActivityId}` : '/feedback'),
      });
    }
  } else {
    if (capacity && capacityUsedPercent !== null && capacityUsedPercent < 50) {
      actions.push({
        id: 'live-low-capacity',
        title: 'Capacity is still low',
        description: `Only ${registeredCount} of ${capacity} slots are filled. Consider promoting this activity or inviting more volunteers.`,
        priority: 'medium',
        actionLabel: 'Manage Activity',
        onAction: () =>
          navigate(encodedActivityId ? `/organizer/activities?activityId=${encodedActivityId}` : '/organizer/activities'),
      });
    }

    if (pendingApprovalCount > 0) {
      actions.push({
        id: 'live-pending-registrations',
        title: 'Review pending registrations',
        description: `${formatCountLabel(pendingApprovalCount, 'volunteer')} waiting for approval.`,
        priority: 'high',
        actionLabel: 'Review Applications',
        onAction: () =>
          navigate(
            encodedActivityId
              ? `/organizer/registrations?activityId=${encodedActivityId}`
              : '/organizer/registrations'
          ),
      });
    }

    if (registeredCount > 0 && checkedInPercent < 60) {
      actions.push({
        id: 'live-low-checkin',
        title: 'Check-in progress is low',
        description: `Only ${checkedInCount} of ${registeredCount} registered volunteers have checked in.`,
        priority: 'medium',
        actionLabel: 'Manage Attendance',
        onAction: () =>
          navigate(encodedActivityId ? `/organizer/checkins?activityId=${encodedActivityId}` : '/organizer/checkins'),
      });
    }

    if (validFeedbackCount === 0 && spamFeedbackCount > 0) {
      actions.push({
        id: 'live-no-usable-feedback',
        title: 'No usable feedback yet',
        description: 'All submitted feedback was flagged as spam, so insights cannot be generated yet.',
        priority: 'low',
        actionLabel: 'Review Feedback',
        onAction: () => navigate(encodedActivityId ? `/feedback?activityId=${encodedActivityId}` : '/feedback'),
      });
    }
  }

  const priorityRank: Record<ReportActionItem['priority'], number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return actions
    .filter((item, index, source) => source.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority] || left.title.localeCompare(right.title))
    .slice(0, 3);
}

function getActionSectionCopy(reportMode: ReportMode) {
  if (reportMode === 'completed') {
    return {
      title: 'Post-Activity Follow-up',
      emptyTitle: 'No follow-up needed',
      emptyMessage: 'This activity has no urgent post-activity issues.',
    };
  }

  return {
    title: 'Action Needed',
    emptyTitle: 'No urgent action needed',
    emptyMessage: 'This activity is currently on track.',
  };
}

export function OrganizerReportSummaryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<OrganizerReportSummaryData | null>(null);
  const [availableActivities, setAvailableActivities] = useState<ActivitySummaryOption[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState(() => searchParams.get('activityId')?.trim() ?? '');
  const [timelineMilestones, setTimelineMilestones] = useState<TimelineMilestone[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const requestedActivityId = searchParams.get('activityId')?.trim() ?? '';

  const loadReport = useCallback(
    async (activityId?: string) => {
      if (!session?.access_token) {
        setLoading(false);
        setReport(null);
        setError('No active session token.');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await getOrganizerReportSummary(session.access_token, activityId);
        setReport(response.report);
        setAvailableActivities(response.meta.availableActivities ?? []);
        setSelectedActivityId(response.meta.activityId ?? activityId ?? '');
      } catch (loadError) {
        setReport(null);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load report analytics.');
      } finally {
        setLoading(false);
      }
    },
    [session?.access_token]
  );

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('org-report-printing');
    };

    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('org-report-printing');
    };
  }, []);

  useEffect(() => {
    void loadReport(requestedActivityId || undefined);
  }, [loadReport, requestedActivityId]);

  const timelineActivityId = selectedActivityId || requestedActivityId;

  useEffect(() => {
    if (!timelineActivityId) {
      setTimelineMilestones([]);
      setTimelineError(null);
      setTimelineLoading(false);
      return;
    }
    if (!session?.access_token) {
      setTimelineMilestones([]);
      setTimelineError('No active session token.');
      setTimelineLoading(false);
      return;
    }

    let cancelled = false;
    setTimelineLoading(true);
    setTimelineError(null);

    void listActivityTimeline(timelineActivityId, session.access_token)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setTimelineMilestones(response.milestones);
      })
      .catch((timelineLoadError) => {
        if (!cancelled) {
          setTimelineMilestones([]);
          setTimelineError(
            timelineLoadError instanceof Error ? timelineLoadError.message : 'Unable to load timeline summary.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTimelineLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, timelineActivityId]);

  const selectedActivity = useMemo(
    () => availableActivities.find((activity) => activity.id === selectedActivityId) ?? null,
    [availableActivities, selectedActivityId]
  );

  const reportMode = useMemo(
    () =>
      getReportMode({
        status: selectedActivity?.status,
        startTime: selectedActivity?.start_time,
        endTime: selectedActivity?.end_time,
        fallbackLiveLabel: report?.liveLabel ?? null,
      }),
    [
      report?.liveLabel,
      selectedActivity?.end_time,
      selectedActivity?.start_time,
      selectedActivity?.status,
    ]
  );

  const activityDateRange = useMemo(
    () => formatDateRange(selectedActivity?.start_time, selectedActivity?.end_time),
    [selectedActivity?.end_time, selectedActivity?.start_time]
  );

  const activityStatusMeta = useMemo(
    () => getActivityStatusMeta({ status: selectedActivity?.status, reportMode }),
    [reportMode, selectedActivity?.status]
  );

  const reportCounts = useMemo(() => {
    if (!report) {
      return {
        registered: 0,
        checkedIn: 0,
        pending: 0,
        totalFeedbackCount: 0,
        validFeedbackCount: 0,
        spamFeedbackCount: 0,
        capacity: null as number | null,
      };
    }

    const breakdownByLabel = new Map(
      report.participationBreakdown.map((item) => [item.label.trim().toLowerCase(), Number(item.value) || 0])
    );

    const fallbackRegistered = breakdownByLabel.get('registered volunteers') ?? 0;
    const fallbackCheckedIn = breakdownByLabel.get('checked in') ?? 0;
    const fallbackPending = breakdownByLabel.get('pending approval') ?? 0;
    const stats = report.feedbackStats;
    const participationStats = report.participationStats;

    return {
      registered:
        typeof participationStats?.registeredCount === 'number'
          ? participationStats.registeredCount
          : fallbackRegistered,
      checkedIn:
        typeof participationStats?.checkedInCount === 'number'
          ? participationStats.checkedInCount
          : fallbackCheckedIn,
      pending:
        typeof participationStats?.pendingApprovalCount === 'number'
          ? participationStats.pendingApprovalCount
          : fallbackPending,
      totalFeedbackCount:
        typeof stats?.totalCount === 'number' ? stats.totalCount : getFactCount(report, 'feedback_total_count'),
      validFeedbackCount:
        typeof stats?.validCount === 'number' ? stats.validCount : getFactCount(report, 'feedback_count'),
      spamFeedbackCount:
        typeof stats?.spamCount === 'number' ? stats.spamCount : getFactCount(report, 'feedback_spam_count'),
      capacity:
        typeof participationStats?.capacity === 'number' && participationStats.capacity > 0
          ? participationStats.capacity
          : typeof selectedActivity?.capacity === 'number' && selectedActivity.capacity > 0
            ? selectedActivity.capacity
            : null,
    };
  }, [report, selectedActivity?.capacity]);

  const completionRatePercent = useMemo(
    () => safePercent(reportCounts.checkedIn, reportCounts.registered),
    [reportCounts.checkedIn, reportCounts.registered]
  );

  const capacityUsedPercent = useMemo(() => {
    if (!reportCounts.capacity || reportCounts.capacity <= 0) {
      return null;
    }
    return safePercent(reportCounts.registered, reportCounts.capacity);
  }, [reportCounts.capacity, reportCounts.registered]);

  const kpiItems = useMemo(
    () =>
      getKpiCardsForReportMode({
        reportMode,
        registeredCount: reportCounts.registered,
        checkedInCount: reportCounts.checkedIn,
        pendingApprovalCount: reportCounts.pending,
        validFeedbackCount: reportCounts.validFeedbackCount,
        spamFeedbackCount: reportCounts.spamFeedbackCount,
        capacity: reportCounts.capacity,
        completionRatePercent,
        capacityUsedPercent,
      }),
    [
      capacityUsedPercent,
      completionRatePercent,
      reportCounts.capacity,
      reportCounts.checkedIn,
      reportCounts.pending,
      reportCounts.registered,
      reportCounts.spamFeedbackCount,
      reportCounts.validFeedbackCount,
      reportMode,
    ]
  );

  const sentimentCounts = useMemo(() => {
    if (!report) {
      return { positive: 0, neutral: 0, negative: 0, spam: 0 };
    }
    return buildSentimentCounts(report);
  }, [report]);

  const effectiveFeedbackCounts = useMemo(() => {
    if (!report) {
      return {
        total: 0,
        valid: 0,
        spam: 0,
      };
    }

    return {
      total: reportCounts.totalFeedbackCount,
      valid: reportCounts.validFeedbackCount,
      spam: reportCounts.spamFeedbackCount,
    };
  }, [report, reportCounts.spamFeedbackCount, reportCounts.totalFeedbackCount, reportCounts.validFeedbackCount]);

  const hasFeedbackInsights = useMemo(
    () =>
      effectiveFeedbackCounts.valid > 0 &&
      Boolean((report?.strengths?.length ?? 0) > 0 || (report?.weaknesses?.length ?? 0) > 0),
    [effectiveFeedbackCounts.valid, report?.strengths, report?.weaknesses]
  );

  const feedbackQuote = useMemo(() => {
    if (!report || effectiveFeedbackCounts.valid <= 0) {
      return undefined;
    }

    const candidate = String(report.feedbackQuote ?? '').trim();
    if (!candidate || candidate.toLowerCase().includes('no valid feedback')) {
      return undefined;
    }

    return candidate;
  }, [effectiveFeedbackCounts.valid, report]);

  const feedbackOverview = useMemo(
    () =>
      buildFeedbackOverviewModel({
        reportMode,
        validFeedbackCount: effectiveFeedbackCounts.valid,
        spamFeedbackCount: effectiveFeedbackCounts.spam,
        averageRating: effectiveFeedbackCounts.valid > 0 ? report?.feedbackRating ?? null : null,
        quote: feedbackQuote,
        sentiments: {
          positive: sentimentCounts.positive,
          neutral: sentimentCounts.neutral,
          negative: sentimentCounts.negative,
        },
      }),
    [
      effectiveFeedbackCounts.spam,
      effectiveFeedbackCounts.valid,
      feedbackQuote,
      report?.feedbackRating,
      reportMode,
      sentimentCounts.negative,
      sentimentCounts.neutral,
      sentimentCounts.positive,
    ]
  );

  const participationModel = useMemo(
    () =>
      getParticipationSectionModel({
        reportMode,
        registeredCount: reportCounts.registered,
        checkedInCount: reportCounts.checkedIn,
        pendingApprovalCount: reportCounts.pending,
        capacity: reportCounts.capacity,
      }),
    [
      reportCounts.capacity,
      reportCounts.checkedIn,
      reportCounts.pending,
      reportCounts.registered,
      reportMode,
    ]
  );

  const actionItems = useMemo(
    () =>
      buildReportActions({
        reportMode,
        activityId: selectedActivityId || requestedActivityId,
        registeredCount: reportCounts.registered,
        checkedInCount: reportCounts.checkedIn,
        pendingApprovalCount: reportCounts.pending,
        capacity: reportCounts.capacity,
        validFeedbackCount: effectiveFeedbackCounts.valid,
        spamFeedbackCount: effectiveFeedbackCounts.spam,
        navigate,
      }),
    [
      effectiveFeedbackCounts.spam,
      effectiveFeedbackCounts.valid,
      navigate,
      reportCounts.capacity,
      reportCounts.checkedIn,
      reportCounts.pending,
      reportCounts.registered,
      reportMode,
      requestedActivityId,
      selectedActivityId,
    ]
  );

  const filteredActionItems = useMemo(() => {
    const normalized = searchTerm.trim();
    if (!normalized) {
      return actionItems;
    }

    return actionItems.filter(
      (item) => matchesSearch(normalized, item.title) || matchesSearch(normalized, item.description)
    );
  }, [actionItems, searchTerm]);

  const actionSectionCopy = useMemo(() => getActionSectionCopy(reportMode), [reportMode]);
  const shouldShowTimeline = timelineMilestones.length > 0;

  const handleExportPdf = () => {
    setError(null);
    document.body.classList.add('org-report-printing');
    window.print();
  };

  const handleShareReport = async () => {
    try {
      setMessage(null);
      setError(null);

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        setMessage('Report link copied.');
        return;
      }

      throw new Error('Clipboard is not available in this browser. Please copy the URL from the address bar.');
    } catch (shareError) {
      setMessage(null);
      setError(shareError instanceof Error ? shareError.message : 'Unable to copy the report link right now.');
    }
  };

  const handleActivityChange = (nextActivityId: string) => {
    setMessage(null);
    setError(null);
    setSelectedActivityId(nextActivityId);

    const nextParams = new URLSearchParams(searchParams);
    if (nextActivityId) {
      nextParams.set('activityId', nextActivityId);
    } else {
      nextParams.delete('activityId');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const printDurationValue = report ? activityDateRange : '--';

  return (
    <OrganizerShell
      activeNav="reports"
      headerActions={
        <>
          <Button onClick={handleExportPdf} type="button" variant="secondary">
            <Download size={15} />
            <span>Export PDF</span>
          </Button>
          <Button onClick={() => void handleShareReport()} type="button">
            <Share2 size={15} />
            <span>Share Report</span>
          </Button>
        </>
      }
      onSearchChange={setSearchTerm}
      pageContext={
        <div className="org-report-breadcrumb" aria-label="Breadcrumb">
          <span>Dashboard</span>
          <span>/</span>
          <span>Activity Reports</span>
          <span>/</span>
          <span>{report?.activityTitle ?? 'Summary'}</span>
        </div>
      }
      pageSubtitle="Review performance, feedback quality, and follow-up actions in one place."
      pageTitle="Activity Report"
      searchPlaceholder="Search action items..."
      searchValue={searchTerm}
    >
      <section className="org-report-page org-report-export-root">
        <header className="org-report-print-header">
          <div>
            <p>V-Connect Management</p>
            <h1>Activity Report</h1>
          </div>
          <div className="org-report-print-meta">
            <span>{report?.activityTitle ?? '--'}</span>
            <span className="org-report-print-status">{activityStatusMeta.label}</span>
            <strong>{printDurationValue}</strong>
          </div>
        </header>

        {message && <p className="form-success">{message}</p>}
        {report && error && <p className="form-error">{error}</p>}

        <Card as="section" className="org-report-activity-picker">
          <div className="org-report-activity-picker-row">
            <div className="org-report-activity-picker-copy">
              <p className="org-report-eyebrow">SELECT ACTIVITY</p>
              <Select
                className="org-report-activity-select"
                disabled={loading || availableActivities.length === 0}
                onChange={(event) => handleActivityChange(event.target.value)}
                value={selectedActivityId}
              >
                {availableActivities.length === 0 ? (
                  <option value="">No activities available</option>
                ) : (
                  availableActivities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.title}
                    </option>
                  ))
                )}
              </Select>
            </div>

            <div className="org-report-activity-meta">
              <span className="muted">{activityDateRange}</span>
            </div>
          </div>
        </Card>

        {loading ? (
          <section className="card org-report-lower-card org-report-empty-card">
            <EmptyLoadingErrorState
              description="Pulling the latest participation and feedback insights for this activity report."
              state="loading"
              title="Loading report analytics"
            />
          </section>
        ) : report ? (
          <>
            <ReportSummaryHeroCard
              badgeTone={getActivityStatusTone(activityStatusMeta.key)}
              durationLabel="Duration"
              durationValue={activityDateRange}
              liveLabel={activityStatusMeta.label}
              metrics={[]}
              summary={activityStatusMeta.helper}
              title={report.activityTitle}
            />

            <section className="org-report-kpi-grid" aria-label="KPI summary">
              {kpiItems.map((kpi) => (
                <Card as="article" className="org-report-kpi-card" key={kpi.key}>
                  <p>{kpi.label}</p>
                  <strong>{kpi.value}</strong>
                  {kpi.helper ? <small>{kpi.helper}</small> : null}
                </Card>
              ))}
            </section>

            <div className="org-report-main-grid">
              <div className="org-report-main-col">
                <ParticipationCountCard rows={participationModel.rows} title={participationModel.title} />
              </div>

              <div className="org-report-main-col">
                <FeedbackOverviewCard
                  ariaLabel="Open feedback review"
                  onClick={() => {
                    const nextActivityId = selectedActivityId || requestedActivityId;
                    navigate(nextActivityId ? `/feedback?activityId=${encodeURIComponent(nextActivityId)}` : '/feedback');
                  }}
                  overview={feedbackOverview}
                />

                {hasFeedbackInsights ? (
                  <Card as="section" className="org-report-lower-card org-report-feedback-insights-card">
                    <div className="org-report-card-head">
                      <h3>Feedback Insights</h3>
                    </div>
                    <div className="org-report-strength-grid">
                      {Array.isArray(report.strengths) && report.strengths.length > 0 ? (
                        <div>
                          <h4>Strengths</h4>
                          <ul className="org-report-list">
                            {report.strengths.map((item) => (
                              <li key={`strength-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {Array.isArray(report.weaknesses) && report.weaknesses.length > 0 ? (
                        <div>
                          <h4>Weaknesses</h4>
                          <ul className="org-report-list">
                            {report.weaknesses.map((item) => (
                              <li key={`weakness-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                ) : (
                  <Card as="section" className="org-report-lower-card org-report-feedback-insights-card">
                    <div className="org-report-card-head">
                      <h3>Feedback Insights</h3>
                    </div>
                    <p className="muted">
                      {reportMode === 'completed'
                        ? 'Insights are unavailable because no valid feedback was collected.'
                        : 'Insights will appear after volunteers submit valid feedback.'}
                    </p>
                  </Card>
                )}
              </div>
            </div>

            <IssueHighlightsCard
              title={actionSectionCopy.title}
              emptyTitle={actionSectionCopy.emptyTitle}
              emptyMessage={
                searchTerm.trim() && actionItems.length > 0
                  ? 'No action items match the current search.'
                  : actionSectionCopy.emptyMessage
              }
              issues={filteredActionItems}
            />

            {shouldShowTimeline ? (
              <Card as="section" className="org-report-lower-card org-report-timeline-summary-card">
                <div className="org-report-card-head">
                  <h3>Activity Timeline</h3>
                </div>
                <EventTimelineReadOnly
                  compact
                  emptyDescription="No organizer-managed milestones are linked to this activity yet."
                  milestones={timelineMilestones}
                  loading={timelineLoading}
                  error={timelineError}
                />
              </Card>
            ) : null}
          </>
        ) : (
          <section className="card org-report-lower-card org-report-empty-card">
            <EmptyLoadingErrorState
              action={
                error ? (
                  <Button onClick={() => void loadReport(selectedActivityId || undefined)} type="button" variant="secondary">
                    Retry
                  </Button>
                ) : undefined
              }
              description={error ?? 'No report data is available right now.'}
              state={error ? 'error' : 'empty'}
              title={error ? 'Unable to load report summary' : 'No report data available'}
            />
          </section>
        )}
      </section>
    </OrganizerShell>
  );
}
