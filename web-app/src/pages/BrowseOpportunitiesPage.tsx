import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, CalendarDays, ChevronDown, Filter, Heart, History, LayoutDashboard, MapPin, Search, User } from 'lucide-react';

import { useAuth } from '../auth/useAuth';
import { listActivities } from '../lib/activities';
import type { ActivityRecord, ActivityStatus } from '../types/activity';
import './BrowseOpportunitiesPage.css';

type CategoryTone = 'blue' | 'orange' | 'green' | 'purple' | 'red';

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
      return 'green';
    case 'cancelled':
      return 'red';
    case 'draft':
      return 'purple';
    case 'published':
      return 'blue';
    default:
      return 'orange';
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
  const { session, signOut, profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ActivityStatus | 'all'>('published');
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const opportunities = useMemo(() => activities.map((activity, index) => toOpportunity(activity, index)), [activities]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <main className="browse-page">
      <header className="browse-top-nav">
        <div className="browse-container browse-nav-inner">
          <div className="browse-brand">
            <span className="browse-brand-logo" aria-hidden="true">
              <Activity className="browse-icon" />
            </span>
            <span>V-Connect</span>
          </div>

          <div className="browse-nav-actions">
            <button className="browse-nav-link browse-nav-link-active" type="button">
              <Search className="browse-icon-sm" />
              Browse
            </button>
            <button className="browse-nav-link" onClick={() => navigate('/volunteer/home')} type="button">
              <LayoutDashboard className="browse-icon-sm" />
              Home
            </button>
            <button
              className="browse-nav-link"
              onClick={() => navigate('/volunteer/participation-history')}
              type="button"
            >
              <History className="browse-icon-sm" />
              Participation
            </button>
            <button className="browse-nav-link" onClick={() => navigate('/volunteer/profile-ui')} type="button">
              <User className="browse-icon-sm" />
              Profile
            </button>
            <button className="browse-nav-link" onClick={() => navigate('/feedback')} type="button">
              Feedback
            </button>
            <button className="browse-logout-btn" onClick={handleSignOut} type="button">
              Log Out
            </button>
          </div>
        </div>
      </header>

      <section className="browse-main">
        <div className="browse-container">
          <div className="browse-hero">
            <h1>Find your next impact</h1>
            <p>
              Browse volunteer opportunities from Supabase. Signed in as {profile?.full_name ?? profile?.id ?? 'User'}.
            </p>
          </div>

          <div className="browse-search-wrap">
            <div className="browse-search-input-shell">
              <Search className="browse-icon" />
              <input
                aria-label="Search opportunities"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by keyword, skill, or cause..."
                type="text"
                value={searchTerm}
              />
            </div>

            <div className="browse-search-divider" />

            <div className="browse-filters">
              {statusFilters.map((status) => (
                <button
                  className="browse-filter-btn"
                  key={status.value}
                  onClick={() => setStatusFilter(status.value)}
                  type="button"
                >
                  {status.label}
                  <ChevronDown className="browse-icon-sm" />
                </button>
              ))}
              <button className="browse-filter-icon-btn" type="button">
                <Filter className="browse-icon-sm" />
              </button>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}
          {loading && <p className="muted">Loading activities...</p>}

          <section className="browse-grid" aria-label="Volunteer opportunities">
            {!loading &&
              !error &&
              opportunities.map((opportunity) => (
                <article className="browse-card" key={opportunity.id}>
                  <div className="browse-card-image-wrap">
                    <img alt={opportunity.title} className="browse-card-image" src={opportunity.imageUrl} />
                    <span className={`browse-category browse-category-${opportunity.categoryTone}`}>{opportunity.category}</span>
                    <button aria-label="Save opportunity" className="browse-favorite-btn" type="button">
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
                      {opportunity.tags.length === 0 && <span className="browse-tag">General</span>}
                      {opportunity.tags.map((tag) => (
                        <span className="browse-tag" key={`${opportunity.id}-${tag}`}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="browse-card-footer">
                      <span>{opportunity.spotsLeft} spots</span>
                      <button
                        className="browse-apply-btn"
                        onClick={() => navigate(`/volunteer/activity/${opportunity.id}`)}
                        type="button"
                      >
                        Quick Apply
                      </button>
                    </div>
                  </div>
                </article>
              ))}
          </section>

          {!loading && !error && opportunities.length === 0 && <p className="muted">No activities found.</p>}
        </div>
      </section>
    </main>
  );
}
