import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Heart, MapPin, Search } from 'lucide-react';

import { useAuth } from '../auth/useAuth';
import { Badge, Button, Card, Input } from '../components/ui';
import { VolunteerShell } from '../layouts/VolunteerShell';
import { listActivities } from '../lib/activities';
import { createParticipation, listParticipations } from '../lib/participations';
import type { ActivityRecord, ActivityStatus } from '../types/activity';
import type { ParticipationRecord } from '../types/participation';
import './BrowseOpportunitiesPage.css';

type CategoryTone = 'accent' | 'neutral' | 'success' | 'danger' | 'info';

interface OpportunityViewModel {
  id: string;
  category: string;
  categoryTone: CategoryTone;
  imageUrl: string;
  date: string;
  title: string;
  location: string;
  tags: string[];
  spotsLeft: number;
}

const fallbackImages = [
  'https://images.pexels.com/photos/6646918/pexels-photo-6646918.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6646955/pexels-photo-6646955.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6646866/pexels-photo-6646866.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6995268/pexels-photo-6995268.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6646907/pexels-photo-6646907.jpeg?auto=compress&cs=tinysrgb&w=1200',
];

const statusFilters: Array<{ label: string; value: ActivityStatus | 'all' }> = [
  { label: 'Published', value: 'published' },
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

function mapStatusToTone(status: string): CategoryTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
    case 'draft':
      return 'neutral';
    case 'published':
      return 'accent';
    default:
      return 'info';
  }
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date TBD';
  }
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getLocationLabel(location: ActivityRecord['location']) {
  if (!location) {
    return 'Location TBD';
  }

  if (typeof location === 'string') {
    return location;
  }

  if (typeof location.address === 'string' && location.address.trim()) {
    return location.address;
  }

  return 'Location TBD';
}

function toOpportunity(activity: ActivityRecord, index: number): OpportunityViewModel {
  const status = String(activity.status ?? '').toLowerCase();
  const requiredSkills = Array.isArray(activity.required_skills) ? activity.required_skills : [];

  return {
    id: activity.id,
    category: status || 'opportunity',
    categoryTone: mapStatusToTone(status),
    imageUrl: fallbackImages[index % fallbackImages.length],
    date: formatDateLabel(activity.start_time),
    title: activity.title ?? 'Untitled activity',
    location: getLocationLabel(activity.location),
    tags: requiredSkills.slice(0, 3),
    spotsLeft: Number(activity.capacity ?? 0),
  };
}

export function BrowseOpportunitiesPage() {
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ActivityStatus | 'all'>('published');
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [applyingActivityId, setApplyingActivityId] = useState<string | null>(null);
  const [participationByActivityId, setParticipationByActivityId] = useState<Record<string, ParticipationRecord>>({});
  const canApply = profile?.role === 'volunteer';

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const nextActivities = await listActivities({
          accessToken: session.access_token,
          status: statusFilter,
          search: searchTerm || undefined,
          limit: 60,
        });

        if (!cancelled) {
          setActivities(nextActivities);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load activities.');
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
  }, [searchTerm, session?.access_token, statusFilter]);

  useEffect(() => {
    if (!session?.access_token || !canApply) {
      setParticipationByActivityId({});
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const participations = await listParticipations({
          accessToken: session.access_token,
          mine: true,
          limit: 250,
        });

        if (!cancelled) {
          setParticipationByActivityId(
            Object.fromEntries(
              participations
                .filter((participation) => Boolean(participation.activity_id))
                .map((participation) => [participation.activity_id, participation])
            )
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load your participation list.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canApply, session?.access_token]);

  const opportunities = useMemo(() => activities.map((activity, index) => toOpportunity(activity, index)), [activities]);

  const handleQuickApply = async (activityId: string) => {
    if (!session?.access_token) {
      setError('No active session token.');
      return;
    }

    setApplyingActivityId(activityId);
    setError(null);
    setMessage(null);

    try {
      const result = await createParticipation(activityId, session.access_token);
      setParticipationByActivityId((current) => ({
        ...current,
        [activityId]: result.participation,
      }));
      setMessage(result.message ?? (result.created ? 'Applied successfully.' : 'Participation already exists.'));
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Failed to apply for this activity.');
    } finally {
      setApplyingActivityId(null);
    }
  };

  const handleOpenActivity = (activityId: string) => {
    navigate(`/volunteer/activity/${activityId}`);
  };

  return (
    <VolunteerShell
      activeNav="activities"
      headerActions={
        canApply ? (
          <Button onClick={() => navigate('/volunteer/participation-history')} type="button" variant="secondary">
            My Activities
          </Button>
        ) : undefined
      }
      pageSubtitle="Search published opportunities, review requirements, and quickly join the activities that fit you best."
      pageTitle="Browse Opportunities"
    >
      <section className="browse-page">
        <Card as="section" className="browse-toolbar-card">
          <div className="browse-toolbar-copy">
            <h2>Find your next impact</h2>
            <p>Browse volunteer opportunities from Supabase and apply directly from the list.</p>
          </div>

          <div className="browse-search-wrap">
            <label className="browse-search-input-shell" htmlFor="browse-search-input">
              <Search className="browse-icon" />
              <Input
                aria-label="Search opportunities"
                className="browse-search-input"
                id="browse-search-input"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by keyword, skill, or cause..."
                type="search"
                value={searchTerm}
              />
            </label>

            <div className="browse-filters" role="tablist" aria-label="Activity status filters">
              {statusFilters.map((status) => (
                <Button
                  aria-pressed={statusFilter === status.value}
                  className={statusFilter === status.value ? 'browse-filter-btn is-active' : 'browse-filter-btn'}
                  key={status.value}
                  onClick={() => setStatusFilter(status.value)}
                  type="button"
                  variant="secondary"
                >
                  {status.label}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}

        {loading && (
          <Card className="browse-empty-card">
            <p className="muted">Loading activities...</p>
          </Card>
        )}

        {!loading && !error && (
          <section className="browse-grid" aria-label="Volunteer opportunities">
            {opportunities.map((opportunity) => (
              <Card
                as="article"
                className="browse-card"
                key={opportunity.id}
                onClick={() => handleOpenActivity(opportunity.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleOpenActivity(opportunity.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="browse-card-image-wrap">
                  <img alt={opportunity.title} className="browse-card-image" src={opportunity.imageUrl} />
                  <Badge className="browse-category" tone={opportunity.categoryTone}>
                    {opportunity.category}
                  </Badge>
                  <button
                    aria-label="Save opportunity"
                    className="browse-favorite-btn"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    type="button"
                  >
                    <Heart className="browse-icon-sm" />
                  </button>
                </div>

                <div className="browse-card-body">
                  <div className="browse-meta-line">
                    <CalendarDays className="browse-icon-sm" />
                    <span>{opportunity.date}</span>
                  </div>

                  <h2>{opportunity.title}</h2>

                  <div className="browse-meta-line browse-location-line">
                    <MapPin className="browse-icon-sm" />
                    <span>{opportunity.location}</span>
                  </div>

                  <div className="browse-tags">
                    {opportunity.tags.length === 0 && (
                      <Badge className="browse-tag" tone="neutral">
                        General
                      </Badge>
                    )}
                    {opportunity.tags.map((tag) => (
                      <Badge className="browse-tag" key={`${opportunity.id}-${tag}`} tone="accent">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <div className="browse-card-footer">
                    <span>{opportunity.spotsLeft} spots</span>
                    <Button
                      className="browse-apply-btn"
                      disabled={
                        !canApply ||
                        applyingActivityId === opportunity.id ||
                        Boolean(participationByActivityId[opportunity.id])
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleQuickApply(opportunity.id);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      type="button"
                    >
                      {applyingActivityId === opportunity.id
                        ? 'Applying...'
                        : participationByActivityId[opportunity.id]
                          ? `Applied (${participationByActivityId[opportunity.id].status})`
                          : 'Quick Apply'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </section>
        )}

        {!loading && !error && opportunities.length === 0 && (
          <Card className="browse-empty-card">
            <p className="muted">No activities found.</p>
          </Card>
        )}
      </section>
    </VolunteerShell>
  );
}
