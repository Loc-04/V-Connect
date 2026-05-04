import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarClock, Heart, MapPin, Share2, Users } from 'lucide-react';

import { useAuth } from '../auth/useAuth';
import { RegistrationAction } from '../components/activities/RegistrationAction';
import { ActivityLocationMap } from '../components/maps/ActivityLocationMap';
import { EventTimelineReadOnly } from '../components/timeline';
import { Badge, Button, Card } from '../components/ui';
import { VolunteerShell } from '../layouts/VolunteerShell';
import {
  buildActivityMapUrl,
  formatActivityLocation,
  getActivityAddressLine,
  getActivityCoordinates,
  type ActivityCoordinates,
} from '../lib/activityLocation';
import { getActivityById } from '../lib/activities';
import { getGuestIntentParamName, readGuestIntent, type GuestProtectedAction } from '../lib/guestAuth';
import { cancelParticipation, listParticipations } from '../lib/participations';
import { getMockActivityDetailById } from '../lib/participationMocks';
import { listActivityTimeline } from '../lib/timeline';
import type { ActivityDetailMock } from '../lib/participationMocks';
import type { ActivityPriorityLevel, ActivityRecord } from '../types/activity';
import type { ParticipationRecord } from '../types/participation';
import type { TimelineMilestone } from '../types/timeline';
import './ActivityDetailPage.css';

type ViewStatus = 'completed' | 'upcoming' | 'cancelled' | 'published' | 'expired';

interface ActivityDetailViewModel {
  id: string;
  title: string;
  organization: string;
  description: string;
  locationName: string;
  locationAddress: string;
  dateLabel: string;
  timeLabel: string;
  volunteerHours: number;
  maxParticipants: number;
  currentParticipants: number | null;
  status: ViewStatus;
  level: string;
  categories: string[];
  requirements: string[];
  skillPriorities: Record<string, ActivityPriorityLevel>;
  heroImageUrl: string;
  locationCoordinates: ActivityCoordinates | null;
  mapUrl: string | null;
}

const PARTICIPANT_AVATARS = [
  'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=150',
  'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=150',
  'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=150',
  'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150',
];

function toStatus(value: string, endTime?: string | null): ViewStatus {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'cancelled' || normalized === 'completed') {
    return normalized;
  }
  if (endTime) {
    const end = new Date(endTime);
    if (!Number.isNaN(end.getTime()) && end.getTime() <= Date.now()) {
      return 'expired';
    }
  }
  if (normalized === 'completed' || normalized === 'cancelled' || normalized === 'published') {
    return normalized;
  }
  return 'upcoming';
}

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function toHours(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return Math.max(0, Number(diff.toFixed(1)));
}

function formatDateAndTime(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { dateLabel: 'Date TBD', timeLabel: 'Time TBD' };
  }

  return {
    dateLabel: start.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }),
    timeLabel: `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString(
      [],
      { hour: '2-digit', minute: '2-digit' }
    )}`,
  };
}

function locationLabel(location: ActivityRecord['location']) {
  return formatActivityLocation(location);
}

function normalizeSkillPriority(value: unknown): ActivityPriorityLevel {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'low' || normalized === 'normal' || normalized === 'urgent') {
    return normalized;
  }
  return 'normal';
}

function getSkillPriorityMapFromLocation(location: ActivityRecord['location']): Record<string, ActivityPriorityLevel> {
  if (!location || typeof location !== 'object' || Array.isArray(location)) {
    return {};
  }

  const rawMap = location.skillPriorities;
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) {
    return {};
  }

  const normalized: Record<string, ActivityPriorityLevel> = {};
  for (const [skill, priority] of Object.entries(rawMap)) {
    const key = String(skill ?? '').trim();
    if (!key) continue;
    normalized[key] = normalizeSkillPriority(priority);
  }

  return normalized;
}

function getSkillPriorityClass(skill: string, priorities: Record<string, ActivityPriorityLevel>) {
  const direct = priorities[skill];
  if (direct) {
    return `is-priority-${direct}`;
  }
  const fallback = Object.entries(priorities).find(([name]) => name.toLowerCase() === skill.toLowerCase())?.[1];
  return fallback ? `is-priority-${fallback}` : 'is-priority-normal';
}

function mapFromMock(mock: ActivityDetailMock): ActivityDetailViewModel {
  const { dateLabel, timeLabel } = formatDateAndTime(mock.startTime, mock.endTime);
  return {
    id: mock.id,
    title: mock.title,
    organization: mock.organization,
    description: mock.description,
    locationName: mock.locationName,
    locationAddress: mock.locationAddress,
    dateLabel,
    timeLabel,
    volunteerHours: mock.volunteerHours,
    maxParticipants: mock.maxParticipants,
    currentParticipants: mock.currentParticipants,
    status: toStatus(mock.status, mock.endTime),
    level: mock.level,
    categories: mock.categories,
    requirements: mock.requirements,
    skillPriorities: {},
    heroImageUrl: mock.heroImageUrl,
    locationCoordinates: null,
    mapUrl: mock.locationAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mock.locationAddress)}`
      : null,
  };
}

function mapFromApi(activity: ActivityRecord, fallback: ActivityDetailMock | null): ActivityDetailViewModel {
  const { dateLabel, timeLabel } = formatDateAndTime(activity.start_time, activity.end_time);
  const skills = Array.isArray(activity.required_skills) ? activity.required_skills : [];
  const categories = skills.length > 0 ? skills.slice(0, 2).map(titleCase) : fallback?.categories ?? ['Community'];
  const requirements = skills.length > 0 ? skills.slice(0, 3).map(titleCase) : fallback?.requirements ?? ['Teamwork'];
  const maxParticipants = Number(activity.capacity ?? fallback?.maxParticipants ?? 0);
  const skillPriorities = getSkillPriorityMapFromLocation(activity.location);

  return {
    id: activity.id,
    title: activity.title || fallback?.title || 'Untitled Activity',
    organization: fallback?.organization || 'Community Organizer',
    description:
      activity.description?.trim() ||
      fallback?.description ||
      'Details for this activity are being updated by the organizer.',
    locationName: locationLabel(activity.location),
    locationAddress: getActivityAddressLine(activity.location) || fallback?.locationAddress || locationLabel(activity.location),
    dateLabel,
    timeLabel,
    volunteerHours: toHours(activity.start_time, activity.end_time),
    maxParticipants,
    currentParticipants: fallback?.currentParticipants ?? null,
    status: toStatus(String(activity.status ?? 'upcoming'), activity.end_time),
    level: fallback?.level || 'Open to all levels',
    categories,
    requirements,
    skillPriorities,
    heroImageUrl: String(activity.cover_image_url ?? '').trim(),
    locationCoordinates: getActivityCoordinates(activity.location),
    mapUrl: buildActivityMapUrl(activity.location),
  };
}

function getStatusTone(status: ViewStatus) {
  if (status === 'completed') {
    return 'success' as const;
  }
  if (status === 'cancelled') {
    return 'danger' as const;
  }
  if (status === 'expired') {
    return 'danger' as const;
  }
  if (status === 'published') {
    return 'info' as const;
  }
  return 'info' as const;
}

function getGuestIntentMessage(action: GuestProtectedAction, canRegister: boolean) {
  if (action === 'join') {
    return canRegister
      ? 'You are back on the same activity after signing in. Use the registration panel below to continue joining.'
      : 'You are back on the same activity after signing in. Joining is currently available for volunteer accounts only.';
  }

  if (action === 'ai_match') {
    return canRegister
      ? 'You are back on the same activity after signing in. Open AI recommendations to compare your fit before joining.'
      : 'You are back on the same activity after signing in. AI matching is available from the volunteer workspace.';
  }

  if (action === 'save') {
    return 'You are back on the same activity after signing in. Continue reviewing the details from your authenticated workspace.';
  }

  return 'You are back on the same activity after signing in. Continue from the organizer details and activity actions.';
}

export function ActivityDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { session, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [intentNotice, setIntentNotice] = useState<{ action: GuestProtectedAction; message: string } | null>(null);
  const [activity, setActivity] = useState<ActivityDetailViewModel | null>(null);
  const [usingMockFallback, setUsingMockFallback] = useState(false);
  const [participation, setParticipation] = useState<ParticipationRecord | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineMilestones, setTimelineMilestones] = useState<TimelineMilestone[]>([]);
  const registrationPanelRef = useRef<HTMLDivElement | null>(null);
  const canRegister = profile?.role === 'volunteer';
  const recommendationItemIdFromQuery = useMemo(() => {
    const raw = searchParams.get('recommendationItemId');
    const value = String(raw ?? '').trim();
    return value || null;
  }, [searchParams]);
  const guestIntent = useMemo(
    () => readGuestIntent(searchParams.get(getGuestIntentParamName())),
    [searchParams]
  );

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('Missing activity id.');
      return;
    }

    if (!session?.access_token) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    let cancelled = false;
    const fallback = getMockActivityDetailById(id);

    setLoading(true);
    setError(null);
    setUsingMockFallback(false);

    void (async () => {
      try {
        const response = await getActivityById(id, session.access_token);
        if (cancelled) {
          return;
        }
        setActivity(mapFromApi(response, fallback));
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        if (fallback) {
          setActivity(mapFromMock(fallback));
          setUsingMockFallback(true);
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load activity detail.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, session?.access_token]);

  useEffect(() => {
    if (!id || !session?.access_token || !canRegister) {
      setParticipation(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const rows = await listParticipations({
          accessToken: session.access_token,
          mine: true,
          activityId: id,
          limit: 1,
        });

        if (!cancelled) {
          setParticipation(rows[0] ?? null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load your registration status.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canRegister, id, session?.access_token]);

  useEffect(() => {
    if (!activity?.id) {
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

    void listActivityTimeline(activity.id, session.access_token)
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
            timelineLoadError instanceof Error ? timelineLoadError.message : 'Unable to load event timeline.'
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
  }, [activity?.id, session?.access_token]);

  useEffect(() => {
    if (!guestIntent) {
      return;
    }

    setIntentNotice({
      action: guestIntent,
      message: getGuestIntentMessage(guestIntent, canRegister),
    });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete(getGuestIntentParamName());
    setSearchParams(nextParams, { replace: true });
  }, [canRegister, guestIntent, searchParams, setSearchParams]);

  useEffect(() => {
    if (loading || error || !activity || intentNotice?.action !== 'join' || !registrationPanelRef.current) {
      return;
    }

    registrationPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activity, error, intentNotice, loading]);

  const handleRegistrationNotice = (type: 'success' | 'error', nextMessage: string) => {
    if (type === 'error') {
      setError(nextMessage);
      setMessage(null);
      return;
    }

    setMessage(nextMessage);
    setError(null);
  };

  const handleShareActivity = async () => {
    if (!activity) {
      return;
    }

    const pageUrl = window.location.href;
    const shareData = {
      title: activity.title,
      text: `${activity.title} - ${activity.organization}`,
      url: pageUrl,
    };

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(shareData);
        setMessage('Activity link shared.');
        setError(null);
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pageUrl);
        setMessage('Activity link copied to clipboard.');
        setError(null);
        return;
      }

      window.open(`mailto:?subject=${encodeURIComponent(activity.title)}&body=${encodeURIComponent(pageUrl)}`, '_blank');
      setMessage('Opened email share draft.');
      setError(null);
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === 'AbortError') {
        return;
      }
      setMessage(null);
      setError(shareError instanceof Error ? shareError.message : 'Unable to share this activity right now.');
    }
  };

  const handleOpenMap = () => {
    if (!activity) {
      return;
    }

    if (!activity.mapUrl) {
      setMessage(null);
      setError('No location data is available to open map.');
      return;
    }

    window.open(activity.mapUrl, '_blank', 'noopener,noreferrer');
  };

  const openSlotsLabel = useMemo(() => {
    if (!activity) {
      return '--';
    }
    if (activity.currentParticipants === null) {
      return `-- / ${activity.maxParticipants}`;
    }
    return `${activity.currentParticipants} / ${activity.maxParticipants}`;
  }, [activity]);

  const canSubmitRegistration = canRegister && activity?.status !== 'expired';

  return (
    <VolunteerShell
      activeNav="activities"
      headerActions={
        <div className="activity-detail-head-actions">
          <Button onClick={() => navigate('/volunteer/participation-history')} type="button" variant="secondary">
            Back to History
          </Button>
          <Button aria-label="Share activity" onClick={() => void handleShareActivity()} type="button" variant="secondary">
            <Share2 size={16} />
          </Button>
          <Button
            aria-label="Save activity is not available yet"
            disabled
            title="Saving activity is not available yet."
            type="button"
            variant="secondary"
          >
            <Heart size={16} />
          </Button>
        </div>
      }
      pageSubtitle={
        activity
          ? `${activity.organization} - ${activity.dateLabel}`
          : 'Review the schedule, requirements, and participation details before joining.'
      }
      pageTitle={activity?.title ?? 'Activity Details'}
    >
      <section className="activity-detail-page">
        {intentNotice ? (
          <Card className={`activity-detail-intent-card is-${intentNotice.action}`}>
            <div>
              <strong>Continue where you left off</strong>
              <p>{intentNotice.message}</p>
            </div>
            {intentNotice.action === 'join' ? (
              <Button
                onClick={() => registrationPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                type="button"
                variant="secondary"
              >
                Go to registration
              </Button>
            ) : null}
            {intentNotice.action === 'ai_match' && canRegister ? (
              <Button onClick={() => navigate('/volunteer/ai-recommended-activities')} type="button" variant="secondary">
                Open AI Match
              </Button>
            ) : null}
          </Card>
        ) : null}
        {message && <p className="form-success">{message}</p>}

        {loading && (
          <Card className="activity-detail-state-card">
            <p>Loading activity detail...</p>
          </Card>
        )}

        {!loading && error && (
          <Card className="activity-detail-state-card">
            <p className="form-error">{error}</p>
            <Button onClick={() => navigate('/volunteer/participation-history')} type="button" variant="secondary">
              Back to Participation History
            </Button>
          </Card>
        )}

        {!loading && !error && activity && (
          <>
            {usingMockFallback && (
              <p className="activity-detail-note">
                Live activity details are temporarily unavailable. Showing the best available preview.
              </p>
            )}

            <div className="activity-detail-grid">
              <Card as="section" className="activity-detail-main">
                <img alt={activity.title} className="activity-detail-hero-image" src={activity.heroImageUrl} />

                <div className="activity-detail-tags">
                  <Badge className="activity-detail-status-tag" tone={getStatusTone(activity.status)}>
                    {titleCase(activity.status)}
                  </Badge>
                  {activity.categories.map((category) => (
                    <Badge
                      className={`activity-detail-skill-tag ${getSkillPriorityClass(category, activity.skillPriorities)}`}
                      key={category}
                      tone="neutral"
                    >
                      {category}
                    </Badge>
                  ))}
                </div>

                <h1>{activity.title}</h1>

                <article className="activity-detail-organizer-card">
                  <div className="activity-detail-org-avatar" aria-hidden="true">
                    {activity.organization.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p>{activity.organization}</p>
                    <small>Verified Organizer</small>
                  </div>
                  <Button
                    aria-label="Follow organizer is not available yet"
                    disabled
                    title="Follow organizer is not available yet."
                    type="button"
                    variant="secondary"
                  >
                    Follow (Soon)
                  </Button>
                </article>

                <section className="activity-detail-section">
                  <h2>About this activity</h2>
                  <p>{activity.description}</p>
                </section>

                <section className="activity-detail-timeline">
                  <div className="activity-detail-section-head">
                    <h2>Event Timeline</h2>
                    <Badge tone="info">Read Only</Badge>
                  </div>
                  <EventTimelineReadOnly
                    emptyDescription="No timeline milestones available yet."
                    milestones={timelineMilestones}
                    loading={timelineLoading}
                    error={timelineError}
                  />
                </section>

                <section className="activity-detail-requirements">
                  <h3>Volunteer Requirements</h3>
                  <div>
                    {activity.requirements.map((requirement) => (
                      <Badge
                        className={`activity-detail-skill-tag activity-detail-pill ${getSkillPriorityClass(requirement, activity.skillPriorities)}`}
                        key={requirement}
                        tone="neutral"
                      >
                        {requirement}
                      </Badge>
                    ))}
                  </div>
                </section>

                <div className="activity-detail-stats">
                  <div>
                    <small>Duration</small>
                    <strong>{activity.volunteerHours} Hours</strong>
                  </div>
                  <div>
                    <small>Open Slots</small>
                    <strong>{openSlotsLabel}</strong>
                  </div>
                  <div>
                    <small>Level</small>
                    <strong>{activity.level}</strong>
                  </div>
                </div>
              </Card>

              <aside className="activity-detail-aside">
                <Card as="article" className="activity-detail-side-card">
                  <div className="activity-detail-side-block">
                    <small>
                      <CalendarClock className="activity-detail-side-icon" /> Date &amp; Time
                    </small>
                    <strong>{activity.dateLabel}</strong>
                    <p>{activity.timeLabel}</p>
                  </div>

                  <div className="activity-detail-side-block">
                    <small>
                      <MapPin className="activity-detail-side-icon" /> Location
                    </small>
                    <strong>{activity.locationName}</strong>
                    <p>{activity.locationAddress}</p>
                  </div>

                  <div className="activity-detail-side-block">
                    <small>
                      <Users className="activity-detail-side-icon" /> Current Participants
                    </small>
                    <div className="activity-detail-avatars">
                      {PARTICIPANT_AVATARS.map((avatar) => (
                        <img alt="" key={avatar} src={avatar} />
                      ))}
                      <span>
                        +{activity.currentParticipants === null ? '--' : Math.max(activity.currentParticipants - 4, 0)}
                      </span>
                    </div>
                  </div>

                  <div
                    className={
                      intentNotice?.action === 'join'
                        ? 'activity-detail-registration-focus is-highlighted'
                        : 'activity-detail-registration-focus'
                    }
                    ref={registrationPanelRef}
                  >
                    <RegistrationAction
                      accessToken={session?.access_token ?? null}
                      activityId={activity.id}
                      canRegister={canSubmitRegistration}
                      className="activity-detail-registration-action"
                      recommendationItemId={recommendationItemIdFromQuery}
                      currentStatus={participation?.status ?? 'none'}
                      confirmCancelMessage="Cancel this registration for the activity?"
                      registerDisabledLabel={canRegister ? 'Registration closed' : 'Volunteer only'}
                      onCancel={async ({ activityId }) => {
                        if (!session?.access_token) {
                          throw new Error('No active session token.');
                        }

                        const cancelledParticipation = await cancelParticipation(activityId, session.access_token);
                        setParticipation(cancelledParticipation);
                      }}
                      onNotice={handleRegistrationNotice}
                      onRegistered={(nextParticipation) => {
                        setParticipation(nextParticipation);
                      }}
                    />
                  </div>
                  <small className="activity-detail-guideline">By joining, you agree to our community guideline.</small>
                </Card>

                <Card as="article" className="activity-detail-map-card">
                  <ActivityLocationMap
                    address={activity.locationAddress || activity.locationName}
                    compact
                    coordinates={activity.locationCoordinates}
                    emptyMessage="The organizer has not saved map coordinates for this activity yet. You can still open the address in your maps app."
                    emptyTitle="Live map preview is not available"
                    interactive
                    title={activity.title}
                  />
                  <Button
                    className="activity-detail-map-btn"
                    disabled={!activity.mapUrl}
                    onClick={handleOpenMap}
                    type="button"
                    variant="secondary"
                  >
                    Open in Map
                  </Button>
                </Card>
              </aside>
            </div>
          </>
        )}
      </section>
    </VolunteerShell>
  );
}

