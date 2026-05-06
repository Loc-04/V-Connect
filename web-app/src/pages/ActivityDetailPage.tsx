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
import { getGuestIntentParamName, readGuestIntent, type GuestProtectedAction } from '../lib/guestAuth';
import {
  useActivityTimelineQuery,
  useActivityViewerContextQuery,
  useRegistrationMutations,
  type ActivityViewerPersonSummary,
} from '../lib/queries';
import type { ActivityRecord } from '../types/activity';
import type { TimelineMilestone } from '../types/timeline';
import './ActivityDetailPage.css';

type ViewStatus = 'completed' | 'upcoming' | 'cancelled' | 'published' | 'expired';
interface ActivityDetailViewModel {
  id: string;
  title: string;
  organization: string;
  organizationAvatarUrl: string | null;
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
  participantPreview: ActivityViewerPersonSummary[];
}

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

function mapFromApi(
  activity: ActivityRecord,
  options: {
    organizationName?: string | null;
    organizationAvatarUrl?: string | null;
    currentParticipants?: number | null;
    participantPreview?: ActivityViewerPersonSummary[];
  } = {}
): ActivityDetailViewModel {
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
    organization: String(options.organizationName ?? '').trim() || 'Community Organizer',
    organizationAvatarUrl: String(options.organizationAvatarUrl ?? '').trim() || null,
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
    currentParticipants:
      typeof options.currentParticipants === 'number' && Number.isFinite(options.currentParticipants)
        ? Math.max(0, Math.trunc(options.currentParticipants))
        : null,
    status: toStatus(String(activity.status ?? 'upcoming'), activity.end_time),
    level: 'Open to all levels',
    categories,
    requirements,
    heroImageUrl: String(activity.cover_image_url ?? '').trim(),
    locationCoordinates: getActivityCoordinates(activity.location),
    mapUrl: buildActivityMapUrl(activity.location),
    participantPreview: Array.isArray(options.participantPreview) ? options.participantPreview : [],
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

  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [intentNotice, setIntentNotice] = useState<{ action: GuestProtectedAction; message: string } | null>(null);
  const registrationPanelRef = useRef<HTMLDivElement | null>(null);
  const canRegister = profile?.role === 'volunteer';
  const userId = profile?.id ?? null;
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
  const viewerContextQuery = useActivityViewerContextQuery(sessionToken, id ?? null);
  const timelineQuery = useActivityTimelineQuery(sessionToken, id ?? null);
  const { registerMutation, cancelMutation, respondMutation } = useRegistrationMutations(sessionToken, userId);

  const resolvedActivity = useMemo(() => {
    const viewerData = viewerContextQuery.data;
    if (!viewerData?.activity) {
      return null;
    }

    return mapFromApi(viewerData.activity, {
      organizationName: viewerData.organizer?.fullName,
      organizationAvatarUrl: viewerData.organizer?.avatarUrl,
      currentParticipants: viewerData.currentParticipants,
      participantPreview: viewerData.participantPreview,
    });
  }, [viewerContextQuery.data]);
  const resolvedParticipation = useMemo(() => {
    if (!id || !canRegister) {
      return null;
    }
    return viewerContextQuery.data?.participation ?? null;
  }, [canRegister, id, viewerContextQuery.data]);
  const resolvedParticipationId = resolvedParticipation?.participationId ?? resolvedParticipation?.id ?? null;
  const resolvedTimelineMilestones: TimelineMilestone[] = timelineQuery.data?.milestones ?? [];
  const isLoading = Boolean(id && sessionToken && viewerContextQuery.isLoading);
  const hasLoadError = Boolean(viewerContextQuery.isError);
  const isNotFound =
    !id ||
    (hasLoadError &&
      String(viewerContextQuery.error instanceof Error ? viewerContextQuery.error.message : '').toLowerCase().includes('not found'));
  const showLoadError = hasLoadError && !isNotFound;
  const isLoaded = Boolean(resolvedActivity);
  const resolvedLoadErrorMessage =
    viewerContextQuery.error instanceof Error ? viewerContextQuery.error.message : !sessionToken ? 'No active session token.' : null;
  const resolvedTimelineLoading = Boolean(isLoaded && timelineQuery.isLoading);
  const resolvedTimelineError = timelineQuery.error instanceof Error ? timelineQuery.error.message : null;
  const isRegistrationMutating = Boolean(
    registerMutation.isPending || cancelMutation.isPending || respondMutation.isPending
  );
  const participationStatusLoading = Boolean(canRegister && isLoaded && (viewerContextQuery.isLoading || isRegistrationMutating));

  const handleRetryLoad = () => {
    setActionError(null);
    setMessage(null);
    void viewerContextQuery.refetch();
    void timelineQuery.refetch();
  };

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

        {showLoadError && (
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
                  {resolvedActivity.organizationAvatarUrl ? (
                    <img
                      alt={resolvedActivity.organization}
                      className="activity-detail-org-avatar-img"
                      src={resolvedActivity.organizationAvatarUrl}
                    />
                  ) : (
                    <div className="activity-detail-org-avatar" aria-hidden="true">
                      {resolvedActivity.organization.slice(0, 1).toUpperCase()}
                    </div>
                  )}
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
                      {resolvedActivity.participantPreview.map((participant) =>
                        participant.avatarUrl ? (
                          <img alt={participant.fullName} key={participant.id} src={participant.avatarUrl} />
                        ) : (
                          <span key={participant.id} title={participant.fullName}>
                            {participant.fullName.slice(0, 1).toUpperCase()}
                          </span>
                        )
                      )}
                      {resolvedActivity.currentParticipants === null ? (
                        <span>--</span>
                      ) : resolvedActivity.currentParticipants > resolvedActivity.participantPreview.length ? (
                        <span>+{resolvedActivity.currentParticipants - resolvedActivity.participantPreview.length}</span>
                      ) : null}
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
                      disabled={isRegistrationMutating}
                      recommendationItemId={recommendationItemIdFromQuery}
                      currentStatus={resolvedParticipation?.status ?? 'none'}
                      participationId={resolvedParticipationId}
                      statusLoading={participationStatusLoading}
                      confirmCancelMessage={
                        resolvedParticipation?.status?.toLowerCase() === 'assigned'
                          ? 'Decline this assignment?'
                          : 'Cancel this registration for the activity?'
                      }
                      registerDisabledLabel={canRegister ? 'Registration closed' : 'Volunteer only'}
                      onAccept={async ({ activityId, participationId }) => {
                        const targetParticipationId = participationId ?? resolvedParticipationId;
                        if (!targetParticipationId) {
                          await viewerContextQuery.refetch();
                          throw new Error('Unable to process assignment right now. Please refresh and try again.');
                        }

                        await respondMutation.mutateAsync({
                          participationId: targetParticipationId,
                          decision: 'accept',
                          activityId,
                        });
                      }}
                      onCancel={async ({ activityId, participationId }) => {
                        const targetParticipationId = participationId ?? resolvedParticipationId;
                        if (resolvedParticipation?.status?.toLowerCase() === 'assigned' && targetParticipationId) {
                          await respondMutation.mutateAsync({
                            participationId: targetParticipationId,
                            decision: 'decline',
                            activityId,
                          });
                          return;
                        }

                        await cancelMutation.mutateAsync({ activityId });
                      }}
                      onNotice={handleRegistrationNotice}
                      onRegister={async ({ activityId, recommendationItemId }) => {
                        const result = await registerMutation.mutateAsync({
                          activityId,
                          recommendationItemId,
                        });
                        return result.participation;
                      }}
                      onRegistered={() => {
                        void viewerContextQuery.refetch();
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

