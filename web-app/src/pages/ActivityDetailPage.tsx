import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, Heart, MapPin, Share2, Users } from 'lucide-react';

import { useAuth } from '../auth/useAuth';
import { getActivityById } from '../lib/activities';
import { getMockActivityDetailById } from '../lib/participationMocks';
import type { ActivityDetailMock } from '../lib/participationMocks';
import type { ActivityRecord } from '../types/activity';
import './ActivityDetailPage.css';

type ViewStatus = 'completed' | 'upcoming' | 'cancelled' | 'published';

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
  heroImageUrl: string;
  mapImageUrl: string;
}

const FALLBACK_HERO_IMAGES = [
  'https://images.pexels.com/photos/7656740/pexels-photo-7656740.jpeg?auto=compress&cs=tinysrgb&w=1400',
  'https://images.pexels.com/photos/6646918/pexels-photo-6646918.jpeg?auto=compress&cs=tinysrgb&w=1400',
  'https://images.pexels.com/photos/6647043/pexels-photo-6647043.jpeg?auto=compress&cs=tinysrgb&w=1400',
  'https://images.pexels.com/photos/5731866/pexels-photo-5731866.jpeg?auto=compress&cs=tinysrgb&w=1400',
];

const FALLBACK_MAP_IMAGE =
  'https://staticmap.openstreetmap.de/staticmap.php?center=30.2672,-97.7431&zoom=12&size=640x360&markers=30.2672,-97.7431,red-pushpin';

const PARTICIPANT_AVATARS = [
  'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=150',
  'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=150',
  'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=150',
  'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150',
];

function toStatus(value: string): ViewStatus {
  const normalized = value.trim().toLowerCase();
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
  if (!location) {
    return 'Location TBD';
  }
  if (typeof location === 'string') {
    return location;
  }
  if (location.address) {
    return location.address;
  }
  return 'Location TBD';
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
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
    status: mock.status === 'published' ? 'published' : mock.status,
    level: mock.level,
    categories: mock.categories,
    requirements: mock.requirements,
    heroImageUrl: mock.heroImageUrl,
    mapImageUrl: mock.mapImageUrl,
  };
}

function mapFromApi(activity: ActivityRecord, fallback: ActivityDetailMock | null): ActivityDetailViewModel {
  const { dateLabel, timeLabel } = formatDateAndTime(activity.start_time, activity.end_time);
  const skills = Array.isArray(activity.required_skills) ? activity.required_skills : [];
  const categories = skills.length > 0 ? skills.slice(0, 2).map(titleCase) : fallback?.categories ?? ['Community'];
  const requirements = skills.length > 0 ? skills.slice(0, 3).map(titleCase) : fallback?.requirements ?? ['Teamwork'];
  const maxParticipants = Number(activity.capacity ?? fallback?.maxParticipants ?? 0);

  return {
    id: activity.id,
    title: activity.title || fallback?.title || 'Untitled Activity',
    organization: fallback?.organization || 'Community Organizer',
    description:
      activity.description?.trim() ||
      fallback?.description ||
      'Details for this activity are being updated by the organizer.',
    locationName: locationLabel(activity.location),
    locationAddress: fallback?.locationAddress || locationLabel(activity.location),
    dateLabel,
    timeLabel,
    volunteerHours: toHours(activity.start_time, activity.end_time),
    maxParticipants,
    currentParticipants: fallback?.currentParticipants ?? null,
    status: toStatus(String(activity.status ?? 'upcoming')),
    level: fallback?.level || 'Open to all levels',
    categories,
    requirements,
    heroImageUrl: fallback?.heroImageUrl || FALLBACK_HERO_IMAGES[hashString(activity.id) % FALLBACK_HERO_IMAGES.length],
    mapImageUrl: fallback?.mapImageUrl || FALLBACK_MAP_IMAGE,
  };
}

export function ActivityDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityDetailViewModel | null>(null);
  const [usingMockFallback, setUsingMockFallback] = useState(false);

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

  const openSlotsLabel = useMemo(() => {
    if (!activity) {
      return '--';
    }
    if (activity.currentParticipants === null) {
      return `-- / ${activity.maxParticipants}`;
    }
    return `${activity.currentParticipants} / ${activity.maxParticipants}`;
  }, [activity]);

  return (
    <main className="activity-detail-page">
      <header className="activity-detail-topbar">
        <button
          className="activity-detail-brand"
          onClick={() => navigate('/volunteer/participation-history')}
          type="button"
        >
          V-Connect
        </button>
        <div className="activity-detail-top-actions">
          <button aria-label="Share activity" type="button">
            <Share2 className="activity-detail-top-icon" />
          </button>
          <button aria-label="Save activity" type="button">
            <Heart className="activity-detail-top-icon" />
          </button>
        </div>
      </header>

      <section className="activity-detail-shell">
        {loading && (
          <div className="activity-detail-state-card">
            <p>Loading activity detail...</p>
          </div>
        )}

        {!loading && error && (
          <div className="activity-detail-state-card">
            <p className="form-error">{error}</p>
            <button
              className="secondary-btn"
              onClick={() => navigate('/volunteer/participation-history')}
              type="button"
            >
              Back to Participation History
            </button>
          </div>
        )}

        {!loading && !error && activity && (
          <>
            {usingMockFallback && (
              <p className="activity-detail-note">
                Activity detail API is unavailable for this id. Displaying mock detail layout.
              </p>
            )}

            <div className="activity-detail-grid">
              <section className="activity-detail-main">
                <img alt={activity.title} className="activity-detail-hero-image" src={activity.heroImageUrl} />

                <div className="activity-detail-tags">
                  {activity.categories.map((category) => (
                    <span className="activity-detail-tag" key={category}>
                      {category}
                    </span>
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
                  <button type="button">Follow</button>
                </article>

                <section className="activity-detail-section">
                  <h2>About this activity</h2>
                  <p>{activity.description}</p>
                </section>

                <section className="activity-detail-requirements">
                  <h3>Volunteer Requirements</h3>
                  <div>
                    {activity.requirements.map((requirement) => (
                      <span className="activity-detail-pill" key={requirement}>
                        {requirement}
                      </span>
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
              </section>

              <aside className="activity-detail-aside">
                <article className="activity-detail-side-card">
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

                  <button className="activity-detail-join-btn" type="button">
                    Join Activity
                  </button>
                  <small className="activity-detail-guideline">By joining, you agree to our community guideline.</small>
                </article>

                <article className="activity-detail-map-card">
                  <img alt="Activity location map" src={activity.mapImageUrl} />
                  <button type="button">Open in Map</button>
                </article>
              </aside>
            </div>
          </>
        )}
      </section>

      <footer className="activity-detail-footer">(c) 2023 V-Connect Community Platform. All rights reserved.</footer>
    </main>
  );
}
