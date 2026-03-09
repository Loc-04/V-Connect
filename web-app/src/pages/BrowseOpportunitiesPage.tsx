import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
            <img
              alt=""
              className="browse-brand-logo"
              src="https://www.figma.com/api/mcp/asset/25df3982-f136-40ef-a70b-1f115f888a93"
            />
            <span>V-Connect</span>
          </div>

          <div className="browse-nav-actions">
            <button className="browse-nav-link browse-nav-link-active" type="button">
              Browse
            </button>
            <button className="browse-nav-link" onClick={() => navigate('/')} type="button">
              Home
            </button>
            <button className="browse-nav-link" onClick={() => navigate('/volunteer/home')} type="button">
              Profile
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
              <SearchIcon />
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
                  <ChevronDownIcon />
                </button>
              ))}
              <button className="browse-filter-icon-btn" type="button">
                <FilterIcon />
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
                      <HeartIcon />
                    </button>
                  </div>

                  <div className="browse-card-body">
                    <div className="browse-meta-line">
                      <CalendarIcon />
                      <span>{opportunity.date}</span>
                    </div>

                    <h2>{opportunity.title}</h2>

                    <div className="browse-meta-line browse-location-line">
                      <PinIcon />
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
                      <button className="browse-apply-btn" type="button">
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

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="browse-icon" fill="none" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="browse-icon-sm" fill="none" viewBox="0 0 24 24">
      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" className="browse-icon-sm" fill="none" viewBox="0 0 24 24">
      <path d="M4 7H20" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M8 12H16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M10.5 17H13.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg aria-hidden="true" className="browse-icon-sm" fill="none" viewBox="0 0 24 24">
      <path
        d="M12.05 20.2C11.75 20.2 11.47 20.1 11.25 19.92C8.25 17.46 3.9 13.95 3.9 9.2C3.9 6.58 5.98 4.5 8.6 4.5C10.07 4.5 11.47 5.17 12.4 6.31C13.33 5.17 14.73 4.5 16.2 4.5C18.82 4.5 20.9 6.58 20.9 9.2C20.9 13.95 16.55 17.46 13.55 19.92C13.33 20.1 12.35 20.2 12.05 20.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" className="browse-icon-sm" fill="none" viewBox="0 0 24 24">
      <rect height="15" rx="2" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="6" />
      <path d="M8 3V8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="M16 3V8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="M4 10H20" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" className="browse-icon-sm" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 21C12 21 18 15.5 18 10.5C18 7.46 15.54 5 12.5 5C9.46 5 7 7.46 7 10.5C7 15.5 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12.5" cy="10.5" r="1.6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
