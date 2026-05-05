import { CalendarClock, Clock3, PlayCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { EmptyLoadingErrorState } from '../components/feedback';
import { EventTimelineReadOnly } from '../components/timeline';
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

function formatTimeLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Time TBD';
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
              <span className="org-dashboard-metric-icon">
                <CalendarClock size={16} />
              </span>
              <p>Activities with Timeline</p>
              <strong>{activitiesWithTimeline.length}</strong>
            </Card>
            <Card as="article" className="org-dashboard-metric-card">
              <span className="org-dashboard-metric-icon is-accent">
                <PlayCircle size={16} />
              </span>
              <p>In Progress Milestones</p>
              <strong>{inProgressMilestones.length}</strong>
            </Card>
            <Card as="article" className="org-dashboard-metric-card">
              <span className="org-dashboard-metric-icon is-success">
                <Clock3 size={16} />
              </span>
              <p>Completed Milestones</p>
              <strong>{completedMilestones}</strong>
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
                <Badge tone="info">During Event</Badge>
              </div>
              {inProgressMilestones.length === 0 && upcomingMilestones.length === 0 ? (
                <p className="muted">No live timeline milestones yet. Create or update milestones in Activity Management.</p>
              ) : (
                <div className="org-dashboard-overview-grid">
                  <div>
                    <h3>In Progress</h3>
                    {inProgressMilestones.length === 0 ? (
                      <p className="muted">No milestone is currently in progress.</p>
                    ) : (
                      <ul className="org-dashboard-list">
                        {inProgressMilestones.map((milestone) => (
                          <li key={milestone.id}>
                            <strong>{milestone.title}</strong>
                            <span>{milestone.activityTitle}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3>Upcoming</h3>
                    {upcomingMilestones.length === 0 ? (
                      <p className="muted">No upcoming milestone.</p>
                    ) : (
                      <ul className="org-dashboard-list">
                        {upcomingMilestones.map((milestone) => (
                          <li key={milestone.id}>
                            <strong>{milestone.title}</strong>
                            <span>
                              {milestone.activityTitle} - {formatTimeLabel(milestone.startTime)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
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
                        {bundle.activity.title}
                      </button>
                    ))}
                  </div>
                  <EventTimelineReadOnly
                    compact
                    emptyDescription="No timeline milestones available yet."
                    milestones={selectedBundle?.milestones ?? []}
                  />
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
