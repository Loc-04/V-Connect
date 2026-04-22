import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MessageSquareText,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  UsersRound,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { AttendanceStatusBadge } from '../components/attendance';
import { EventTimelineReadOnly } from '../components/timeline';
import { Badge, Button, Card, Table, type BadgeTone } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { formatActivityLocation } from '../lib/activityLocation';
import { listActivities } from '../lib/activities';
import { listFeedbackReview, type FeedbackReviewResult } from '../lib/feedback';
import { listParticipations } from '../lib/participations';
import { listActivityTimeline } from '../lib/timeline';
import type { ActivityRecord } from '../types/activity';
import type { ParticipationRecord } from '../types/participation';
import type { TimelineMilestone } from '../types/timeline';
import './OrganizerDashboardPage.css';

interface ActivityTimelineBundle {
  activity: ActivityRecord;
  milestones: TimelineMilestone[];
}

interface DashboardMetricCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  hint: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
}

const ACTIVE_REGISTRATION_STATUSES = new Set(['assigned', 'pending', 'approved', 'checked_in']);
const OPEN_ACTIVITY_STATUSES = new Set(['published']);
const CLOSED_ACTIVITY_STATUSES = new Set(['completed', 'cancelled']);

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function toTitleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function getStatusTone(status: string): BadgeTone {
  const normalized = normalizeStatus(status);
  if (normalized === 'published' || normalized === 'approved' || normalized === 'checked_in') return 'success';
  if (normalized === 'pending' || normalized === 'draft') return 'info';
  if (normalized === 'rejected' || normalized === 'cancelled') return 'danger';
  return 'neutral';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Schedule TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Schedule TBD';
  return parsed.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return 'Date TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date TBD';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
}

function toDateKey(value: string | Date | null | undefined) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getActivityStartTime(activity: ActivityRecord) {
  const time = new Date(activity.start_time).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function getParticipationTime(participation: ParticipationRecord) {
  const value = participation.created_at ?? participation.updated_at ?? participation.date;
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getParticipationActivityId(participation: ParticipationRecord) {
  return participation.activityId ?? participation.activity_id ?? null;
}

function getVolunteerName(participation: ParticipationRecord) {
  return participation.volunteer?.full_name?.trim() || `Volunteer ${participation.id.slice(0, 6)}`;
}

function DashboardMetricCard({ icon, label, value, hint, tone = 'accent' }: DashboardMetricCardProps) {
  return (
    <Card as="article" className="org-dashboard-metric-card">
      <span className={`org-dashboard-metric-icon is-${tone}`}>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{hint}</small>
    </Card>
  );
}

export function OrganizerDashboardPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participationError, setParticipationError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [timelineIntegrationMessage, setTimelineIntegrationMessage] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [participations, setParticipations] = useState<ParticipationRecord[]>([]);
  const [feedbackReview, setFeedbackReview] = useState<FeedbackReviewResult | null>(null);
  const [bundles, setBundles] = useState<ActivityTimelineBundle[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dashboardNow, setDashboardNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!session?.access_token) {
        setLoading(false);
        setError('No active session token.');
        setActivities([]);
        setParticipations([]);
        setFeedbackReview(null);
        setBundles([]);
        setSelectedActivityId(null);
        return;
      }

      setLoading(true);
      setError(null);
      setParticipationError(null);
      setFeedbackError(null);
      const loadStartedAt = new Date();

      const [activityResult, participationResult, feedbackResult] = await Promise.allSettled([
        listActivities({ accessToken: session.access_token, mine: true, status: 'all', limit: 100 }),
        listParticipations({ accessToken: session.access_token, mine: true, status: 'all', limit: 300 }),
        listFeedbackReview({ accessToken: session.access_token, status: 'all', limit: 80, page: 1 }),
      ]);

      if (cancelled) return;

      if (activityResult.status === 'rejected') {
        setActivities([]);
        setParticipations([]);
        setFeedbackReview(null);
        setBundles([]);
        setSelectedActivityId(null);
        setError(activityResult.reason instanceof Error ? activityResult.reason.message : 'Unable to load organizer dashboard data.');
        setLoading(false);
        return;
      }

      const activityRows = activityResult.value;
      const participationRows = participationResult.status === 'fulfilled' ? participationResult.value : [];
      setActivities(activityRows);
      setParticipations(participationRows);
      setParticipationError(
        participationResult.status === 'rejected'
          ? participationResult.reason instanceof Error
            ? participationResult.reason.message
            : 'Participation data is unavailable.'
          : null
      );
      setFeedbackReview(feedbackResult.status === 'fulfilled' ? feedbackResult.value : null);
      setFeedbackError(
        feedbackResult.status === 'rejected'
          ? feedbackResult.reason instanceof Error
            ? feedbackResult.reason.message
            : 'Feedback data is unavailable.'
          : null
      );

      const timelineRows = await Promise.all(
        activityRows.map(async (activity) => {
          const timeline = await listActivityTimeline(activity.id);
          return {
            activity,
            milestones: timeline.milestones,
            integrationMessage: timeline.integration.pendingServerIntegration ? timeline.integration.message : null,
          };
        })
      );

      if (cancelled) return;

      setBundles(timelineRows.map((item) => ({ activity: item.activity, milestones: item.milestones })));
      setTimelineIntegrationMessage(timelineRows.find((item) => item.integrationMessage)?.integrationMessage ?? null);
      const firstTimelineActivity = timelineRows.find((item) => item.milestones.length > 0)?.activity.id ?? null;
      setSelectedActivityId((current) => current ?? firstTimelineActivity ?? activityRows[0]?.id ?? null);
      setDashboardNow(loadStartedAt);
      setLastUpdated(new Date());
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, session?.access_token]);

  const activityById = useMemo(() => new Map(activities.map((activity) => [activity.id, activity])), [activities]);
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const dashboardNowTime = dashboardNow.getTime();

  const participationCountsByActivity = useMemo(() => {
    const counts = new Map<string, number>();
    participations.forEach((participation) => {
      const activityId = getParticipationActivityId(participation);
      const status = normalizeStatus(participation.status);
      if (!activityId || !ACTIVE_REGISTRATION_STATUSES.has(status)) return;
      counts.set(activityId, (counts.get(activityId) ?? 0) + 1);
    });
    return counts;
  }, [participations]);

  const dashboardStats = useMemo(() => {
    const feedbackCount = feedbackReview?.pagination.total ?? feedbackReview?.insights.totals.feedback_count ?? 0;
    return {
      totalActivities: activities.length,
      openActivities: activities.filter((activity) => OPEN_ACTIVITY_STATUSES.has(normalizeStatus(activity.status))).length,
      pendingRegistrations: participations.filter((participation) => normalizeStatus(participation.status) === 'pending').length,
      checkedInsToday: participations.filter(
        (participation) => normalizeStatus(participation.status) === 'checked_in' && toDateKey(participation.checked_in_at) === todayKey
      ).length,
      feedbackCount,
      averageRating: feedbackReview?.insights.totals.average_rating ?? 0,
    };
  }, [activities, feedbackReview, participations, todayKey]);

  const upcomingActivities = useMemo(() => {
    return activities
      .filter(
        (activity) =>
          !CLOSED_ACTIVITY_STATUSES.has(normalizeStatus(activity.status)) && getActivityStartTime(activity) >= dashboardNowTime
      )
      .sort((left, right) => getActivityStartTime(left) - getActivityStartTime(right));
  }, [activities, dashboardNowTime]);

  const todaysActivities = useMemo(() => activities.filter((activity) => toDateKey(activity.start_time) === todayKey), [activities, todayKey]);
  const nearestActivity = upcomingActivities[0] ?? todaysActivities[0] ?? null;

  const recentRegistrations = useMemo(
    () => [...participations].sort((left, right) => getParticipationTime(right) - getParticipationTime(left)).slice(0, 5),
    [participations]
  );

  const attendanceSnapshot = useMemo(() => {
    const approved = participations.filter((participation) => normalizeStatus(participation.status) === 'approved').length;
    const checkedIn = participations.filter((participation) => normalizeStatus(participation.status) === 'checked_in').length;
    const totalExpected = approved + checkedIn;
    const rate = totalExpected > 0 ? Math.round((checkedIn / totalExpected) * 100) : 0;
    return { approved, checkedIn, notCheckedIn: approved, totalExpected, rate };
  }, [participations]);

  const flattenedMilestones = useMemo(
    () =>
      bundles.flatMap((bundle) =>
        bundle.milestones.map((milestone) => ({ ...milestone, activityTitle: bundle.activity.title, activityId: bundle.activity.id }))
      ),
    [bundles]
  );
  const inProgressMilestones = useMemo(() => flattenedMilestones.filter((milestone) => milestone.status === 'in_progress'), [flattenedMilestones]);
  const upcomingMilestones = useMemo(
    () =>
      flattenedMilestones
        .filter((milestone) => milestone.status === 'upcoming' && new Date(milestone.startTime).getTime() >= dashboardNowTime)
        .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime())
        .slice(0, 4),
    [dashboardNowTime, flattenedMilestones]
  );
  const completedMilestones = useMemo(() => flattenedMilestones.filter((milestone) => milestone.status === 'completed').length, [flattenedMilestones]);
  const activitiesWithTimeline = useMemo(() => bundles.filter((bundle) => bundle.milestones.length > 0), [bundles]);
  const selectedBundle = useMemo(() => bundles.find((bundle) => bundle.activity.id === selectedActivityId) ?? null, [bundles, selectedActivityId]);

  const needsAttentionItems = useMemo(() => {
    const items: Array<{ key: string; tone: BadgeTone; title: string; description: string; actionLabel: string; onClick: () => void }> = [];

    if (dashboardStats.pendingRegistrations > 0) {
      items.push({
        key: 'pending-registrations',
        tone: 'info',
        title: `${dashboardStats.pendingRegistrations} pending registrations`,
        description: 'Volunteer applications are waiting for approval or rejection.',
        actionLabel: 'Review queue',
        onClick: () => navigate('/organizer/registrations'),
      });
    }

    const soonActivity = upcomingActivities.find((activity) => getActivityStartTime(activity) <= dashboardNowTime + 72 * 60 * 60 * 1000);
    if (soonActivity) {
      items.push({
        key: 'activity-soon',
        tone: 'accent',
        title: 'Activity happening soon',
        description: `${soonActivity.title} starts ${formatDateTime(soonActivity.start_time)}. Prepare check-in operations.`,
        actionLabel: 'Open check-ins',
        onClick: () => navigate(`/organizer/checkins?activityId=${encodeURIComponent(soonActivity.id)}`),
      });
    }

    const lowSignupActivity = upcomingActivities.find((activity) => {
      const capacity = Number(activity.capacity ?? 0);
      if (!Number.isFinite(capacity) || capacity <= 0) return false;
      const registered = participationCountsByActivity.get(activity.id) ?? 0;
      return registered === 0 || registered / capacity < 0.25;
    });
    if (lowSignupActivity) {
      const registered = participationCountsByActivity.get(lowSignupActivity.id) ?? 0;
      items.push({
        key: 'low-signups',
        tone: 'danger',
        title: 'Low sign-up activity',
        description: `${lowSignupActivity.title} has ${registered}/${lowSignupActivity.capacity} spots filled.`,
        actionLabel: 'Manage activity',
        onClick: () => navigate(`/organizer/activities?activityId=${encodeURIComponent(lowSignupActivity.id)}`),
      });
    }

    const prominentIssue = feedbackReview?.insights.prominentIssues?.[0] ?? feedbackReview?.insights.repeatedIssues?.[0];
    if (prominentIssue) {
      items.push({
        key: 'feedback-issue',
        tone: prominentIssue.priority === 'high' ? 'danger' : 'info',
        title: `Feedback issue: ${prominentIssue.label}`,
        description: `${prominentIssue.count} feedback entries mention this issue.`,
        actionLabel: 'Open feedback',
        onClick: () => navigate('/feedback'),
      });
    }

    return items.slice(0, 4);
  }, [dashboardNowTime, dashboardStats.pendingRegistrations, feedbackReview, navigate, participationCountsByActivity, upcomingActivities]);

  const lastUpdatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Not synced yet';
  const feedbackReliabilityMessage = feedbackReview?.insights.reliability?.message?.trim() || null;
  const feedbackIssues = feedbackReview?.insights.prominentIssues ?? [];

  return (
    <OrganizerShell
      activeNav="dashboard"
      headerActions={
        <div className="org-dashboard-header-actions">
          <Button onClick={() => navigate('/activities/create')} type="button">
            <Plus size={15} />
            <span>Create Activity</span>
          </Button>
          <Button onClick={() => navigate('/organizer/activities')} type="button" variant="secondary">Manage Activities</Button>
          <Button onClick={() => navigate('/organizer/registrations')} type="button" variant="secondary">Review Registrations</Button>
          <Button onClick={() => navigate('/organizer/checkins')} type="button" variant="secondary">Open Check-ins</Button>
          <Button onClick={() => navigate('/organizer/reports')} type="button" variant="secondary">View Reports</Button>
        </div>
      }
      pageSubtitle="Monitor activities, registrations, attendance, feedback, and near-term organizer actions."
      pageTitle="Organizer Dashboard"
      showSearch={false}
    >
      <section className="org-dashboard-page">
        <div className="org-dashboard-sync-row">
          <span>Last updated: {lastUpdatedLabel}</span>
          <Button disabled={loading} onClick={() => setRefreshKey((current) => current + 1)} type="button" variant="secondary">
            <RefreshCw size={14} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
        </div>

        {error ? (
          <Card as="section" className="org-dashboard-state-card is-error">
            <AlertTriangle size={20} />
            <div>
              <h2>Unable to load dashboard</h2>
              <p>{error}</p>
            </div>
            <Button onClick={() => setRefreshKey((current) => current + 1)} type="button" variant="secondary">Retry</Button>
          </Card>
        ) : null}

        {!error ? (
          <>
            <div className="org-dashboard-metrics">
              <DashboardMetricCard hint="Organizer-owned records" icon={<CalendarClock size={16} />} label="Total Activities" value={loading ? '--' : dashboardStats.totalActivities} />
              <DashboardMetricCard hint="Published and accepting volunteers" icon={<Sparkles size={16} />} label="Open Activities" tone="success" value={loading ? '--' : dashboardStats.openActivities} />
              <DashboardMetricCard hint="Awaiting review" icon={<ClipboardList size={16} />} label="Pending Registrations" tone="warning" value={loading || participationError ? '--' : dashboardStats.pendingRegistrations} />
              <DashboardMetricCard hint="Recorded today" icon={<CheckCircle2 size={16} />} label="Checked-ins Today" tone="success" value={loading || participationError ? '--' : dashboardStats.checkedInsToday} />
              <DashboardMetricCard hint={feedbackError ? 'Feedback API unavailable' : `${dashboardStats.feedbackCount} feedback records`} icon={<Star size={16} />} label="Avg. Feedback Rating" tone="neutral" value={loading || feedbackError || dashboardStats.feedbackCount === 0 ? '--' : dashboardStats.averageRating.toFixed(1)} />
            </div>

            {loading ? (
              <Card as="section" className="org-dashboard-state-card">
                <RefreshCw className="spin" size={20} />
                <div>
                  <h2>Loading organizer control center...</h2>
                  <p>Pulling activity, participation, feedback, and timeline data.</p>
                </div>
              </Card>
            ) : (
              <>
                {(participationError || feedbackError || timelineIntegrationMessage) && (
                  <div className="org-dashboard-inline-notes">
                    {participationError ? <p className="form-error">Participation data: {participationError}</p> : null}
                    {feedbackError ? <p className="org-dashboard-soft-note">Feedback snapshot unavailable: {feedbackError}</p> : null}
                    {timelineIntegrationMessage ? <p className="org-dashboard-soft-note">{timelineIntegrationMessage}</p> : null}
                  </div>
                )}

                <div className="org-dashboard-grid org-dashboard-grid-primary">
                  <Card as="section" className="org-dashboard-card org-dashboard-attention-card">
                    <div className="org-dashboard-card-head">
                      <div>
                        <p className="org-dashboard-eyebrow">Needs Attention</p>
                        <h2>Operational alerts</h2>
                      </div>
                      <Badge tone={needsAttentionItems.length > 0 ? 'info' : 'success'}>{needsAttentionItems.length > 0 ? `${needsAttentionItems.length} active` : 'Clear'}</Badge>
                    </div>
                    {needsAttentionItems.length === 0 ? (
                      <div className="org-dashboard-empty-block">
                        <CheckCircle2 size={18} />
                        <div>
                          <strong>No urgent organizer actions</strong>
                          <p>Pending registrations, low sign-ups, near-term events, and feedback issues are clear.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="org-dashboard-alert-list">
                        {needsAttentionItems.map((item) => (
                          <article className="org-dashboard-alert-item" key={item.key}>
                            <div>
                              <Badge tone={item.tone}>{item.title}</Badge>
                              <p>{item.description}</p>
                            </div>
                            <button onClick={item.onClick} type="button">{item.actionLabel}</button>
                          </article>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card as="section" className="org-dashboard-card org-dashboard-upcoming-card">
                    <div className="org-dashboard-card-head">
                      <div>
                        <p className="org-dashboard-eyebrow">Today / Upcoming</p>
                        <h2>Next activity context</h2>
                      </div>
                      <Badge tone="neutral">{upcomingActivities.length} upcoming</Badge>
                    </div>
                    {nearestActivity ? (
                      <div className="org-dashboard-next-activity">
                        <div>
                          <Badge tone={getStatusTone(nearestActivity.status)}>{toTitleCase(String(nearestActivity.status))}</Badge>
                          <h3>{nearestActivity.title}</h3>
                          <p>{formatDateTime(nearestActivity.start_time)}</p>
                          <span>{formatActivityLocation(nearestActivity.location)}</span>
                        </div>
                        <div className="org-dashboard-next-stats">
                          <div><strong>{participationCountsByActivity.get(nearestActivity.id) ?? 0}</strong><span>registered</span></div>
                          <div><strong>{nearestActivity.capacity}</strong><span>capacity</span></div>
                        </div>
                        <div className="org-dashboard-next-actions">
                          <Button onClick={() => navigate(`/organizer/activities?activityId=${encodeURIComponent(nearestActivity.id)}`)} type="button" variant="secondary">Manage</Button>
                          <Button onClick={() => navigate(`/organizer/checkins?activityId=${encodeURIComponent(nearestActivity.id)}`)} type="button">Check-ins</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="org-dashboard-empty-block">
                        <CalendarClock size={18} />
                        <div>
                          <strong>No upcoming activities</strong>
                          <p>Create a published activity to start receiving registrations.</p>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>

                <div className="org-dashboard-grid org-dashboard-grid-secondary">
                  <Card as="section" className="org-dashboard-card org-dashboard-table-card">
                    <div className="org-dashboard-card-head">
                      <div>
                        <p className="org-dashboard-eyebrow">Recent Registrations</p>
                        <h2>Latest volunteer applications</h2>
                      </div>
                      <Button onClick={() => navigate('/organizer/registrations')} type="button" variant="secondary">Open queue</Button>
                    </div>
                    {participationError ? (
                      <p className="muted">Registration preview is unavailable.</p>
                    ) : recentRegistrations.length === 0 ? (
                      <div className="org-dashboard-empty-block compact">
                        <UsersRound size={18} />
                        <div>
                          <strong>No registrations yet</strong>
                          <p>Applications will appear here once volunteers register.</p>
                        </div>
                      </div>
                    ) : (
                      <Table className="org-dashboard-table" wrapperClassName="org-dashboard-table-wrap">
                        <thead>
                          <tr>
                            <th>Volunteer</th>
                            <th>Activity</th>
                            <th>Status</th>
                            <th>Registered</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentRegistrations.map((participation) => {
                            const activityId = getParticipationActivityId(participation);
                            const activity = activityId ? activityById.get(activityId) : null;
                            const status = normalizeStatus(participation.status);
                            return (
                              <tr key={participation.id}>
                                <td>
                                  <div className="org-dashboard-person-cell">
                                    <span>{getVolunteerName(participation).charAt(0).toUpperCase()}</span>
                                    <strong>{getVolunteerName(participation)}</strong>
                                  </div>
                                </td>
                                <td>{activity?.title ?? participation.activityName}</td>
                                <td><AttendanceStatusBadge status={status} /></td>
                                <td>{formatDateOnly(participation.created_at ?? participation.date)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    )}
                  </Card>

                  <Card as="section" className="org-dashboard-card org-dashboard-attendance-card">
                    <div className="org-dashboard-card-head">
                      <div>
                        <p className="org-dashboard-eyebrow">Attendance</p>
                        <h2>Check-in snapshot</h2>
                      </div>
                      <Button onClick={() => navigate('/organizer/checkins')} type="button" variant="secondary">Open check-ins</Button>
                    </div>
                    <div className="org-dashboard-attendance-meter">
                      <div className="org-dashboard-ring" style={{ '--progress': `${attendanceSnapshot.rate}%` } as CSSProperties}>
                        <strong>{participationError ? '--' : `${attendanceSnapshot.rate}%`}</strong>
                        <span>rate</span>
                      </div>
                      <div className="org-dashboard-attendance-list">
                        <div><AttendanceStatusBadge status="checked_in" /><strong>{participationError ? '--' : attendanceSnapshot.checkedIn}</strong></div>
                        <div><AttendanceStatusBadge status="not_checked_in" /><strong>{participationError ? '--' : attendanceSnapshot.notCheckedIn}</strong></div>
                        <div><AttendanceStatusBadge status="approved" /><strong>{participationError ? '--' : attendanceSnapshot.totalExpected}</strong></div>
                      </div>
                    </div>
                  </Card>
                </div>

                <div className="org-dashboard-grid org-dashboard-grid-secondary">
                  <Card as="section" className="org-dashboard-card org-dashboard-feedback-card">
                    <div className="org-dashboard-card-head">
                      <div>
                        <p className="org-dashboard-eyebrow">Feedback</p>
                        <h2>Quality signals</h2>
                      </div>
                      <Button onClick={() => navigate('/feedback')} type="button" variant="secondary">Review feedback</Button>
                    </div>
                    {feedbackError ? (
                      <div className="org-dashboard-empty-block compact">
                        <MessageSquareText size={18} />
                        <div>
                          <strong>Feedback snapshot unavailable</strong>
                          <p>Open Feedback Review for detailed diagnostics when the API is available.</p>
                        </div>
                      </div>
                    ) : dashboardStats.feedbackCount === 0 ? (
                      <div className="org-dashboard-empty-block compact">
                        <MessageSquareText size={18} />
                        <div>
                          <strong>No feedback yet</strong>
                          <p>Feedback insights will appear after volunteers submit activity reviews.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="org-dashboard-feedback-summary">
                        <div className="org-dashboard-rating-box">
                          <strong>{dashboardStats.averageRating.toFixed(1)}</strong>
                          <span>avg rating</span>
                        </div>
                        <div className="org-dashboard-feedback-copy">
                          <p>{dashboardStats.feedbackCount} feedback records available for review.</p>
                          {feedbackReliabilityMessage ? <small>{feedbackReliabilityMessage}</small> : null}
                          {feedbackIssues.length > 0 ? (
                            <div className="org-dashboard-feedback-tags">
                              {feedbackIssues.slice(0, 3).map((issue) => (
                                <Badge key={issue.tag} tone={issue.priority === 'high' ? 'danger' : 'info'}>{issue.label} ({issue.count})</Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </Card>

                  <Card as="section" className="org-dashboard-card org-dashboard-timeline-card">
                    <div className="org-dashboard-card-head">
                      <div>
                        <p className="org-dashboard-eyebrow">Timeline</p>
                        <h2>Milestone preview</h2>
                      </div>
                      <Button
                        onClick={() =>
                          selectedBundle
                            ? navigate(`/organizer/activities?activityId=${selectedBundle.activity.id}&tab=timeline`)
                            : navigate('/organizer/activities')
                        }
                        type="button"
                        variant="secondary"
                      >
                        Open Timeline Manager
                      </Button>
                    </div>
                    <div className="org-dashboard-timeline-stats">
                      <div><span>Live</span><strong>{inProgressMilestones.length}</strong></div>
                      <div><span>Upcoming</span><strong>{upcomingMilestones.length}</strong></div>
                      <div><span>Completed</span><strong>{completedMilestones}</strong></div>
                    </div>
                    {activitiesWithTimeline.length > 0 ? (
                      <>
                        <div className="org-dashboard-activity-switch">
                          {activitiesWithTimeline.slice(0, 5).map((bundle) => (
                            <button
                              className={selectedActivityId === bundle.activity.id ? 'org-dashboard-activity-chip is-active' : 'org-dashboard-activity-chip'}
                              key={bundle.activity.id}
                              onClick={() => setSelectedActivityId(bundle.activity.id)}
                              type="button"
                            >
                              {bundle.activity.title}
                            </button>
                          ))}
                        </div>
                        <EventTimelineReadOnly compact emptyDescription="No organizer milestones found for this activity." milestones={selectedBundle?.milestones ?? []} />
                      </>
                    ) : (
                      <div className="org-dashboard-empty-block compact">
                        <Clock3 size={18} />
                        <div>
                          <strong>No timeline milestones yet</strong>
                          <p>Add milestones from Organizer Activity Management when timeline tracking is needed.</p>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              </>
            )}
          </>
        ) : null}
      </section>
    </OrganizerShell>
  );
}
