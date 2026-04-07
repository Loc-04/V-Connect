import { ArrowRight, Bell, BriefcaseBusiness, CalendarClock, CheckCircle2, Compass } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { RegistrationAction } from '../components/activities/RegistrationAction';
import { Badge, Button, Card } from '../components/ui';
import { VolunteerShell } from '../layouts/VolunteerShell';
import { getNotifications, type NotificationEntry } from '../lib/notifications';
import { listParticipations } from '../lib/participations';
import { getProfileMe } from '../lib/profile';
import { getRecommendedActivitiesForVolunteer } from '../lib/recommendations';
import type { ParticipationRecord } from '../types/participation';
import type { ProfileMeResponse } from '../types/profile';
import type { RecommendedActivityRecord } from '../types/recommendation';
import './VolunteerHomePage.css';

function formatDateLabel(value: string | null | undefined) {
  if (!value) {
    return 'Date TBD';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date TBD';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Schedule TBD';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Schedule TBD';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeAgo(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return '--';
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'Just now';
  }
  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}m ago`;
  }
  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h ago`;
  }
  return `${Math.floor(diffMs / day)}d ago`;
}

export function VolunteerHomePage() {
  const navigate = useNavigate();
  const { profile, session } = useAuth();
  const accessToken = session?.access_token ?? '';
  const volunteerId = profile?.id ?? '';
  const hasSession = Boolean(accessToken && volunteerId);

  const [loading, setLoading] = useState(hasSession);
  const [profileData, setProfileData] = useState<ProfileMeResponse | null>(null);
  const [participations, setParticipations] = useState<ParticipationRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedActivityRecord[]>([]);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [participationError, setParticipationError] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSession) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setProfileError(null);
      setParticipationError(null);
      setNotificationError(null);
      setRecommendationError(null);

      const [profileResult, participationResult, notificationResult, recommendationResult] = await Promise.allSettled([
        getProfileMe(accessToken),
        listParticipations(accessToken),
        getNotifications(accessToken, false, 8),
        getRecommendedActivitiesForVolunteer(volunteerId, accessToken, 4),
      ]);

      if (cancelled) {
        return;
      }

      if (profileResult.status === 'fulfilled') {
        setProfileData(profileResult.value);
      } else {
        setProfileData(null);
        setProfileError(profileResult.reason instanceof Error ? profileResult.reason.message : 'Failed to load profile summary.');
      }

      if (participationResult.status === 'fulfilled') {
        setParticipations(participationResult.value);
      } else {
        setParticipations([]);
        setParticipationError(
          participationResult.reason instanceof Error
            ? participationResult.reason.message
            : 'Failed to load participation history.'
        );
      }

      if (notificationResult.status === 'fulfilled') {
        setNotifications(notificationResult.value);
      } else {
        setNotifications([]);
        setNotificationError(
          notificationResult.reason instanceof Error
            ? notificationResult.reason.message
            : 'Failed to load recent notifications.'
        );
      }

      if (recommendationResult.status === 'fulfilled') {
        setRecommendations(recommendationResult.value);
      } else {
        setRecommendations([]);
        setRecommendationError(
          recommendationResult.reason instanceof Error
            ? recommendationResult.reason.message
            : 'Failed to load recommendations.'
        );
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, hasSession, volunteerId]);

  const displayName = profileData?.profile?.full_name?.trim() || profile?.full_name?.trim() || 'Volunteer';
  const volunteerProfile = profileData?.volunteerProfile;
  const registeredActivities = participations.length;
  const upcomingActivities = participations.filter((record) => record.status === 'upcoming');
  const completedActivities = participations.filter((record) => record.status === 'completed');
  const unreadNotifications = notifications.filter((notification) => !notification.read);
  const recentNotifications = notifications.slice(0, 4);
  const recentHistory = participations.slice(0, 4);
  const recommendationPreview = recommendations.slice(0, 3);

  const readinessSummary = useMemo(() => {
    const skillCount = volunteerProfile?.skills?.length ?? 0;
    const interestCount = volunteerProfile?.interests?.length ?? 0;
    if (skillCount === 0 && interestCount === 0) {
      return 'Add skills and interests to unlock stronger recommendations.';
    }
    return `${skillCount} skills and ${interestCount} interests currently inform your volunteer fit.`;
  }, [volunteerProfile?.interests?.length, volunteerProfile?.skills?.length]);

  return (
    <VolunteerShell
      activeNav="dashboard"
      headerActions={
        <Button onClick={() => navigate('/browse')} type="button" variant="secondary">
          <Compass size={16} />
          <span>Browse Activities</span>
        </Button>
      }
      pageEyebrow="Volunteer Workspace"
      pageSubtitle="Keep track of what you joined, what is coming up next, and where the platform sees your best fit."
      pageTitle="Dashboard"
      showSearch={false}
    >
      <section className="vol-home-dashboard">
        {!hasSession ? <p className="form-error">No active volunteer session.</p> : null}

        <div className="vol-home-hero-grid">
          <Card as="section" className="vol-home-hero-card">
            <div className="vol-home-hero-copy">
              <Badge className="vol-home-hero-badge" tone="info">
                Welcome back
              </Badge>
              <h2>{displayName}</h2>
              <p>{readinessSummary}</p>
            </div>

            <div className="vol-home-hero-meta">
              <div>
                <small>Member since</small>
                <strong>{formatDateLabel(profileData?.profile?.created_at ?? profile?.created_at)}</strong>
              </div>
              <div>
                <small>Hours tracked</small>
                <strong>{volunteerProfile?.total_hours ?? 0}</strong>
              </div>
            </div>
          </Card>

          <Card as="section" className="vol-home-action-card">
            <div className="vol-home-section-head">
              <div>
                <h3>Quick actions</h3>
                <p>Jump straight into the most useful volunteer flows.</p>
              </div>
            </div>

            <div className="vol-home-action-list">
              <Button onClick={() => navigate('/browse')} type="button" variant="primary">
                Browse Activities
              </Button>
              <Button onClick={() => navigate('/volunteer/ai-recommended-activities')} type="button" variant="secondary">
                View Recommendations
              </Button>
              <Button onClick={() => navigate('/volunteer/participation-history')} type="button" variant="secondary">
                Participation History
              </Button>
              <Button onClick={() => navigate('/volunteer/profile-ui')} type="button" variant="secondary">
                Profile
              </Button>
            </div>
          </Card>
        </div>

        <div className="vol-home-stats-grid">
          <Card as="article" className="vol-home-stat-card">
            <span className="vol-home-stat-icon accent" aria-hidden="true">
              <BriefcaseBusiness size={17} />
            </span>
            <div>
              <small>Registered activities</small>
              <strong>{loading ? '--' : registeredActivities}</strong>
            </div>
          </Card>

          <Card as="article" className="vol-home-stat-card">
            <span className="vol-home-stat-icon info" aria-hidden="true">
              <CalendarClock size={17} />
            </span>
            <div>
              <small>Upcoming activities</small>
              <strong>{loading ? '--' : upcomingActivities.length}</strong>
            </div>
          </Card>

          <Card as="article" className="vol-home-stat-card">
            <span className="vol-home-stat-icon success" aria-hidden="true">
              <CheckCircle2 size={17} />
            </span>
            <div>
              <small>Completed participations</small>
              <strong>{loading ? '--' : completedActivities.length}</strong>
            </div>
          </Card>

          <Card as="article" className="vol-home-stat-card">
            <span className="vol-home-stat-icon neutral" aria-hidden="true">
              <Bell size={17} />
            </span>
            <div>
              <small>Unread notifications</small>
              <strong>{loading ? '--' : unreadNotifications.length}</strong>
            </div>
          </Card>
        </div>

        <div className="vol-home-panels-grid">
          <Card as="section" className="vol-home-panel vol-home-panel-wide">
            <div className="vol-home-section-head">
              <div>
                <h3>Recommendations preview</h3>
                <p>Suggested activities based on your current profile and signals.</p>
              </div>
              <button className="vol-home-link-btn" onClick={() => navigate('/volunteer/ai-recommended-activities')} type="button">
                View all <ArrowRight size={14} />
              </button>
            </div>

            {loading ? <p className="muted">Loading recommendations...</p> : null}
            {!loading && recommendationError ? <p className="form-error">{recommendationError}</p> : null}
            {!loading && !recommendationError && recommendationPreview.length === 0 ? (
              <div className="vol-home-empty-state">
                <p>No recommendations available yet.</p>
                <small>Complete your profile or browse activities directly while the system gathers stronger signals.</small>
              </div>
            ) : null}

            {!loading && !recommendationError && recommendationPreview.length > 0 ? (
              <div className="vol-home-recommendation-list">
                {recommendationPreview.map((item) => (
                  <article className="vol-home-recommendation-card" key={item.activityId}>
                    <div className="vol-home-recommendation-head">
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.organizerName}</p>
                      </div>
                      <Badge tone="accent">{Math.round(item.matchScore)}% match</Badge>
                    </div>
                    <p className="vol-home-recommendation-copy">{item.explanation}</p>
                    <div className="vol-home-recommendation-meta">
                      <span>{formatDateTime(item.startTime)}</span>
                      <button
                        className="vol-home-link-btn"
                        onClick={() => navigate(`/volunteer/activity/${item.activityId}`)}
                        type="button"
                      >
                        View details
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </Card>

          <Card as="section" className="vol-home-panel">
            <div className="vol-home-section-head">
              <div>
                <h3>Recent notifications</h3>
                <p>Keep an eye on the latest updates tied to your account.</p>
              </div>
              <button className="vol-home-link-btn" onClick={() => navigate('/volunteer/notifications')} type="button">
                View all
              </button>
            </div>

            {loading ? <p className="muted">Loading notifications...</p> : null}
            {!loading && notificationError ? <p className="form-error">{notificationError}</p> : null}
            {!loading && !notificationError && recentNotifications.length === 0 ? (
              <div className="vol-home-empty-state">
                <p>No notifications yet.</p>
                <small>Updates about registrations, approvals, and attendance will appear here.</small>
              </div>
            ) : null}

            {!loading && !notificationError && recentNotifications.length > 0 ? (
              <div className="vol-home-notification-list">
                {recentNotifications.map((notification) => (
                  <article className="vol-home-notification-item" key={notification.id}>
                    <div>
                      <strong>{notification.title}</strong>
                      <p>{notification.description}</p>
                    </div>
                    <span>{formatTimeAgo(notification.timestamp)}</span>
                  </article>
                ))}
              </div>
            ) : null}
          </Card>

          <Card as="section" className="vol-home-panel">
            <div className="vol-home-section-head">
              <div>
                <h3>Upcoming activities</h3>
                <p>Your nearest commitments based on participation history.</p>
              </div>
              <button className="vol-home-link-btn" onClick={() => navigate('/volunteer/participation-history')} type="button">
                View history
              </button>
            </div>

            {loading ? <p className="muted">Loading upcoming activities...</p> : null}
            {!loading && participationError ? <p className="form-error">{participationError}</p> : null}
            {!loading && !participationError && upcomingActivities.length === 0 ? (
              <div className="vol-home-empty-state">
                <p>No upcoming activities right now.</p>
                <small>Browse opportunities to find your next contribution.</small>
              </div>
            ) : null}

            {!loading && !participationError && upcomingActivities.length > 0 ? (
              <div className="vol-home-upcoming-list">
                {upcomingActivities.slice(0, 3).map((record) => (
                  <article className="vol-home-upcoming-item" key={record.participationId}>
                    <div>
                      <strong>{record.activityName}</strong>
                      <p>{record.organization}</p>
                    </div>
                    <div className="vol-home-upcoming-meta">
                      <span>{formatDateTime(record.date)}</span>
                      <RegistrationAction activityId={record.activityId ?? record.id} currentStatus={record.status} mode="badge" />
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </Card>

          <Card as="section" className="vol-home-panel vol-home-panel-wide">
            <div className="vol-home-section-head">
              <div>
                <h3>Participation history preview</h3>
                <p>Recent records from your volunteer participation timeline.</p>
              </div>
              <button className="vol-home-link-btn" onClick={() => navigate('/volunteer/participation-history')} type="button">
                Open full history
              </button>
            </div>

            {loading ? <p className="muted">Loading participation history...</p> : null}
            {!loading && participationError ? <p className="form-error">{participationError}</p> : null}
            {!loading && !participationError && recentHistory.length === 0 ? (
              <div className="vol-home-empty-state">
                <p>No participation records yet.</p>
                <small>Once you register for activities, your recent timeline will appear here.</small>
              </div>
            ) : null}

            {!loading && !participationError && recentHistory.length > 0 ? (
              <div className="vol-home-history-table">
                {recentHistory.map((record) => (
                  <article className="vol-home-history-row" key={record.participationId}>
                    <div className="vol-home-history-main">
                      <strong>{record.activityName}</strong>
                      <p>{record.organization}</p>
                    </div>
                    <span className="vol-home-history-date">{formatDateLabel(record.date)}</span>
                    <div className="vol-home-history-status">
                      <RegistrationAction activityId={record.activityId ?? record.id} currentStatus={record.status} mode="badge" />
                    </div>
                    <Button
                      disabled={record.activityDeleted || !record.activityId}
                      onClick={() => navigate(`/volunteer/activity/${record.activityId ?? record.id}`)}
                      type="button"
                      variant="secondary"
                    >
                      {record.activityDeleted ? 'Unavailable' : 'View Details'}
                    </Button>
                  </article>
                ))}
              </div>
            ) : null}
          </Card>

          {profileError ? (
            <Card as="section" className="vol-home-panel vol-home-profile-warning">
              <div className="vol-home-section-head">
                <div>
                  <h3>Profile summary</h3>
                  <p>Profile-specific enrichment could not be loaded.</p>
                </div>
                <button className="vol-home-link-btn" onClick={() => navigate('/volunteer/profile-ui')} type="button">
                  Open profile
                </button>
              </div>
              <p className="form-error">{profileError}</p>
            </Card>
          ) : null}
        </div>
      </section>
    </VolunteerShell>
  );
}
