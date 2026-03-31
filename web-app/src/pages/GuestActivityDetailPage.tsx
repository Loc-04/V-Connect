import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, Heart, MapPin, Share2, Users } from 'lucide-react';

import { AuthRequiredModal } from '../components/auth/AuthRequiredModal';
import { Badge, Button, Card } from '../components/ui';
import { GuestShell } from '../layouts/GuestShell';
import { getGuestActivityById, type GuestActivityStatus } from '../lib/guestActivities';
import './ActivityDetailPage.css';
import './GuestActivityDetailPage.css';

const PARTICIPANT_AVATARS = [
  'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=150',
  'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=150',
  'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=150',
  'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150',
];

function getStatusTone(status: GuestActivityStatus) {
  if (status === 'completed') {
    return 'success' as const;
  }
  if (status === 'cancelled') {
    return 'danger' as const;
  }
  return 'accent' as const;
}

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
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

function toHours(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return Math.max(0, Number(diff.toFixed(1)));
}

export function GuestActivityDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const activity = useMemo(() => (id ? getGuestActivityById(id) : null), [id]);

  if (!activity) {
    return (
      <GuestShell
        activeNav="browse"
        pageSubtitle="This activity does not exist in the current guest dataset."
        pageTitle="View Details"
      >
        <section className="activity-detail-page">
          <Card className="activity-detail-state-card">
            <p className="form-error">Activity not found.</p>
            <Button onClick={() => navigate('/guest/browse')} type="button" variant="secondary">
              Back to Activities
            </Button>
          </Card>
        </section>
      </GuestShell>
    );
  }

  const { dateLabel, timeLabel } = formatDateAndTime(activity.startTime, activity.endTime);
  const openSlotsLabel = `${activity.currentParticipants} / ${activity.capacity}`;

  return (
    <GuestShell
      activeNav="browse"
      headerActions={
        <div className="activity-detail-head-actions">
          <Button onClick={() => navigate('/guest/browse')} type="button" variant="secondary">
            Back to Activities
          </Button>
          <Button
            aria-label="Share activity"
            onClick={() => setShowAuthModal(true)}
            type="button"
            variant="secondary"
          >
            <Share2 size={16} />
          </Button>
          <Button
            aria-label="Save activity"
            onClick={() => setShowAuthModal(true)}
            type="button"
            variant="secondary"
          >
            <Heart size={16} />
          </Button>
        </div>
      }
      pageSubtitle={`${activity.organization} - ${dateLabel}`}
      pageTitle="View Details"
    >
      <section className="activity-detail-page">
        <p className="guest-activity-note muted">You are viewing a read-only public activity detail.</p>

        <div className="activity-detail-grid">
          <Card as="section" className="activity-detail-main">
            <img alt={activity.title} className="activity-detail-hero-image" src={activity.imageUrl} />

            <div className="activity-detail-tags">
              <Badge className="activity-detail-tag" tone={getStatusTone(activity.status)}>
                {titleCase(activity.status)}
              </Badge>
              {activity.requiredSkills.slice(0, 2).map((skill) => (
                <Badge className="activity-detail-tag" key={skill} tone="accent">
                  {skill}
                </Badge>
              ))}
            </div>

            <h1>{activity.title}</h1>

            <article className="activity-detail-organizer-card">
              <div aria-hidden="true" className="activity-detail-org-avatar">
                {activity.organization.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <p>{activity.organization}</p>
                <small>Community Organizer</small>
              </div>
              <Button onClick={() => setShowAuthModal(true)} type="button" variant="secondary">
                Follow
              </Button>
            </article>

            <section className="activity-detail-section">
              <h2>About this activity</h2>
              <p>{activity.description}</p>
            </section>

            <section className="activity-detail-requirements">
              <h3>Volunteer Requirements</h3>
              <div>
                {activity.requiredSkills.length === 0 ? (
                  <Badge className="activity-detail-pill" tone="neutral">
                    Open for everyone
                  </Badge>
                ) : (
                  activity.requiredSkills.map((requirement) => (
                    <Badge className="activity-detail-pill" key={requirement} tone="neutral">
                      {requirement}
                    </Badge>
                  ))
                )}
              </div>
            </section>

            <div className="activity-detail-stats">
              <div>
                <small>Duration</small>
                <strong>{toHours(activity.startTime, activity.endTime)} Hours</strong>
              </div>
              <div>
                <small>Open Slots</small>
                <strong>{openSlotsLabel}</strong>
              </div>
              <div>
                <small>Mode</small>
                <strong>Guest Read-only</strong>
              </div>
            </div>
          </Card>

          <aside className="activity-detail-aside">
            <Card as="article" className="activity-detail-side-card">
              <div className="activity-detail-side-block">
                <small>
                  <CalendarClock className="activity-detail-side-icon" /> Date &amp; Time
                </small>
                <strong>{dateLabel}</strong>
                <p>{timeLabel}</p>
              </div>

              <div className="activity-detail-side-block">
                <small>
                  <MapPin className="activity-detail-side-icon" /> Location
                </small>
                <strong>{activity.location.address}</strong>
                <p>{activity.location.city}</p>
              </div>

              <div className="activity-detail-side-block">
                <small>
                  <Users className="activity-detail-side-icon" /> Current Participants
                </small>
                <div className="activity-detail-avatars">
                  {PARTICIPANT_AVATARS.map((avatar) => (
                    <img alt="" key={avatar} src={avatar} />
                  ))}
                  <span>+{Math.max(activity.currentParticipants - 4, 0)}</span>
                </div>
              </div>

              <Button className="guest-activity-join-btn" onClick={() => setShowAuthModal(true)} type="button">
                Join Activity
              </Button>
              <small className="activity-detail-guideline">
                Sign in or create an account to join this activity.
              </small>
            </Card>

            <Card as="article" className="activity-detail-map-card">
              <img alt="Activity location map" src={activity.mapImageUrl} />
              <Button className="activity-detail-map-btn" onClick={() => setShowAuthModal(true)} type="button" variant="secondary">
                Open in Map
              </Button>
            </Card>
          </aside>
        </div>
      </section>

      <AuthRequiredModal intent="register" onClose={() => setShowAuthModal(false)} open={showAuthModal} />
    </GuestShell>
  );
}
