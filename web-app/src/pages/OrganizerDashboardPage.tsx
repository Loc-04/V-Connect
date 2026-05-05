import { CalendarClock, Clock3, PlayCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { EmptyLoadingErrorState } from '../components/feedback';
import { TimelineStatusBadge } from '../components/timeline';
import { Badge, Button, Card } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { listActivities } from '../lib/activities';
import { listActivityTimeline } from '../lib/timeline';
import { resolveTimelineMilestoneStatus } from '../lib/timelineStatus';
import type { ActivityRecord } from '../types/activity';
import type { TimelineMilestone } from '../types/timeline';
import './OrganizerDashboardPage.css';

interface ActivityTimelineBundle {
  activity: ActivityRecord;
  milestones: TimelineMilestone[];
}

function formatTypeLabel(type: string) {
  return String(type)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sortMilestonesByStart<T extends { startTime: string }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftTime = new Date(left.startTime).getTime();
    const rightTime = new Date(right.startTime).getTime();
    const normalizedLeft = Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER;
    const normalizedRight = Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER;
    return normalizedLeft - normalizedRight;
  });
}

function toValidDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDashboardDate(date: Date, includeYear = false) {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: includeYear ? 'numeric' : undefined,
  });
}

function formatDashboardTime(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatDashboardRange(startTime: string, endTime: string) {
  const start = toValidDate(startTime);
  const end = toValidDate(endTime);
  if (!start || !end) {
    return 'Time TBD';
  }

  if (isSameDay(start, end)) {
    return `${formatDashboardDate(start, false)} · ${formatDashboardTime(start)}-${formatDashboardTime(end)}`;
  }

  return `${formatDashboardDate(start, false)} ${formatDashboardTime(start)} - ${formatDashboardDate(end, false)} ${formatDashboardTime(end)}`;
}

function formatDashboardPoint(value: string) {
  const date = toValidDate(value);
  if (!date) {
    return 'Time TBD';
  }
  return `${formatDashboardDate(date, true)} · ${formatDashboardTime(date)}`;
}

export function OrganizerDashboardPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bundles, setBundles] = useState<ActivityTimelineBundle[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadDashboardData = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      setError('No active session token.');
      setBundles([]);
      setSelectedActivityId(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const activityRows = await listActivities({
        accessToken: session.access_token,
        mine: true,
        status: 'all',
        limit: 80,
      });

      const timelineRows = await Promise.all(
        activityRows.map(async (activity) => {
          const timeline = await listActivityTimeline(activity.id, session.access_token);
          return {
            activity,
            milestones: timeline.milestones,
          };
        })
      );

      setBundles(
        timelineRows.map((item) => ({
          activity: item.activity,
          milestones: item.milestones,
        }))
      );

      const firstTimelineActivity = timelineRows.find((item) => item.milestones.length > 0)?.activity.id ?? null;
      setSelectedActivityId((current) => current ?? firstTimelineActivity ?? activityRows[0]?.id ?? null);
    } catch (loadError) {
      setBundles([]);
      setSelectedActivityId(null);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load organizer dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const flattenedMilestones = useMemo(
    () =>
      bundles.flatMap((bundle) =>
        bundle.milestones.map((milestone) => ({
          ...milestone,
          status: resolveTimelineMilestoneStatus(milestone, nowMs),
          activityTitle: bundle.activity.title,
          activityId: bundle.activity.id,
        }))
      ),
    [bundles, nowMs]
  );

  const inProgressMilestones = useMemo(
    () => flattenedMilestones.filter((milestone) => milestone.status === 'in_progress'),
    [flattenedMilestones]
  );
  const upcomingMilestones = useMemo(
    () =>
      flattenedMilestones
        .filter((milestone) => {
          if (milestone.status !== 'upcoming') {
            return false;
          }
          const startTime = new Date(milestone.startTime).getTime();
          return Number.isFinite(startTime) && startTime >= nowMs;
        })
        .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime())
        .slice(0, 5),
    [flattenedMilestones, nowMs]
  );
  const completedMilestones = useMemo(
    () => flattenedMilestones.filter((milestone) => milestone.status === 'completed').length,
    [flattenedMilestones]
  );
  const activitiesWithTimeline = useMemo(
    () => bundles.filter((bundle) => bundle.milestones.length > 0),
    [bundles]
  );
  const selectedBundle = useMemo(
    () => bundles.find((bundle) => bundle.activity.id === selectedActivityId) ?? null,
    [bundles, selectedActivityId]
  );
  const hasAnyActivities = bundles.length > 0;
  const nextUpcomingMilestone = upcomingMilestones[0] ?? null;
  const totalMilestones = flattenedMilestones.length;
  const remainingMilestones = Math.max(totalMilestones - completedMilestones, 0);
  const selectedMilestones = useMemo(
    () =>
      sortMilestonesByStart(
        (selectedBundle?.milestones ?? []).map((milestone) => ({
          ...milestone,
          status: resolveTimelineMilestoneStatus(milestone, nowMs),
        }))
      ),
    [nowMs, selectedBundle?.milestones]
  );
  const selectedTimelinePreview = useMemo(() => selectedMilestones.slice(0, 6), [selectedMilestones]);
  const hasSelectedTimeline = selectedMilestones.length > 0;

  const liveOverviewState = useMemo(() => {
    if (inProgressMilestones.length > 0) {
      return {
        label: 'In Progress',
        tone: 'success' as const,
        description: 'A milestone is currently active in your timeline.',
      };
    }
    if (upcomingMilestones.length > 0) {
      return {
        label: 'Upcoming',
        tone: 'info' as const,
        description: 'No live milestone right now. The next one is scheduled.',
      };
    }
    if (completedMilestones > 0) {
      return {
        label: 'Completed',
        tone: 'neutral' as const,
        description: 'No live milestone right now. Existing milestones are completed.',
      };
    }
    return {
      label: 'No Live Milestone',
      tone: 'neutral' as const,
      description: 'Create milestones to start tracking live timeline progress.',
    };
  }, [completedMilestones, inProgressMilestones.length, upcomingMilestones.length]);

  return (
    <OrganizerShell
      activeNav="dashboard"
      headerActions={
        <Button onClick={() => navigate('/organizer/activities')} type="button" variant="secondary">
          Manage Activities
        </Button>
      }
      pageSubtitle="Quick view of activity lifecycle and organizer-managed timeline progress."
      pageTitle="Organizer Dashboard"
    >
      <section className="org-dashboard-page">
        {!loading && hasAnyActivities ? (
        <div className="org-dashboard-metrics">
          <Card as="article" className="org-dashboard-metric-card">
            <div className="org-dashboard-metric-head">
              <span className="org-dashboard-metric-icon">
                <CalendarClock size={16} />
              </span>
              <p>Activities with Timeline</p>
            </div>
            <strong>{activitiesWithTimeline.length}</strong>
            <small>{bundles.length} tracked activities in total</small>
          </Card>
          <Card as="article" className="org-dashboard-metric-card">
            <div className="org-dashboard-metric-head">
              <span className="org-dashboard-metric-icon is-accent">
                <PlayCircle size={16} />
              </span>
              <p>In Progress Milestones</p>
            </div>
            <strong>{inProgressMilestones.length}</strong>
            <small>{upcomingMilestones.length} upcoming in queue</small>
          </Card>
          <Card as="article" className="org-dashboard-metric-card">
            <div className="org-dashboard-metric-head">
              <span className="org-dashboard-metric-icon is-success">
                <Clock3 size={16} />
              </span>
              <p>Completed Milestones</p>
            </div>
            <strong>{completedMilestones}</strong>
            <small>{remainingMilestones} remaining milestones</small>
          </Card>
        </div>
      ) : null}

        {error && !loading ? (
          <Card as="section" className="org-dashboard-card">
            <EmptyLoadingErrorState
              action={
                <Button onClick={() => void loadDashboardData()} type="button" variant="secondary">
                  Retry
                </Button>
              }
              description={error}
              state="error"
              title="Unable to load organizer dashboard data"
            />
          </Card>
        ) : null}

        {loading ? (
          <Card as="section" className="org-dashboard-card">
            <EmptyLoadingErrorState
              description="Loading activities and milestone timelines for the dashboard."
              state="loading"
              title="Loading timeline overview"
            />
          </Card>
        ) : !error && hasAnyActivities ? (
          <>
            <Card as="section" className="org-dashboard-card">
              <div className="org-dashboard-card-head">
                <h2>Live Milestone Overview</h2>
                <Badge tone={liveOverviewState.tone}>{liveOverviewState.label}</Badge>
              </div>
              <p className="org-dashboard-overview-note">{liveOverviewState.description}</p>
              <div className="org-dashboard-overview-grid">
                <div className="org-dashboard-overview-panel">
                  <div className="org-dashboard-overview-panel-head">
                    <h3>Current Live Milestone</h3>
                    <Badge tone={inProgressMilestones.length > 0 ? 'success' : 'neutral'}>
                      {inProgressMilestones.length > 0 ? `${inProgressMilestones.length} live` : 'None'}
                    </Badge>
                  </div>
                  {inProgressMilestones.length === 0 ? (
                    <div className="org-dashboard-empty-snapshot">
                      <strong>No milestone is currently in progress.</strong>
                      <span>Timeline status will switch to live automatically when a milestone time starts.</span>
                    </div>
                  ) : (
                    <ul className="org-dashboard-list">
                      {inProgressMilestones.slice(0, 3).map((milestone) => (
                        <li key={milestone.id}>
                          <strong>{milestone.title}</strong>
                          <span>{milestone.activityTitle}</span>
                          <small>{formatDashboardRange(milestone.startTime, milestone.endTime)}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="org-dashboard-overview-panel">
                  <div className="org-dashboard-overview-panel-head">
                    <h3>Next Upcoming Milestone</h3>
                    <Badge tone={nextUpcomingMilestone ? 'info' : 'neutral'}>
                      {nextUpcomingMilestone ? 'Scheduled' : 'Empty'}
                    </Badge>
                  </div>
                  {nextUpcomingMilestone ? (
                    <ul className="org-dashboard-list">
                      <li key={nextUpcomingMilestone.id}>
                        <strong>{nextUpcomingMilestone.title}</strong>
                        <span>{nextUpcomingMilestone.activityTitle}</span>
                        <small>{formatDashboardPoint(nextUpcomingMilestone.startTime)}</small>
                      </li>
                    </ul>
                  ) : (
                    <div className="org-dashboard-empty-snapshot">
                      <strong>No upcoming milestone is scheduled.</strong>
                      <span>Add milestones in timeline manager to build the next activity flow.</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card as="section" className="org-dashboard-card">
              <div className="org-dashboard-card-head">
                <h2>Activity Timeline Preview</h2>
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

              {activitiesWithTimeline.length > 0 ? (
                <>
                  <div className="org-dashboard-activity-switch">
                    {activitiesWithTimeline.slice(0, 6).map((bundle) => (
                      <button
                        className={
                          selectedActivityId === bundle.activity.id
                            ? 'org-dashboard-activity-chip is-active'
                            : 'org-dashboard-activity-chip'
                        }
                        key={bundle.activity.id}
                        onClick={() => setSelectedActivityId(bundle.activity.id)}
                        type="button"
                      >
                        <span>{bundle.activity.title}</span>
                        <Badge className="org-dashboard-chip-count" tone="neutral">
                          {bundle.milestones.length}
                        </Badge>
                      </button>
                    ))}
                  </div>
                  <p className="org-dashboard-timeline-note">
                    Showing the first {selectedTimelinePreview.length} milestone{selectedTimelinePreview.length === 1 ? '' : 's'} in time order.
                  </p>
                  {hasSelectedTimeline ? (
                    <div className="org-dashboard-timeline-preview">
                      {selectedTimelinePreview.map((milestone) => (
                        <article className="org-dashboard-timeline-item" key={milestone.id}>
                          <div className="org-dashboard-timeline-top">
                            <h3>{milestone.title}</h3>
                            <TimelineStatusBadge status={milestone.status} />
                          </div>
                          <p className="org-dashboard-timeline-meta">
                            {formatDashboardRange(milestone.startTime, milestone.endTime)}
                          </p>
                          <div className="org-dashboard-timeline-tags">
                            <Badge tone="neutral">{formatTypeLabel(milestone.type)}</Badge>
                          </div>
                          {milestone.description ? (
                            <p className="org-dashboard-timeline-description">{milestone.description}</p>
                          ) : (
                            <p className="org-dashboard-timeline-description muted">No additional details provided.</p>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No timeline milestones available yet.</p>
                  )}
                </>
              ) : (
                <p className="muted">No timeline data available yet. Add milestones from Organizer Activity Management.</p>
              )}
            </Card>
          </>
        ) : !error ? (
          <Card as="section" className="org-dashboard-card">
            <EmptyLoadingErrorState
              action={
                <Button onClick={() => navigate('/organizer/activities')} type="button" variant="secondary">
                  Open Activity Management
                </Button>
              }
              description="No organizer activities were found yet. Create an activity to start tracking milestones here."
              state="empty"
              title="No activity data available"
            />
          </Card>
        ) : null}
      </section>
    </OrganizerShell>
  );
}
