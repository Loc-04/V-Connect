import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Heart, MapPin, Share2, Sparkles, Star } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { AuthRequiredModal } from '../components/auth/AuthRequiredModal';
import { GuestFooter } from '../components/guest';
import { Badge, Button, Card } from '../components/ui';
import { buildGuestActivityIntentPath, readGuestIntent, type GuestProtectedAction } from '../lib/guestAuth';
import { getGuestActivityById, getGuestAvailabilityMeta } from '../lib/guestActivities';
import { GuestShell } from '../layouts/GuestShell';
import './GuestActivityDetailPage.css';

function formatDateAndTime(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { dateLabel: 'Date TBD', timeLabel: 'Time TBD' };
  }

  return {
    dateLabel: start.toLocaleDateString(undefined, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }),
    timeLabel: `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`,
  };
}

export function GuestActivityDetailPage() {
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [authPrompt, setAuthPrompt] = useState<GuestProtectedAction | null>(null);
  const activity = useMemo(() => (id ? getGuestActivityById(id) : null), [id]);
  const guestIntent = readGuestIntent(searchParams.get('guestIntent'));

  useEffect(() => {
    if (!activity || !session || !profile || !guestIntent) {
      return;
    }

    navigate(`/volunteer/activity/${activity.id}?guestIntent=${guestIntent}`, { replace: true });
  }, [activity, guestIntent, navigate, profile, session]);

  if (!activity) {
    return (
      <GuestShell activeNav="browse">
        <section className="guest-activity-state">
          <Card className="guest-activity-state-card">
            <p className="form-error">This public activity could not be found.</p>
            <Button onClick={() => navigate('/guest/browse')} type="button" variant="secondary">
              Back to Browse Activities
            </Button>
          </Card>
        </section>
        <GuestFooter />
      </GuestShell>
    );
  }

  const availability = getGuestAvailabilityMeta(activity);
  const { dateLabel, timeLabel } = formatDateAndTime(activity.startTime, activity.endTime);

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/guest/activity/${activity.id}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: activity.title, text: activity.cardSummary, url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setShareNotice('Share link ready.');
    } catch {
      setShareNotice('Sharing was cancelled or is not available in this browser.');
    }
  };

  return (
    <GuestShell activeNav="browse">
      <section className="guest-detail-page">
        <div className="guest-detail-hero">
          <img alt={activity.title} className="guest-detail-hero-image" src={activity.imageUrl} />
          <div className="guest-detail-hero-overlay">
            <div className="guest-detail-hero-badges">
              <Badge className="guest-detail-hero-badge" tone="success">
                {activity.domain}
              </Badge>
              <Badge className={`guest-detail-hero-badge is-${availability.tone}`} tone={availability.badgeTone}>
                {availability.label}
              </Badge>
            </div>
            <div>
              <h1>{activity.title}</h1>
              <p>
                <CalendarClock size={16} /> {dateLabel} - {timeLabel}
              </p>
              <p>
                <MapPin size={16} /> {activity.location.address}, {activity.location.city}
              </p>
            </div>
          </div>
        </div>

        {shareNotice ? <p className="form-success">{shareNotice}</p> : null}

        <div className="guest-detail-grid">
          <div className="guest-detail-main-column">
            <Card as="section" className="guest-detail-about-card">
              <h2>About this activity</h2>
              <p>{activity.description}</p>

              <div className="guest-detail-stat-grid">
                {activity.stats.map((stat) => (
                  <div className="guest-detail-stat-card" key={stat.label}>
                    <small>{stat.label}</small>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>
            </Card>

            <section className="guest-detail-requirements-section">
              <h2>Requirements</h2>
              <div className="guest-detail-requirements-grid">
                {activity.requirements.map((requirement) => (
                  <Card as="article" className="guest-detail-requirement-card" key={requirement.title}>
                    <strong>{requirement.title}</strong>
                    <p>{requirement.description}</p>
                  </Card>
                ))}
              </div>
            </section>

            <section className="guest-detail-location-section">
              <h2>Location</h2>
              <Card as="article" className="guest-detail-map-card">
                <img alt={`${activity.title} map`} className="guest-detail-map-image" src={activity.mapImageUrl} />
                <div className="guest-detail-map-pin">
                  <MapPin size={16} />
                </div>
                <div className="guest-detail-map-label">
                  <span>Meeting Point</span>
                  <strong>{activity.location.meetingPoint}</strong>
                </div>
              </Card>
            </section>
          </div>

          <aside className="guest-detail-side-column">
            <Card as="section" className="guest-detail-cta-card">
              <div className="guest-detail-cta-top">
                <div>
                  <small>Status</small>
                  <Badge className={`guest-detail-status-badge is-${availability.tone}`} tone={availability.badgeTone}>
                    {availability.label}
                  </Badge>
                </div>
                <div>
                  <small>Open Slots</small>
                  <strong>
                    {Math.max(activity.capacity - activity.currentParticipants, 0)} / {activity.capacity}
                  </strong>
                </div>
              </div>

              <Button onClick={() => setAuthPrompt('join')} type="button">
                Join Activity
              </Button>

              <div className="guest-detail-side-actions">
                <Button onClick={() => setAuthPrompt('save')} type="button" variant="secondary">
                  <Heart size={15} />
                  <span>Save</span>
                </Button>
                <Button onClick={() => setAuthPrompt('ai_match')} type="button" variant="secondary">
                  <Sparkles size={15} />
                  <span>AI Match</span>
                </Button>
              </div>
            </Card>

            <Card as="section" className="guest-detail-organizer-card">
              <p className="guest-detail-side-label">Organizer</p>
              <div className="guest-detail-organizer-head">
                <img alt={activity.organizerName} src={activity.organizerAvatarUrl} />
                <div>
                  <strong>{activity.organizerName}</strong>
                  <p>{activity.organizerTitle}</p>
                </div>
              </div>
              <div className="guest-detail-organizer-rating">
                <span>
                  <Star size={14} />
                  {activity.organizerRating.toFixed(1)} rating
                </span>
              </div>
              <p className="guest-detail-organizer-note">{activity.organizerNote}</p>
              <Button onClick={() => setAuthPrompt('contact')} type="button" variant="secondary">
                Contact Organizer
              </Button>
            </Card>

            <Card as="section" className="guest-detail-share-card">
              <p className="guest-detail-side-label">Share this activity</p>
              <Button onClick={() => void handleShare()} type="button" variant="secondary">
                <Share2 size={15} />
                <span>Share Activity</span>
              </Button>
            </Card>
          </aside>
        </div>
      </section>

      <GuestFooter />

      <AuthRequiredModal
        action={authPrompt ?? undefined}
        nextPath={buildGuestActivityIntentPath(activity.id, authPrompt ?? 'join')}
        onClose={() => setAuthPrompt(null)}
        open={Boolean(authPrompt)}
      />
    </GuestShell>
  );
}
