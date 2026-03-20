import { supabaseAdmin } from '../database/supabase.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_PARTICIPATION_STATUSES = new Set(['pending', 'approved', 'checked_in']);

function asDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateLabel(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.trunc(value)));
}

function formatPercent(value, { showSign = false } = {}) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safeValue * 10) / 10;
  const sign = showSign && rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}%`;
}

function calculateRatio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return (numerator / denominator) * 100;
}

function clampProgress(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function createEmptyReportSummary() {
  return {
    liveLabel: 'Activity Snapshot',
    activityTitle: 'No organizer activity found',
    durationLabel: 'Duration',
    durationValue: 'No schedule available',
    summary:
      'Create or publish an activity to generate participation, feedback, and issue insights in this report summary view.',
    miniMetrics: [
      { label: 'Completion Rate', value: '0.0%' },
      { label: 'Avg. Feedback Rating', value: 'N/A' },
      { label: 'Capacity Filled', value: '0.0%' },
    ],
    participationTotal: '0',
    participationTrend: '0.0%',
    participationTrendLabel: 'vs previous matching window',
    participationBreakdown: [
      { label: 'Registered Volunteers', value: 0, progress: 0, tone: 'accent' },
      { label: 'Checked In', value: 0, progress: 0, tone: 'success' },
      { label: 'Pending Approval', value: 0, progress: 0, tone: 'muted' },
    ],
    feedbackRating: 0,
    feedbackQuote: 'Feedback will appear after volunteers submit responses.',
    sentimentChips: [{ label: 'No feedback yet', tone: 'neutral' }],
    issues: [],
  };
}

async function listOrganizerActivities(organizerId) {
  const { data, error } = await supabaseAdmin
    .from('activities')
    .select('id, title, status, start_time, end_time, capacity, organizer_id, created_at')
    .eq('organizer_id', organizerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function listActivityParticipations(activityId) {
  const { data, error } = await supabaseAdmin
    .from('activity_participations')
    .select('id, status, created_at, updated_at, checked_in_at')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function listFeedbackByParticipationIds(participationIds) {
  if (participationIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('participation_feedback')
    .select('id, participation_id, rating, comment, created_at')
    .in('participation_id', participationIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function countPreviousWindowParticipations(activityId, previousStart, previousEnd) {
  const { count, error } = await supabaseAdmin
    .from('activity_participations')
    .select('*', { head: true, count: 'exact' })
    .eq('activity_id', activityId)
    .gte('created_at', previousStart.toISOString())
    .lt('created_at', previousEnd.toISOString());

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

function buildDurationValue(startDate, endDate) {
  if (startDate && endDate) {
    return `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
  }
  if (startDate) {
    return `From ${formatDateLabel(startDate)}`;
  }
  if (endDate) {
    return `Until ${formatDateLabel(endDate)}`;
  }
  return 'No schedule available';
}

function buildLiveLabel(status) {
  const normalizedStatus = String(status ?? '').trim().toLowerCase();
  if (normalizedStatus === 'published') {
    return 'Live Activity';
  }
  if (normalizedStatus === 'completed') {
    return 'Completed Activity';
  }
  return 'Activity Snapshot';
}

function summarizeStatuses(participations) {
  return participations.reduce(
    (accumulator, participation) => {
      const status = String(participation.status ?? '').trim().toLowerCase();
      if (!status) {
        return accumulator;
      }

      accumulator[status] = (accumulator[status] ?? 0) + 1;
      return accumulator;
    },
    {}
  );
}

function buildSentimentChips(feedbacks) {
  if (feedbacks.length === 0) {
    return [{ label: 'No feedback yet', tone: 'neutral' }];
  }

  const sentimentCounts = feedbacks.reduce(
    (accumulator, feedback) => {
      const rating = Number(feedback.rating ?? 0);
      if (rating >= 4) {
        accumulator.positive += 1;
      } else if (rating <= 2) {
        accumulator.critical += 1;
      } else {
        accumulator.neutral += 1;
      }
      return accumulator;
    },
    { positive: 0, neutral: 0, critical: 0 }
  );

  const chips = [];
  if (sentimentCounts.positive > 0) {
    chips.push({ label: `Positive (${sentimentCounts.positive})`, tone: 'success' });
  }
  if (sentimentCounts.neutral > 0) {
    chips.push({ label: `Neutral (${sentimentCounts.neutral})`, tone: 'info' });
  }
  if (sentimentCounts.critical > 0) {
    chips.push({ label: `Critical (${sentimentCounts.critical})`, tone: 'danger' });
  }

  return chips.length > 0 ? chips : [{ label: 'No feedback yet', tone: 'neutral' }];
}

function truncateText(value, maxLength = 140) {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function buildIssues({
  pendingCount,
  checkedInCount,
  activeCount,
  capacity,
  feedbacks,
  activityStatus,
}) {
  const issues = [];
  const lowFeedbackRows = feedbacks.filter((feedback) => Number(feedback.rating ?? 0) <= 2);
  const criticalFeedback = lowFeedbackRows.find((feedback) => String(feedback.comment ?? '').trim().length > 0);

  if (lowFeedbackRows.length > 0) {
    issues.push({
      id: 'low-rating-feedback',
      title: `${lowFeedbackRows.length} low-rating feedback responses detected`,
      description: criticalFeedback
        ? truncateText(criticalFeedback.comment)
        : 'Volunteers reported friction points. Review comments to address priority experience issues quickly.',
      priority: 'high',
    });
  }

  if (pendingCount > 0) {
    issues.push({
      id: 'pending-registration-queue',
      title: `${pendingCount} registrations are still pending`,
      description:
        'Approval backlog can reduce volunteer conversion and attendance confidence. Review pending registrations soon.',
      priority: pendingCount >= 5 ? 'high' : 'medium',
    });
  }

  if (Number.isFinite(capacity) && capacity > 0) {
    const fillRate = calculateRatio(activeCount, capacity);
    if (fillRate < 35) {
      issues.push({
        id: 'low-capacity-fill',
        title: 'Capacity fill is below target',
        description: `Only ${formatPercent(fillRate)} of the planned ${formatNumber(capacity)} slots are currently filled.`,
        priority: 'medium',
      });
    }
  }

  const normalizedActivityStatus = String(activityStatus ?? '').trim().toLowerCase();
  if (normalizedActivityStatus === 'completed' && checkedInCount === 0 && activeCount > 0) {
    issues.push({
      id: 'missing-checkins',
      title: 'Completed activity has no check-in records',
      description: 'Attendance check-ins appear incomplete for this activity. Verify check-in workflow and final records.',
      priority: 'high',
    });
  }

  if (feedbacks.length === 0 && checkedInCount > 0) {
    issues.push({
      id: 'missing-feedback',
      title: 'No post-activity feedback submitted',
      description: 'Collecting volunteer feedback helps improve future activity quality and reduce repeat issues.',
      priority: 'low',
    });
  }

  return issues.slice(0, 5);
}

async function buildOrganizerReportSummary({ organizerId, activityId = null }) {
  const activities = await listOrganizerActivities(organizerId);

  if (activities.length === 0) {
    return {
      report: createEmptyReportSummary(),
      meta: {
        generatedAt: new Date().toISOString(),
        hasActivities: false,
        activityId: null,
        availableActivities: [],
      },
    };
  }

  let selectedActivity = activities[0];
  if (activityId) {
    selectedActivity = activities.find((activity) => activity.id === activityId);
    if (!selectedActivity) {
      const notFoundError = new Error('Activity not found for this organizer.');
      notFoundError.statusCode = 404;
      throw notFoundError;
    }
  }

  const participations = await listActivityParticipations(selectedActivity.id);
  const participationIds = participations.map((participation) => participation.id).filter(Boolean);
  const feedbacks = await listFeedbackByParticipationIds(participationIds);

  const statusCounts = summarizeStatuses(participations);
  const pendingCount = statusCounts.pending ?? 0;
  const approvedCount = statusCounts.approved ?? 0;
  const checkedInCount = statusCounts.checked_in ?? 0;
  const activeCount = participations.filter((participation) =>
    ACTIVE_PARTICIPATION_STATUSES.has(String(participation.status ?? '').trim().toLowerCase())
  ).length;
  const totalParticipations = participations.length;
  const capacity = Number(selectedActivity.capacity ?? 0);

  const ratingSum = feedbacks.reduce((sum, feedback) => sum + Number(feedback.rating ?? 0), 0);
  const averageRating = feedbacks.length > 0 ? ratingSum / feedbacks.length : 0;
  const latestFeedbackWithComment = feedbacks.find(
    (feedback) => String(feedback.comment ?? '').trim().length > 0
  );

  const startDate = asDate(selectedActivity.start_time);
  const endDate = asDate(selectedActivity.end_time);
  const now = new Date();
  const fallbackStart = startDate ?? new Date(now.getTime() - 30 * DAY_MS);
  const safeCurrentEnd = endDate && endDate.getTime() > fallbackStart.getTime() ? endDate : now;
  const currentDuration = Math.max(DAY_MS, safeCurrentEnd.getTime() - fallbackStart.getTime());
  const previousStart = new Date(fallbackStart.getTime() - currentDuration);
  const previousEnd = fallbackStart;

  const currentWindowCount = participations.filter((participation) => {
    const createdAt = asDate(participation.created_at);
    if (!createdAt) {
      return false;
    }
    return createdAt.getTime() >= fallbackStart.getTime() && createdAt.getTime() <= safeCurrentEnd.getTime();
  }).length;

  const previousWindowCount = await countPreviousWindowParticipations(
    selectedActivity.id,
    previousStart,
    previousEnd
  );
  const trendPercent = previousWindowCount
    ? ((currentWindowCount - previousWindowCount) / previousWindowCount) * 100
    : currentWindowCount > 0
      ? 100
      : 0;

  const completionRate = calculateRatio(checkedInCount, Math.max(approvedCount + checkedInCount, 1));
  const capacityFilled = capacity > 0 ? calculateRatio(activeCount, capacity) : 0;

  const report = {
    liveLabel: buildLiveLabel(selectedActivity.status),
    activityTitle: String(selectedActivity.title ?? 'Untitled Activity'),
    durationLabel: 'Duration',
    durationValue: buildDurationValue(startDate, endDate),
    summary:
      `${formatNumber(totalParticipations)} participation records were captured for this activity, with ` +
      `${formatNumber(checkedInCount)} check-ins and ${formatNumber(feedbacks.length)} feedback submissions. ` +
      (feedbacks.length > 0
        ? `Average volunteer rating is ${averageRating.toFixed(1)}/5.`
        : 'Feedback data will appear as soon as volunteers submit responses.'),
    miniMetrics: [
      { label: 'Completion Rate', value: formatPercent(completionRate) },
      {
        label: 'Avg. Feedback Rating',
        value: feedbacks.length > 0 ? `${averageRating.toFixed(1)}/5` : 'N/A',
      },
      { label: 'Capacity Filled', value: capacity > 0 ? formatPercent(capacityFilled) : 'N/A' },
    ],
    participationTotal: formatNumber(totalParticipations),
    participationTrend: formatPercent(trendPercent, { showSign: true }),
    participationTrendLabel: 'vs previous matching window',
    participationBreakdown: [
      {
        label: 'Registered Volunteers',
        value: activeCount,
        progress: capacity > 0 ? clampProgress(calculateRatio(activeCount, capacity)) : 0,
        tone: 'accent',
      },
      {
        label: 'Checked In',
        value: checkedInCount,
        progress: clampProgress(calculateRatio(checkedInCount, Math.max(activeCount, 1))),
        tone: 'success',
      },
      {
        label: 'Pending Approval',
        value: pendingCount,
        progress: clampProgress(calculateRatio(pendingCount, Math.max(activeCount, 1))),
        tone: 'muted',
      },
    ],
    feedbackRating: Number(averageRating.toFixed(1)),
    feedbackQuote: latestFeedbackWithComment
      ? truncateText(latestFeedbackWithComment.comment)
      : 'No written feedback has been submitted for this activity yet.',
    sentimentChips: buildSentimentChips(feedbacks),
    issues: buildIssues({
      pendingCount,
      checkedInCount,
      activeCount,
      capacity,
      feedbacks,
      activityStatus: selectedActivity.status,
    }),
  };

  return {
    report,
    meta: {
      generatedAt: new Date().toISOString(),
      hasActivities: true,
      activityId: selectedActivity.id,
      availableActivities: activities.map((activity) => ({
        id: activity.id,
        title: activity.title,
        status: activity.status,
        start_time: activity.start_time,
        end_time: activity.end_time,
      })),
    },
  };
}

export { buildOrganizerReportSummary };
