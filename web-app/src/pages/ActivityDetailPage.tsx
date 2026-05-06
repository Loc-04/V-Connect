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
import { formatActivityCardDateLabel, formatDateAndTimeLabels, formatHumanDuration } from '../lib/dateTimeFormat';
import { getActivityById } from '../lib/activities';
import { getGuestIntentParamName, readGuestIntent, type GuestProtectedAction } from '../lib/guestAuth';
import { cancelParticipation, listParticipations, respondToAssignedParticipation } from '../lib/participations';
import { listActivityTimeline } from '../lib/timeline';
import type { ActivityRecord } from '../types/activity';
import type { ParticipationRecord } from '../types/participation';
import type { TimelineMilestone } from '../types/timeline';
import './ActivityDetailPage.css';

type ViewStatus = 'completed' | 'upcoming' | 'cancelled' | 'published' | 'expired';
type ActivityLoadState = 'loading' | 'success' | 'error' | 'not_found';

interface ActivityDetailViewModel {
  id: string;
  title: string;
  organization: string;
  description: string;
  locationName: string;
  locationAddress: string;
  summaryDateLabel: string;
  dateLabel: string;
  timeLabel: string;
  durationLabel: string;
  maxParticipants: number;
  currentParticipants: number | null;
  status: ViewStatus;
  level: string;
  categories: string[];
  requirements: string[];
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

function locationLabel(location: ActivityRecord['location']) {
  return formatActivityLocation(location);
}

function mapFromApi(activity: ActivityRecord): ActivityDetailViewModel {
  const { dateLabel, timeLabel } = formatDateAndTimeLabels(activity.start_time, activity.end_time, {
    includeWeekday: true,
  });
  const skills = Array.isArray(activity.required_skills) ? activity.required_skills : [];
  const categories = skills.length > 0 ? skills.slice(0, 2).map(titleCase) : ['Community'];
  const requirements = skills.length > 0 ? skills.slice(0, 3).map(titleCase) : ['Teamwork'];
  const maxParticipants = Number(activity.capacity ?? 0);

  return {
    id: activity.id,
    title: activity.title || 'Untitled Activity',
    organization: 'Community Organizer',
    description:
      activity.description?.trim() ||
      'Details for this activity are being updated by the organizer.',
    locationName: locationLabel(activity.location),
    locationAddress: getActivityAddressLine(activity.location) || locationLabel(activity.location),
    summaryDateLabel: formatActivityCardDateLabel(activity.start_time, activity.end_time, {
      includeWeekday: true,
    }),
    dateLabel,
    timeLabel,
    durationLabel: formatHumanDuration(activity.start_time, activity.end_time),
    maxParticipants,
    currentParticipants: null,
    status: toStatus(String(activity.status ?? 'upcoming'), activity.end_time),
    level: 'Open to all levels',
    categories,
    requirements,
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
    return 'accent' as const;
  }
  return 'info' as const;
}

function isActivityRegisterable(status: ViewStatus) {
  return status === 'published';
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

  const [activityLoadState, setActivityLoadState] = useState<ActivityLoadState>('loading');
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [intentNotice, setIntentNotice] = useState<{ action: GuestProtectedAction; message: string } | null>(null);
  const [activity, setActivity] = useState<ActivityDetailViewModel | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
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
  const sessionToken = session?.access_token ?? null;
  const resolvedActivityLoadState: ActivityLoadState = !id ? 'not_found' : !sessionToken ? 'error' : activityLoadState;
  const resolvedLoadErrorMessage = !id ? null : !sessionToken ? 'No active session token.' : loadErrorMessage;
  const resolvedActivity = resolvedActivityLoadState === 'success' ? activity : null;
  const resolvedParticipation = id && sessionToken && canRegister && resolvedActivity ? participation : null;
  const resolvedTimelineLoading = resolvedActivity?.id && sessionToken ? timelineLoading : false;
  const resolvedTimelineError = resolvedActivity?.id ? (sessionToken ? timelineError : 'No active session token.') : null;
  const resolvedTimelineMilestones = resolvedActivity?.id && sessionToken ? timelineMilestones : [];
  const isLoading = resolvedActivityLoadState === 'loading';
  const hasLoadError = resolvedActivityLoadState === 'error';
  const isNotFound = resolvedActivityLoadState === 'not_found';
  const isLoaded = resolvedActivityLoadState === 'success' && Boolean(resolvedActivity);

  const handleRetryLoad = () => {
    setActionError(null);
    setMessage(null);
    setLoadErrorMessage(null);
    setReloadToken((current) => current + 1);
  };

  useEffect(() => {
    if (!id || !sessionToken) {
      return;
    }

    let cancelled = false;
    const loadStateTimeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      setActivityLoadState('loading');
      setLoadErrorMessage(null);
      setActionError(null);
    }, 0);

    void (async () => {
      try {
        const response = await getActivityById(id, sessionToken);
        if (cancelled) {
          return;
        }
        setActivity(mapFromApi(response));
        setActivityLoadState('success');
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        const errorMessage = loadError instanceof Error ? loadError.message : 'Failed to load activity detail.';
        const normalizedMessage = errorMessage.toLowerCase();
        const notFound = normalizedMessage.includes('not found') || normalizedMessage.includes('(404)');
        setActivity(null);
        setLoadErrorMessage(notFound ? null : errorMessage);
        setActivityLoadState(notFound ? 'not_found' : 'error');
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(loadStateTimeoutId);
    };
  }, [id, reloadToken, sessionToken]);

  useEffect(() => {
    if (!id || !sessionToken || !canRegister || !isLoaded) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const rows = await listParticipations({
          accessToken: sessionToken,
          mine: true,
          activityId: id,
          limit: 1,
        });

        if (!cancelled) {
          setParticipation(rows[0] ?? null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setActionError(loadError instanceof Error ? loadError.message : 'Failed to load your registration status.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canRegister, id, isLoaded, sessionToken]);

  useEffect(() => {
    if (!isLoaded || !resolvedActivity?.id || !sessionToken) {
      return;
    }

    let cancelled = false;
    const timelineLoadTimeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      setTimelineLoading(true);
      setTimelineError(null);
    }, 0);

    void listActivityTimeline(resolvedActivity.id, sessionToken)
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
      window.clearTimeout(timelineLoadTimeoutId);
    };
  }, [isLoaded, resolvedActivity?.id, sessionToken]);

  useEffect(() => {
    if (!guestIntent) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIntentNotice({
        action: guestIntent,
        message: getGuestIntentMessage(guestIntent, canRegister),
      });
    }, 0);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete(getGuestIntentParamName());
    setSearchParams(nextParams, { replace: true });

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [canRegister, guestIntent, searchParams, setSearchParams]);

  useEffect(() => {
    if (
      isLoading ||
      hasLoadError ||
      isNotFound ||
      !resolvedActivity ||
      intentNotice?.action !== 'join' ||
      !registrationPanelRef.current
    ) {
      return;
    }

    registrationPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [resolvedActivity, hasLoadError, intentNotice, isLoading, isNotFound]);

  const handleRegistrationNotice = (type: 'success' | 'error', nextMessage: string) => {
    if (type === 'error') {
      setActionError(nextMessage);
      setMessage(null);
      return;
    }

    setMessage(nextMessage);
    setActionError(null);
  };

  const handleShareActivity = async () => {
    if (!resolvedActivity) {
      return;
    }

    const pageUrl = window.location.href;
    const shareData = {
      title: resolvedActivity.title,
      text: `${resolvedActivity.title} - ${resolvedActivity.organization}`,
      url: pageUrl,
    };

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(shareData);
        setMessage('Activity link shared.');
        setActionError(null);
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pageUrl);
        setMessage('Activity link copied to clipboard.');
        setActionError(null);
        return;
      }

      window.open(`mailto:?subject=${encodeURIComponent(resolvedActivity.title)}&body=${encodeURIComponent(pageUrl)}`, '_blank');
      setMessage('Opened email share draft.');
      setActionError(null);
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === 'AbortError') {
        return;
      }
      setMessage(null);
      setActionError(shareError instanceof Error ? shareError.message : 'Unable to share this activity right now.');
    }
  };

  const handleOpenMap = () => {
    if (!resolvedActivity) {
      return;
    }

    if (!resolvedActivity.mapUrl) {
      setMessage(null);
      setActionError('No location data is available to open map.');
      return;
    }

    window.open(resolvedActivity.mapUrl, '_blank', 'noopener,noreferrer');
  };

  const openSlotsLabel = useMemo(() => {
    if (!resolvedActivity) {
      return '--';
    }
    if (resolvedActivity.currentParticipants === null) {
      return `-- / ${resolvedActivity.maxParticipants}`;
    }
    return `${resolvedActivity.currentParticipants} / ${resolvedActivity.maxParticipants}`;
  }, [resolvedActivity]);

  const canSubmitRegistration = canRegister && (resolvedActivity ? isActivityRegisterable(resolvedActivity.status) : false);

  return (
    <VolunteerShell
      activeNav="activities"
      headerActions={
        <div className="activity-detail-head-actions">
          <Button onClick={() => navigate('/volunteer/participation-history')} type="button" variant="secondary">
            Back to History
          </Button>
          <Button
            aria-label="Share activity"
            disabled={!isLoaded}
            onClick={() => void handleShareActivity()}
            type="button"
            variant="secondary"
          >
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
        resolvedActivity
          ? `${resolvedActivity.organization} - ${resolvedActivity.summaryDateLabel}`
          : 'Review the schedule, requirements, and participation details before joining.'
      }
      pageTitle={resolvedActivity?.title ?? 'Activity Details'}
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
        {actionError && <p className="form-error">{actionError}</p>}

        {isLoading && (
          <Card className="activity-detail-state-card">
            <p>Loading activity detail...</p>
          </Card>
        )}

        {hasLoadError && (
          <Card className="activity-detail-state-card">
            <p className="form-error">{resolvedLoadErrorMessage ?? "We couldn't load this activity right now."}</p>
            <div className="activity-detail-state-actions">
              <Button onClick={handleRetryLoad} type="button">
                Retry
              </Button>
              <Button onClick={() => navigate('/browse')} type="button" variant="secondary">
                Back to Browse
              </Button>
            </div>
          </Card>
        )}

        {isNotFound && (
          <Card className="activity-detail-state-card">
            <p>This activity could not be found.</p>
            <div className="activity-detail-state-actions">
              <Button onClick={() => navigate('/browse')} type="button" variant="secondary">
                Back to Browse
              </Button>
            </div>
          </Card>
        )}

        {isLoaded && resolvedActivity && (
          <>
            <div className="activity-detail-grid">
              <Card as="section" className="activity-detail-main">
                <img alt={resolvedActivity.title} className="activity-detail-hero-image" src={resolvedActivity.heroImageUrl} />

                <div className="activity-detail-tags">
                  <Badge className="activity-detail-tag" tone={getStatusTone(resolvedActivity.status)}>
                    {titleCase(resolvedActivity.status)}
                  </Badge>
                  {resolvedActivity.categories.map((category) => (
                    <Badge className="activity-detail-tag" key={category} tone="accent">
                      {category}
                    </Badge>
                  ))}
                </div>

                <h1>{resolvedActivity.title}</h1>

                <article className="activity-detail-organizer-card">
                  <div className="activity-detail-org-avatar" aria-hidden="true">
                    {resolvedActivity.organization.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p>{resolvedActivity.organization}</p>
                    <small>Verified Organizer</small>
                  </div>
                </article>

                <section className="activity-detail-section">
                  <h2>About this activity</h2>
                  <p>{resolvedActivity.description}</p>
                </section>

                <section className="activity-detail-timeline">
                  <div className="activity-detail-section-head">
                    <h2>Event Timeline</h2>
                    <Badge tone="info">Read Only</Badge>
                  </div>
                  <EventTimelineReadOnly
                    emptyDescription="No timeline milestones available yet."
                    milestones={resolvedTimelineMilestones}
                    loading={resolvedTimelineLoading}
                    error={resolvedTimelineError}
                  />
                </section>

                <section className="activity-detail-requirements">
                  <h3>Volunteer Requirements</h3>
                  <div>
                    {resolvedActivity.requirements.map((requirement) => (
                      <Badge className="activity-detail-pill" key={requirement} tone="neutral">
                        {requirement}
                      </Badge>
                    ))}
                  </div>
                </section>

                <div className="activity-detail-stats">
                  <div>
                    <small>Duration</small>
                    <strong>{resolvedActivity.durationLabel}</strong>
                  </div>
                  <div>
                    <small>Open Slots</small>
                    <strong>{openSlotsLabel}</strong>
                  </div>
                  <div>
                    <small>Level</small>
                    <strong>{resolvedActivity.level}</strong>
                  </div>
                </div>
              </Card>

              <aside className="activity-detail-aside">
                <Card as="article" className="activity-detail-side-card">
                  <div className="activity-detail-side-block">
                    <small>
                      <CalendarClock className="activity-detail-side-icon" /> Date &amp; Time
                    </small>
                    <strong>{resolvedActivity.dateLabel}</strong>
                    <p>{resolvedActivity.timeLabel}</p>
                  </div>

                  <div className="activity-detail-side-block">
                    <small>
                      <MapPin className="activity-detail-side-icon" /> Location
                    </small>
                    <strong>{resolvedActivity.locationName}</strong>
                    <p>{resolvedActivity.locationAddress}</p>
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
                        +{resolvedActivity.currentParticipants === null ? '--' : Math.max(resolvedActivity.currentParticipants - 4, 0)}
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
                      activityId={resolvedActivity.id}
                      canRegister={canSubmitRegistration}
                      className="activity-detail-registration-action"
                      recommendationItemId={recommendationItemIdFromQuery}
                      currentStatus={resolvedParticipation?.status ?? 'none'}
                      confirmCancelMessage={
                        resolvedParticipation?.status?.toLowerCase() === 'assigned'
                          ? 'Decline this assignment?'
                          : 'Cancel this registration for the activity?'
                      }
                      registerDisabledLabel={canRegister ? 'Registration closed' : 'Volunteer only'}
                      onAccept={async ({ participationId }) => {
                        if (!session?.access_token) {
                          throw new Error('No active session token.');
                        }
                        if (!participationId) {
                          throw new Error('Missing participation id for assignment response.');
                        }

                        const result = await respondToAssignedParticipation(participationId, 'accept', session.access_token);
                        setParticipation(result.registration);
                      }}
                      onCancel={async ({ activityId }) => {
                        if (!session?.access_token) {
                          throw new Error('No active session token.');
                        }

                        if (resolvedParticipation?.status?.toLowerCase() === 'assigned' && resolvedParticipation.participationId) {
                          const result = await respondToAssignedParticipation(
                            resolvedParticipation.participationId,
                            'decline',
                            session.access_token
                          );
                          setParticipation(result.registration);
                          return;
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
                    address={resolvedActivity.locationAddress || resolvedActivity.locationName}
                    compact
                    coordinates={resolvedActivity.locationCoordinates}
                    emptyMessage="The organizer has not saved map coordinates for this activity yet. You can still open the address in your maps app."
                    emptyTitle="Live map preview is not available"
                    interactive
                    title={resolvedActivity.title}
                  />
                  <Button
                    className="activity-detail-map-btn"
                    disabled={!resolvedActivity.mapUrl}
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

