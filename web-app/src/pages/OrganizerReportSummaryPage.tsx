import { Download, Share2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { EmptyLoadingErrorState, IssueBadge } from '../components/feedback';
import { EventTimelineReadOnly } from '../components/timeline';
import { Badge, Button, Card, Select } from '../components/ui';
import { FeedbackOverviewCard } from '../components/reports/FeedbackOverviewCard';
import { IssueHighlightsCard } from '../components/reports/IssueHighlightsCard';
import { ParticipationCountCard } from '../components/reports/ParticipationCountCard';
import { ReportSummaryHeroCard } from '../components/reports/ReportSummaryHeroCard';
import { OrganizerShell } from '../layouts/OrganizerShell';
import type { OrganizerReportSummaryData } from '../lib/organizerReportSummary';
import { getOrganizerReportSummary, type ActivitySummaryOption } from '../lib/reports';
import { listActivityTimeline } from '../lib/timeline';
import type { TimelineMilestone } from '../types/timeline';
import './OrganizerReportSummaryPage.css';

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
}

function matchesSearch(searchTerm: string, value: string) {
  return value.toLowerCase().includes(searchTerm.toLowerCase());
}

function getMetricValue(metrics: OrganizerReportSummaryData['miniMetrics'], label: string) {
  const target = metrics.find((item) => item.label.trim().toLowerCase() === label.trim().toLowerCase());
  return target?.value ?? 'N/A';
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

function isLikelySpamFeedbackText(value: string) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) {
    return false;
  }

  const compact = text.replace(/\s+/g, '');
  if (/^[\d\W_]+$/.test(text)) {
    return true;
  }
  if (/^(.)(\1{4,})$/.test(compact)) {
    return true;
  }
  if (/(https?:\/\/|www\.|bit\.ly|t\.me|discord\.gg|tinyurl\.com)/i.test(text)) {
    return true;
  }
  if (/\b(test|sample|demo|dummy|asdf|qwer|zxcv)\b/i.test(text)) {
    return true;
  }

  return false;
}

function buildSentimentCounts(report: OrganizerReportSummaryData) {
  const counts = {
    Pos: 0,
    Neu: 0,
    Neg: 0,
    Spam: 0,
  };

  report.sentimentChips.forEach((chip) => {
    const normalized = chip.label.toLowerCase();
    const value = parseCount(chip.label);
    const safeValue = value > 0 ? value : 0;

    if (normalized === 'pos' || normalized.includes('positive')) {
      counts.Pos += safeValue;
    } else if (normalized === 'neg' || normalized.includes('negative')) {
      counts.Neg += safeValue;
    } else if (normalized === 'neu' || normalized.includes('neutral')) {
      counts.Neu += safeValue;
    } else if (normalized === 'spam' || normalized.includes('spam')) {
      counts.Spam += safeValue;
    }
  });

  return [
    { label: 'Pos' as const, count: counts.Pos },
    { label: 'Neu' as const, count: counts.Neu },
    { label: 'Neg' as const, count: counts.Neg },
    { label: 'Spam' as const, count: counts.Spam },
  ];
}

function buildActivityDateRange(activity?: ActivitySummaryOption) {
  if (!activity?.start_time && !activity?.end_time) {
    return 'No schedule available';
  }

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });

  const start = activity.start_time ? new Date(activity.start_time) : null;
  const end = activity.end_time ? new Date(activity.end_time) : null;

  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    return `${dateFormatter.format(start)} - ${dateFormatter.format(end)}`;
  }

  if (start && !Number.isNaN(start.getTime())) {
    return `From ${dateFormatter.format(start)}`;
  }

  if (end && !Number.isNaN(end.getTime())) {
    return `Until ${dateFormatter.format(end)}`;
  }

  return 'No schedule available';
}

function getStatusLabel(status: string | null | undefined, liveLabel: string) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'published') {
    return 'Live Activity';
  }
  if (normalized === 'completed') {
    return 'Completed';
  }
  if (normalized === 'draft') {
    return 'Draft';
  }
  if (normalized === 'cancelled') {
    return 'Cancelled';
  }
  return liveLabel || 'Activity Snapshot';
}

function buildActivityStatusSummary(statusLabel: string, counts: { registered: number; checkedIn: number; pending: number }) {
  if (statusLabel === 'Live Activity') {
    if (counts.pending > 0) {
      return `Activity is live with ${counts.pending} pending approval${counts.pending === 1 ? '' : 's'}.`;
    }
    return 'Activity is live and participation is ongoing.';
  }

  if (statusLabel === 'Completed') {
    return 'Participation completed. Review outcomes and close follow-ups.';
  }

  if (statusLabel === 'Draft') {
    return 'Draft activity. Publish when details and capacity are ready.';
  }

  return 'Activity snapshot for current participation and feedback status.';
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

    let cancelled = false;
    setTimelineLoading(true);
    setTimelineError(null);

    void listActivityTimeline(timelineActivityId)
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
  }, [timelineActivityId]);

  const selectedActivity = useMemo(
    () => availableActivities.find((activity) => activity.id === selectedActivityId) ?? null,
    [availableActivities, selectedActivityId]
  );

  const activityStatusLabel = report
    ? getStatusLabel(selectedActivity?.status, report.liveLabel)
    : getStatusLabel(selectedActivity?.status, 'Activity Snapshot');

  const activityDateRange = buildActivityDateRange(selectedActivity ?? undefined);

  const reportCounts = useMemo(() => {
    if (!report) {
      return {
        registered: 0,
        checkedIn: 0,
        pending: 0,
        totalFeedbackCount: 0,
        validFeedbackCount: 0,
        spamFeedbackCount: 0,
      };
    }

    const breakdownByLabel = new Map(
      report.participationBreakdown.map((item) => [item.label.trim().toLowerCase(), item.value])
    );

    const validFeedbackFactCount = getFactCount(report, 'feedback_count');
    const totalFeedbackFactCount = getFactCount(report, 'feedback_total_count');
    const spamFeedbackFactCount = getFactCount(report, 'feedback_spam_count');
    const stats = report.feedbackStats;

    const totalFeedbackCount =
      typeof stats?.totalCount === 'number'
        ? stats.totalCount
        : totalFeedbackFactCount > 0
          ? totalFeedbackFactCount
          : validFeedbackFactCount;
    const validFeedbackCount =
      typeof stats?.validCount === 'number' ? stats.validCount : validFeedbackFactCount;
    const spamFeedbackCount =
      typeof stats?.spamCount === 'number' ? stats.spamCount : spamFeedbackFactCount;

    return {
      registered: breakdownByLabel.get('registered volunteers') ?? 0,
      checkedIn: breakdownByLabel.get('checked in') ?? 0,
      pending: breakdownByLabel.get('pending approval') ?? 0,
      totalFeedbackCount,
      validFeedbackCount,
      spamFeedbackCount,
    };
  }, [report]);

  const kpiItems = useMemo<KpiItem[]>(() => {
    if (!report) {
      return [];
    }

    return [
      { key: 'registered', label: 'Registered', value: String(reportCounts.registered) },
      { key: 'checked-in', label: 'Checked-in', value: String(reportCounts.checkedIn) },
      { key: 'pending', label: 'Pending Approval', value: String(reportCounts.pending) },
      { key: 'completion', label: 'Completion Rate', value: getMetricValue(report.miniMetrics, 'completion rate') },
      { key: 'capacity', label: 'Capacity Filled', value: getMetricValue(report.miniMetrics, 'capacity filled') },
    ];
  }, [report, reportCounts.checkedIn, reportCounts.pending, reportCounts.registered]);

  const quoteLooksSpam = useMemo(
    () => isLikelySpamFeedbackText(report?.feedbackQuote ?? ''),
    [report?.feedbackQuote]
  );

  const sentimentCounts = useMemo(() => {
    if (!report) {
      return [
        { label: 'Pos' as const, count: 0 },
        { label: 'Neu' as const, count: 0 },
        { label: 'Neg' as const, count: 0 },
        { label: 'Spam' as const, count: 0 },
      ];
    }
    const counts = buildSentimentCounts(report);
    const quoteLooksSpam = isLikelySpamFeedbackText(report.feedbackQuote ?? '');
    const hasServerSpamCount = counts.some((item) => item.label === 'Spam' && item.count > 0);
    const hasServerValidCount = counts.some(
      (item) => (item.label === 'Pos' || item.label === 'Neu' || item.label === 'Neg') && item.count > 0
    );

    if (
      reportCounts.totalFeedbackCount > 0 &&
      ((reportCounts.validFeedbackCount === 0 && reportCounts.spamFeedbackCount > 0) ||
        (quoteLooksSpam && !hasServerSpamCount && hasServerValidCount))
    ) {
      return [
        { label: 'Pos' as const, count: 0 },
        { label: 'Neu' as const, count: 0 },
        { label: 'Neg' as const, count: 0 },
        { label: 'Spam' as const, count: Math.max(reportCounts.totalFeedbackCount, reportCounts.spamFeedbackCount || 1) },
      ];
    }

    return counts;
  }, [report, reportCounts.totalFeedbackCount, reportCounts.validFeedbackCount, reportCounts.spamFeedbackCount]);

  const effectiveFeedbackCounts = useMemo(() => {
    if (!report || reportCounts.totalFeedbackCount <= 0) {
      return {
        total: 0,
        valid: 0,
        spam: 0,
        isSpamOnly: false,
      };
    }

    const sentimentSpamCount = sentimentCounts.find((item) => item.label === 'Spam')?.count ?? 0;
    const sentimentValidCount = sentimentCounts
      .filter((item) => item.label !== 'Spam')
      .reduce((sum, item) => sum + item.count, 0);
    const total = Math.max(
      reportCounts.totalFeedbackCount,
      reportCounts.validFeedbackCount + reportCounts.spamFeedbackCount,
      sentimentValidCount + sentimentSpamCount
    );

    let valid = reportCounts.validFeedbackCount;
    let spam = reportCounts.spamFeedbackCount;

    if (quoteLooksSpam && sentimentSpamCount > 0 && sentimentValidCount === 0) {
      valid = 0;
      spam = Math.max(spam, sentimentSpamCount, total || 1);
    }

    if (valid + spam === 0 && (sentimentValidCount > 0 || sentimentSpamCount > 0)) {
      valid = sentimentValidCount;
      spam = sentimentSpamCount;
    }

    if (valid === 0 && spam > 0 && spam < total) {
      spam = total;
    }

    return {
      total,
      valid,
      spam,
      isSpamOnly: total > 0 && valid === 0 && spam > 0,
    };
  }, [
    quoteLooksSpam,
    report,
    reportCounts.spamFeedbackCount,
    reportCounts.totalFeedbackCount,
    reportCounts.validFeedbackCount,
    sentimentCounts,
  ]);

  const hasFeedbackInsights = useMemo(
    () =>
      effectiveFeedbackCounts.valid > 0 &&
      Boolean((report?.strengths?.length ?? 0) > 0 || (report?.weaknesses?.length ?? 0) > 0),
    [effectiveFeedbackCounts.valid, report?.strengths, report?.weaknesses]
  );

  const headerStatusSummary = useMemo(
    () =>
      buildActivityStatusSummary(activityStatusLabel, {
        registered: reportCounts.registered,
        checkedIn: reportCounts.checkedIn,
        pending: reportCounts.pending,
      }),
    [activityStatusLabel, reportCounts.checkedIn, reportCounts.pending, reportCounts.registered]
  );

  const effectiveRating = useMemo(() => {
    if (!report) {
      return null;
    }
    if (effectiveFeedbackCounts.valid <= 0) {
      return null;
    }
    return typeof report.feedbackRating === 'number' ? report.feedbackRating : null;
  }, [effectiveFeedbackCounts.valid, report]);

  const effectiveQuote = useMemo(() => {
    if (!report) {
      return undefined;
    }
    if (effectiveFeedbackCounts.valid <= 0) {
      return undefined;
    }
    if (quoteLooksSpam) {
      return undefined;
    }
    return report.feedbackQuote;
  }, [effectiveFeedbackCounts.valid, quoteLooksSpam, report]);

  const actionItems = useMemo<ReportActionItem[]>(() => {
    if (!report) {
      return [];
    }

    const nextActivityId = selectedActivityId || requestedActivityId;

    const isSpamOnlyFeedback = effectiveFeedbackCounts.isSpamOnly;

    return report.issues
      .filter((issue) => {
        if (!isSpamOnlyFeedback) {
          return true;
        }
        const normalizedId = issue.id.trim().toLowerCase();
        const normalizedTitle = issue.title.trim().toLowerCase();
        const normalizedDescription = issue.description.trim().toLowerCase();
        if (normalizedId.includes('repeated-') || normalizedId.includes('low-rating-feedback')) {
          return false;
        }
        if (
          normalizedTitle.includes('low_signal') ||
          normalizedTitle.includes('needs_review') ||
          normalizedTitle.includes('uninformative') ||
          normalizedDescription.includes('low_signal') ||
          normalizedDescription.includes('needs_review') ||
          normalizedDescription.includes('uninformative')
        ) {
          return false;
        }
        return true;
      })
      .map((issue) => {
      const normalizedId = issue.id.trim().toLowerCase();

      if (normalizedId.includes('pending-registration')) {
        return {
          ...issue,
          actionLabel: 'Review registrations',
          onAction: () =>
            navigate(nextActivityId ? `/organizer/registrations?activityId=${encodeURIComponent(nextActivityId)}` : '/organizer/registrations'),
        };
      }

      if (normalizedId.includes('missing-feedback') && isSpamOnlyFeedback) {
        return {
          ...issue,
          title: 'Only spam feedback detected',
          description:
            effectiveFeedbackCounts.spam === 1
              ? '1 feedback submission was flagged as spam and cannot be used for report insights.'
              : `${effectiveFeedbackCounts.spam} feedback submissions were flagged as spam and cannot be used for report insights.`,
          priority: 'low',
          actionLabel: 'Review feedback',
          onAction: () => navigate(nextActivityId ? `/feedback?activityId=${encodeURIComponent(nextActivityId)}` : '/feedback'),
        };
      }

      if (normalizedId.includes('missing-feedback') || normalizedId.includes('low-rating-feedback') || normalizedId.includes('repeated-')) {
        return {
          ...issue,
          actionLabel: 'View feedback',
          onAction: () => navigate(nextActivityId ? `/feedback?activityId=${encodeURIComponent(nextActivityId)}` : '/feedback'),
        };
      }

      if (normalizedId.includes('checkin')) {
        return {
          ...issue,
          actionLabel: 'Open check-ins',
          onAction: () =>
            navigate(nextActivityId ? `/organizer/checkins?activityId=${encodeURIComponent(nextActivityId)}` : '/organizer/checkins'),
        };
      }

      return {
        ...issue,
        actionLabel: 'Manage activities',
        onAction: () => navigate('/organizer/activities'),
      };
      });
  }, [effectiveFeedbackCounts.isSpamOnly, effectiveFeedbackCounts.spam, navigate, report, requestedActivityId, selectedActivityId]);

  const filteredActionItems = useMemo(() => {
    const normalized = searchTerm.trim();
    if (!normalized) {
      return actionItems;
    }

    return actionItems.filter(
      (item) => matchesSearch(normalized, item.title) || matchesSearch(normalized, item.description)
    );
  }, [actionItems, searchTerm]);

  const breakdownRows = useMemo(() => {
    if (!report) {
      return [];
    }

    const capacityMetric = getMetricValue(report.miniMetrics, 'capacity filled');
    const capacityPercent = Number.parseFloat(capacityMetric.replace('%', ''));
    const capacityProgress = Number.isFinite(capacityPercent) ? Math.max(0, Math.min(100, Math.round(capacityPercent))) : 0;

    return [
      ...report.participationBreakdown,
      {
        label: 'Capacity Filled',
        value: capacityProgress,
        progress: capacityProgress,
        tone: 'muted' as const,
      },
    ];
  }, [report]);

  const shouldShowTimeline = timelineMilestones.length > 0;

  const handleExportPdf = () => {
    setError(null);
    document.body.classList.add('org-report-printing');
    window.print();
  };

  const handleShareReport = async () => {
    const sharePayload = {
      title: 'V-Connect Report Summary',
      text: `Report Summary - ${report?.activityTitle ?? 'Organizer activity'}`,
      url: window.location.href,
    };

    try {
      setError(null);

      if (navigator.share) {
        await navigator.share(sharePayload);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sharePayload.url);
      } else {
        throw new Error('Sharing is not supported in this browser.');
      }

      setMessage('Report link is ready to share.');
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === 'AbortError') {
        return;
      }
      setMessage(null);
      setError(shareError instanceof Error ? shareError.message : 'Unable to share the report right now.');
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
      pageSubtitle="Review key activity performance and follow-up actions in one place."
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
            <strong>{report?.durationValue ?? '--'}</strong>
          </div>
        </header>

        {message && <p className="form-success">{message}</p>}
        {report && error && <p className="form-error">{error}</p>}

        <Card as="section" className="org-report-activity-picker">
          <div className="org-report-activity-picker-row">
            <div className="org-report-activity-picker-copy">
              <p className="org-report-eyebrow">Select activity</p>
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
              <Badge tone="info">{activityStatusLabel}</Badge>
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
              durationLabel={report.durationLabel}
              durationValue={report.durationValue}
              liveLabel={activityStatusLabel}
              metrics={[]}
              summary={headerStatusSummary}
              title={report.activityTitle}
            />

            <section className="org-report-kpi-grid" aria-label="KPI summary">
              {kpiItems.map((kpi) => (
                <Card as="article" className="org-report-kpi-card" key={kpi.key}>
                  <p>{kpi.label}</p>
                  <strong>{kpi.value}</strong>
                </Card>
              ))}
            </section>

            <div className="org-report-main-grid">
              <div className="org-report-main-col">
                <ParticipationCountCard
                  rows={breakdownRows}
                  title="Participation Breakdown"
                />
              </div>

              <div className="org-report-main-col">
                <FeedbackOverviewCard
                  ariaLabel="Open feedback review"
                  totalFeedbackCount={effectiveFeedbackCounts.total}
                  validFeedbackCount={effectiveFeedbackCounts.valid}
                  spamFeedbackCount={effectiveFeedbackCounts.spam}
                  onClick={() => {
                    const nextActivityId = selectedActivityId || requestedActivityId;
                    navigate(nextActivityId ? `/feedback?activityId=${encodeURIComponent(nextActivityId)}` : '/feedback');
                  }}
                  quote={effectiveQuote}
                  rating={effectiveRating}
                  sentiments={sentimentCounts}
                />

                {hasFeedbackInsights ? (
                  <Card as="section" className="org-report-lower-card org-report-feedback-insights-card">
                    <div className="org-report-card-head">
                      <h3>Feedback Insights</h3>
                    </div>
                    <div className="org-report-strength-grid">
                      <div>
                        <h4>Strengths</h4>
                        {report.strengths && report.strengths.length > 0 ? (
                          <ul className="org-report-list">
                            {report.strengths.map((item) => (
                              <li key={`strength-${item}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted">No recurring strengths detected yet.</p>
                        )}
                      </div>
                      <div>
                        <h4>Weaknesses</h4>
                        {report.weaknesses && report.weaknesses.length > 0 ? (
                          <ul className="org-report-list">
                            {report.weaknesses.map((item) => (
                              <li key={`weakness-${item}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted">No recurring weaknesses detected yet.</p>
                        )}
                      </div>
                    </div>
                  </Card>
                ) : null}
              </div>
            </div>

            <div className="org-report-lower-grid">
              <Card as="section" className="org-report-lower-card org-report-facts-card">
                <div className="org-report-card-head">
                  <h3>Analytics Facts</h3>
                  {report.modelVersion ? <small>{report.modelVersion}</small> : null}
                </div>
                {analyticsFacts.length === 0 ? (
                  <p className="muted">No analytics facts available.</p>
                ) : (
                  <div className="org-report-facts-grid">
                    {analyticsFacts.map((fact) => (
                      <div className="org-report-fact-item" key={fact.key}>
                        <span>{fact.label}</span>
                        <strong>{fact.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {issueHighlights.length > 0 && (
                  <div className="org-report-inline-tags">
                    {issueHighlights.map((item) => (
                      <IssueBadge key={item.id} label={`${item.label} (${item.count})`} priority={item.priority} />
                    ))}
                  </div>
                )}
              </Card>

              <FeedbackOverviewCard
                ariaLabel="Open feedback review"
                onClick={() => {
                  const nextActivityId = selectedActivityId || requestedActivityId;
                  navigate(nextActivityId ? `/feedback?activityId=${encodeURIComponent(nextActivityId)}` : '/feedback');
                }}
                quote={report.feedbackQuote}
                rating={report.feedbackRating}
                sentiments={report.sentimentChips}
              />

              <Card as="section" className="org-report-lower-card org-report-facts-card">
                <div className="org-report-card-head">
                  <h3>Strengths and Weaknesses</h3>
                </div>
                <div className="org-report-strength-grid">
                  <div>
                    <h4>Strengths</h4>
                    {strengths.length > 0 ? (
                      <ul className="org-report-list">
                        {strengths.map((item) => (
                          <li key={`strength-${item}`}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No explicit strengths detected yet.</p>
                    )}
                  </div>
                  <div>
                    <h4>Weaknesses</h4>
                    {weaknesses.length > 0 ? (
                      <ul className="org-report-list">
                        {weaknesses.map((item) => (
                          <li key={`weakness-${item}`}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No explicit weaknesses detected yet.</p>
                    )}
                  </div>
                </div>
              </Card>

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
