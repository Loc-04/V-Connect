import { CalendarClock, Clock3, PlayCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { EventTimelineReadOnly } from '../components/timeline';
import { Badge, Button, Card } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { listActivities } from '../lib/activities';
import { listActivityTimeline } from '../lib/timeline';
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
  const [timelineIntegrationMessage, setTimelineIntegrationMessage] = useState<string | null>(null);
  const [bundles, setBundles] = useState<ActivityTimelineBundle[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      setError('No active session token.');
      setBundles([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const activityRows = await listActivities({
          accessToken: session.access_token,
          mine: true,
          status: 'all',
          limit: 80,
        });

        const timelineRows = await Promise.all(
          activityRows.map(async (activity) => {
            const timeline = await listActivityTimeline(activity.id);
            return {
              activity,
              milestones: timeline.milestones,
              integrationMessage: timeline.integration.pendingServerIntegration
                ? timeline.integration.message
                : null,
            };
          })
        );

        if (cancelled) {
          return;
        }

        setBundles(
          timelineRows.map((item) => ({
            activity: item.activity,
            milestones: item.milestones,
          }))
        );
        setTimelineIntegrationMessage(timelineRows.find((item) => item.integrationMessage)?.integrationMessage ?? null);

        const firstTimelineActivity = timelineRows.find((item) => item.milestones.length > 0)?.activity.id ?? null;
        setSelectedActivityId((current) => current ?? firstTimelineActivity ?? activityRows[0]?.id ?? null);
      } catch (loadError) {
        if (!cancelled) {
          setBundles([]);
          setSelectedActivityId(null);
          setError(loadError instanceof Error ? loadError.message : 'Unable to load organizer dashboard data.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const flattenedMilestones = useMemo(
    () =>
      bundles.flatMap((bundle) =>
        bundle.milestones.map((milestone) => ({
          ...milestone,
          activityTitle: bundle.activity.title,
          activityId: bundle.activity.id,
        }))
      ),
    [bundles]
  );

  const now = Date.now();
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
          return Number.isFinite(startTime) && startTime >= now;
        })
        .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime())
        .slice(0, 5),
    [flattenedMilestones, now]
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

        {timelineIntegrationMessage ? (
          <Card as="section" className="org-dashboard-note-card">
            <p>{timelineIntegrationMessage}</p>
          </Card>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        {loading ? (
          <Card as="section" className="org-dashboard-card">
            <p className="muted">Loading timeline overview...</p>
          </Card>
        ) : (
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
                    emptyDescription="No organizer milestones found for this activity."
                    milestones={selectedBundle?.milestones ?? []}
                  />
                </>
              ) : (
                <p className="muted">No timeline data available yet. Add milestones from Organizer Activity Management.</p>
              )}
            </Card>
          </>
        )}
      </section>
    </OrganizerShell>
  );
}
