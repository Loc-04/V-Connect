import { supabaseAdmin } from '../database/supabase.js';
import { classifyFeedbackSemantics } from '../feedback/feedback.classification.js';
import { classifyFeedbackSpam } from '../feedback/feedback.spam.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_PARTICIPATION_STATUSES = new Set(['assigned', 'pending', 'approved', 'checked_in']);
const REPORT_SUMMARY_MODEL_VERSION = 'deterministic-facts-v2-2026-04';

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

function normalizeIssueTag(tag) {
  return String(tag ?? '').trim().toLowerCase();
}

function formatIssueTagLabel(tag) {
  const normalized = normalizeIssueTag(tag);
  const labels = {
    spam: 'Spam',
    safety: 'Safety',
    incident: 'Incident',
    logistics: 'Logistics',
    communication: 'Communication',
    negative: 'Negative sentiment',
    neutral: 'Neutral sentiment',
    positive: 'Positive sentiment',
  };
  return labels[normalized] ?? normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function issueTagPriority(tag) {
  const normalized = normalizeIssueTag(tag);
  if (normalized === 'safety' || normalized === 'incident') {
    return 'high';
  }
  if (normalized === 'logistics' || normalized === 'communication' || normalized === 'negative') {
    return 'medium';
  }
  return 'low';
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
    analyticsFacts: [],
    strengths: [],
    weaknesses: [],
    issueHighlights: [],
    modelVersion: REPORT_SUMMARY_MODEL_VERSION,
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
  return participations.reduce((accumulator, participation) => {
    const status = String(participation.status ?? '').trim().toLowerCase();
    if (!status) {
      return accumulator;
    }
    accumulator[status] = (accumulator[status] ?? 0) + 1;
    return accumulator;
  }, {});
}

function summarizeFeedbackSignals(feedbacks) {
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  const issueCounts = new Map();
  let spamCount = 0;
  let incidentCount = 0;

  for (const feedback of feedbacks) {
    const rating = Number(feedback.rating ?? 0);
    const comment = String(feedback.comment ?? '');
    const semantic = classifyFeedbackSemantics({ comment, rating });
    const spam = classifyFeedbackSpam(comment);

    const sentimentLabel = String(semantic.sentimentLabel ?? 'neutral').toLowerCase();
    if (sentimentLabel === 'positive') {
      sentiment.positive += 1;
    } else if (sentimentLabel === 'negative') {
      sentiment.negative += 1;
    } else {
      sentiment.neutral += 1;
    }

    const issueTags = Array.isArray(semantic.issueTags)
      ? semantic.issueTags.map((tag) => normalizeIssueTag(tag)).filter(Boolean)
      : [];
    for (const tag of issueTags) {
      if (tag === 'positive' || tag === 'neutral') {
        continue;
      }
      issueCounts.set(tag, (issueCounts.get(tag) ?? 0) + 1);
      if (tag === 'incident' || tag === 'safety') {
        incidentCount += 1;
      }
    }

    if (spam.isSpam) {
      spamCount += 1;
      issueCounts.set('spam', (issueCounts.get('spam') ?? 0) + 1);
    }
  }

  const repeatedIssues = Array.from(issueCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([tag, count]) => ({
      tag,
      label: formatIssueTagLabel(tag),
      count,
      priority: issueTagPriority(tag),
    }));

  return {
    sentiment,
    repeatedIssues,
    spamCount,
    incidentCount,
  };
}

function buildSentimentChipsFromSignals(feedbacks, signals) {
  if (feedbacks.length === 0) {
    return [{ label: 'No feedback yet', tone: 'neutral' }];
  }

  const chips = [];
  if ((signals?.sentiment?.positive ?? 0) > 0) {
    chips.push({ label: `Positive (${signals.sentiment.positive})`, tone: 'success' });
  }
  if ((signals?.sentiment?.neutral ?? 0) > 0) {
    chips.push({ label: `Neutral (${signals.sentiment.neutral})`, tone: 'info' });
  }
  if ((signals?.sentiment?.negative ?? 0) > 0) {
    chips.push({ label: `Negative (${signals.sentiment.negative})`, tone: 'danger' });
  }
  return chips.length > 0 ? chips : [{ label: 'No feedback yet', tone: 'neutral' }];
}

function buildAnalyticsFacts({
  totalParticipations,
  activeCount,
  checkedInCount,
  pendingCount,
  feedbackCount,
  averageRating,
  completionRate,
  capacityFilled,
  trendPercent,
  signals,
}) {
  return [
    { key: 'total_participations', label: 'Participation records', value: String(totalParticipations) },
    { key: 'active_registrations', label: 'Active registrations', value: String(activeCount) },
    { key: 'checkins', label: 'Check-ins', value: String(checkedInCount) },
    { key: 'pending', label: 'Pending approvals', value: String(pendingCount) },
    { key: 'feedback_count', label: 'Feedback submissions', value: String(feedbackCount) },
    { key: 'average_rating', label: 'Average rating', value: feedbackCount > 0 ? `${averageRating.toFixed(1)}/5` : 'N/A' },
    { key: 'completion_rate', label: 'Completion rate', value: formatPercent(completionRate) },
    { key: 'capacity_fill', label: 'Capacity filled', value: formatPercent(capacityFilled) },
    { key: 'participation_trend', label: 'Participation trend', value: formatPercent(trendPercent, { showSign: true }) },
    {
      key: 'sentiment_mix',
      label: 'Sentiment mix',
      value: `+${signals.sentiment.positive} / ~${signals.sentiment.neutral} / -${signals.sentiment.negative}`,
    },
  ];
}

function buildGroundedSummary({
  totalParticipations,
  activeCount,
  checkedInCount,
  feedbackCount,
  averageRating,
  signals,
  repeatedIssues,
}) {
  const baseLine =
    `${formatNumber(totalParticipations)} participation records were captured, ` +
    `with ${formatNumber(activeCount)} active registrations and ${formatNumber(checkedInCount)} check-ins.`;
  const feedbackLine =
    feedbackCount > 0
      ? `Feedback coverage is ${formatNumber(feedbackCount)} responses with an average rating of ${averageRating.toFixed(1)}/5.`
      : 'No feedback responses have been submitted yet.';
  const sentimentLine = `Sentiment mix is positive ${signals.sentiment.positive}, neutral ${signals.sentiment.neutral}, negative ${signals.sentiment.negative}.`;
  const issueLine =
    repeatedIssues.length > 0
      ? `Top repeated issue: ${repeatedIssues[0].label} (${repeatedIssues[0].count} reports).`
      : 'No repeated issue tags were detected in the current feedback set.';

  return `${baseLine} ${feedbackLine} ${sentimentLine} ${issueLine}`;
}

function buildStrengthsAndWeaknesses({
  averageRating,
  feedbackCount,
  checkedInCount,
  activeCount,
  pendingCount,
  signals,
  repeatedIssues,
}) {
  const strengths = [];
  if (feedbackCount > 0 && averageRating >= 4) {
    strengths.push(`Average volunteer rating is ${averageRating.toFixed(1)}/5.`);
  }
  if ((signals?.sentiment?.positive ?? 0) > (signals?.sentiment?.negative ?? 0)) {
    strengths.push('Positive sentiment outnumbers negative sentiment.');
  }
  if (activeCount > 0 && checkedInCount > 0 && calculateRatio(checkedInCount, activeCount) >= 60) {
    strengths.push('Check-in conversion is healthy for current registrations.');
  }

  const weaknesses = [];
  if ((signals?.sentiment?.negative ?? 0) > 0) {
    weaknesses.push(`${signals.sentiment.negative} feedback entries are negative.`);
  }
  if (pendingCount > 0) {
    weaknesses.push(`${pendingCount} registrations are still pending approval.`);
  }
  if (repeatedIssues.length > 0) {
    weaknesses.push(...repeatedIssues.slice(0, 3).map((issue) => `${issue.label} appears ${issue.count} times.`));
  }

  return { strengths: strengths.slice(0, 5), weaknesses: weaknesses.slice(0, 6) };
}

function buildIssueHighlightsFromSignals(repeatedIssues) {
  return repeatedIssues.slice(0, 5).map((issue) => ({
    id: `feedback-issue-${issue.tag}`,
    tag: issue.tag,
    label: issue.label,
    count: issue.count,
    priority: issue.priority,
  }));
}

function buildIssues({
  pendingCount,
  checkedInCount,
  activeCount,
  capacity,
  feedbacks,
  activityStatus,
  repeatedIssues,
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

  if (Array.isArray(repeatedIssues) && repeatedIssues.length > 0) {
    const topIssue = repeatedIssues[0];
    issues.push({
      id: `repeated-${topIssue.tag}`,
      title: `Repeated ${topIssue.label.toLowerCase()} signal`,
      description: `${topIssue.label} appears in ${topIssue.count} feedback entries and should be reviewed.`,
      priority: topIssue.priority,
    });
  }

  return issues
    .filter((issue, index, source) => source.findIndex((item) => item.id === issue.id) === index)
    .slice(0, 6);
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
  const feedbackSignals = summarizeFeedbackSignals(feedbacks);

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
  const analyticsFacts = buildAnalyticsFacts({
    totalParticipations,
    activeCount,
    checkedInCount,
    pendingCount,
    feedbackCount: feedbacks.length,
    averageRating,
    completionRate,
    capacityFilled,
    trendPercent,
    signals: feedbackSignals,
  });
  const summaryNarrative = buildGroundedSummary({
    totalParticipations,
    activeCount,
    checkedInCount,
    feedbackCount: feedbacks.length,
    averageRating,
    signals: feedbackSignals,
    repeatedIssues: feedbackSignals.repeatedIssues,
  });
  const { strengths, weaknesses } = buildStrengthsAndWeaknesses({
    averageRating,
    feedbackCount: feedbacks.length,
    checkedInCount,
    activeCount,
    pendingCount,
    signals: feedbackSignals,
    repeatedIssues: feedbackSignals.repeatedIssues,
  });
  const issueHighlights = buildIssueHighlightsFromSignals(feedbackSignals.repeatedIssues);

  const report = {
    liveLabel: buildLiveLabel(selectedActivity.status),
    activityTitle: String(selectedActivity.title ?? 'Untitled Activity'),
    durationLabel: 'Duration',
    durationValue: buildDurationValue(startDate, endDate),
    summary: summaryNarrative,
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
    sentimentChips: buildSentimentChipsFromSignals(feedbacks, feedbackSignals),
    issues: buildIssues({
      pendingCount,
      checkedInCount,
      activeCount,
      capacity,
      feedbacks,
      activityStatus: selectedActivity.status,
      repeatedIssues: feedbackSignals.repeatedIssues,
    }),
    analyticsFacts,
    strengths,
    weaknesses,
    issueHighlights,
    modelVersion: REPORT_SUMMARY_MODEL_VERSION,
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
