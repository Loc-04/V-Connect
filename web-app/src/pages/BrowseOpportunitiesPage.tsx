import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, FilterX, MapPin, Search } from 'lucide-react';

import { useAuth } from '../auth/useAuth';
import { RegistrationAction } from '../components/activities/RegistrationAction';
import { Badge, Button, Card, Input } from '../components/ui';
import { VolunteerShell } from '../layouts/VolunteerShell';
import { formatActivityLocation } from '../lib/activityLocation';
import { searchActivities } from '../lib/activities';
import { cancelParticipation, listParticipations } from '../lib/participations';
import type { ActivityRecord, ActivityStatus } from '../types/activity';
import type { ParticipationRecord } from '../types/participation';
import './BrowseOpportunitiesPage.css';

type CategoryTone = 'accent' | 'neutral' | 'success' | 'danger' | 'info';

interface OpportunityViewModel {
  id: string;
  category: string;
  categoryTone: CategoryTone;
  isRegisterable: boolean;
  imageUrl: string;
  date: string;
  title: string;
  location: string;
  tags: string[];
  spotsLeft: number;
}

const statusFilters: Array<{ label: string; value: ActivityStatus | 'all' }> = [
  { label: 'Published', value: 'published' },
  { label: 'All', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

function mapStatusToTone(status: string): CategoryTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'cancelled':
    case 'expired':
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
  return formatActivityLocation(location);
}

function isActivityExpired(activity: ActivityRecord) {
  const end = new Date(activity.end_time ?? '');
  return !Number.isNaN(end.getTime()) && end.getTime() <= Date.now();
}

function toOpportunity(activity: ActivityRecord): OpportunityViewModel {
  const baseStatus = String(activity.status ?? '').toLowerCase();
  const isExpired = baseStatus === 'published' && isActivityExpired(activity);
  const status = isExpired ? 'expired' : baseStatus;
  const isRegisterable = status === 'published';
  const requiredSkills = Array.isArray(activity.required_skills) ? activity.required_skills : [];

  return {
    id: activity.id,
    category: status || 'opportunity',
    categoryTone: mapStatusToTone(status),
    isRegisterable,
    imageUrl: String(activity.cover_image_url ?? '').trim(),
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
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
        const nextActivities = await searchActivities({
          accessToken: session.access_token,
          status: statusFilter,
          keyword: searchTerm || undefined,
          dateFrom: dateFromFilter || undefined,
          dateTo: dateToFilter || undefined,
          skill: skillFilter || undefined,
          location: locationFilter || undefined,
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
  }, [dateFromFilter, dateToFilter, locationFilter, searchTerm, session?.access_token, skillFilter, statusFilter]);

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

  const visibleActivities = useMemo(() => {
    if (statusFilter !== 'published') {
      return activities;
    }

    return activities.filter((activity) => !isActivityExpired(activity));
  }, [activities, statusFilter]);

  const opportunities = useMemo(() => visibleActivities.map((activity) => toOpportunity(activity)), [visibleActivities]);

  const handleRegistrationNotice = (type: 'success' | 'error', nextMessage: string) => {
    if (type === 'error') {
      setError(nextMessage);
      setMessage(null);
      return;
    }

    setMessage(nextMessage);
    setError(null);
  };

  const handleOpenActivity = (activityId: string) => {
    navigate(`/volunteer/activity/${activityId}`);
  };

  const hasAdvancedFilters = Boolean(dateFromFilter || dateToFilter || skillFilter.trim() || locationFilter.trim());

  const clearAdvancedFilters = () => {
    setDateFromFilter('');
    setDateToFilter('');
    setSkillFilter('');
    setLocationFilter('');
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

          <div className="browse-advanced-filters" aria-label="Advanced filters">
            <label className="browse-advanced-field" htmlFor="browse-filter-date-from">
              <span>Date from</span>
              <Input
                id="browse-filter-date-from"
                onChange={(event) => setDateFromFilter(event.target.value)}
                sizeMode="small"
                type="date"
                value={dateFromFilter}
              />
            </label>

            <label className="browse-advanced-field" htmlFor="browse-filter-date-to">
              <span>Date to</span>
              <Input
                id="browse-filter-date-to"
                onChange={(event) => setDateToFilter(event.target.value)}
                sizeMode="small"
                type="date"
                value={dateToFilter}
              />
            </label>

            <label className="browse-advanced-field" htmlFor="browse-filter-skill">
              <span>Skill</span>
              <Input
                id="browse-filter-skill"
                onChange={(event) => setSkillFilter(event.target.value)}
                placeholder="e.g. teamwork"
                sizeMode="small"
                type="text"
                value={skillFilter}
              />
            </label>

            <label className="browse-advanced-field" htmlFor="browse-filter-location">
              <span>Location</span>
              <Input
                id="browse-filter-location"
                onChange={(event) => setLocationFilter(event.target.value)}
                placeholder="address / city"
                sizeMode="small"
                type="text"
                value={locationFilter}
              />
            </label>

            <Button
              className="browse-clear-filters-btn"
              disabled={!hasAdvancedFilters}
              onClick={clearAdvancedFilters}
              type="button"
              variant="secondary"
            >
              <FilterX size={14} />
              <span>Clear filters</span>
            </Button>
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
                    <RegistrationAction
                      accessToken={session?.access_token ?? null}
                      activityId={opportunity.id}
                      canRegister={canApply && opportunity.isRegisterable}
                      className="browse-registration-action"
                      currentStatus={participationByActivityId[opportunity.id]?.status ?? 'none'}
                      participationId={participationByActivityId[opportunity.id]?.participationId ?? null}
                      registerDisabledLabel={canApply ? 'Registration closed' : 'Volunteer only'}
                      onCancel={async ({ activityId }) => {
                        if (!session?.access_token) {
                          throw new Error('No active session token.');
                        }

                        const cancelledParticipation = await cancelParticipation(activityId, session.access_token);
                        setParticipationByActivityId((current) => ({
                          ...current,
                          [activityId]: cancelledParticipation,
                        }));
                      }}
                      onNotice={handleRegistrationNotice}
                      onRegistered={(participation) => {
                        setParticipationByActivityId((current) => ({
                          ...current,
                          [opportunity.id]: participation,
                        }));
                      }}
                    />
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
