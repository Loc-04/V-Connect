import { useMemo, useState } from 'react';
import { Search, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { AuthRequiredModal } from '../components/auth/AuthRequiredModal';
import { GuestActivityCard, GuestFooter } from '../components/guest';
import { Button, Card, Input } from '../components/ui';
import { buildGuestActivityIntentPath, type GuestProtectedAction } from '../lib/guestAuth';
import { getGuestAvailabilityMeta, listGuestActivities, type GuestActivityRecord } from '../lib/guestActivities';
import { GuestShell } from '../layouts/GuestShell';
import './GuestBrowsePage.css';

type DateFilter = 'any' | 'week' | 'month';
type AvailabilityFilter = 'all' | 'open' | 'filling_fast' | 'waitlist';

const INITIAL_VISIBLE_COUNT = 6;
const LOAD_MORE_COUNT = 6;

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function isWithinDateFilter(startTime: string, dateFilter: DateFilter) {
  if (dateFilter === 'any') {
    return true;
  }

  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (dateFilter === 'week') {
    return diffDays >= 0 && diffDays <= 7;
  }

  return diffDays >= 0 && diffDays <= 31;
}

export function GuestBrowsePage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('any');
  const [locationFilter, setLocationFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [authPrompt, setAuthPrompt] = useState<{ action: GuestProtectedAction; activity: GuestActivityRecord } | null>(null);

  const activities = useMemo(() => listGuestActivities(), []);
  const categories = useMemo(() => ['all', ...new Set(activities.map((activity) => activity.domain))], [activities]);

  const filteredActivities = useMemo(() => {
    const keyword = normalizeText(searchTerm);
    const locationKeyword = normalizeText(locationFilter);

    return activities.filter((activity) => {
      if (categoryFilter !== 'all' && activity.domain !== categoryFilter) {
        return false;
      }

      if (!isWithinDateFilter(activity.startTime, dateFilter)) {
        return false;
      }

      if (availabilityFilter !== 'all' && getGuestAvailabilityMeta(activity).tone !== availabilityFilter) {
        return false;
      }

      if (keyword) {
        const searchable = [
          activity.title,
          activity.organization,
          activity.cardSummary,
          activity.requiredSkills.join(' '),
          activity.tags.join(' '),
        ]
          .join(' ')
          .toLowerCase();

        if (!searchable.includes(keyword)) {
          return false;
        }
      }

      if (locationKeyword) {
        const haystack = [activity.location.address, activity.location.city, activity.location.meetingPoint]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(locationKeyword)) {
          return false;
        }
      }

      return true;
    });
  }, [activities, availabilityFilter, categoryFilter, dateFilter, locationFilter, searchTerm]);

  const visibleActivities = filteredActivities.slice(0, visibleCount);
  const hasMore = visibleActivities.length < filteredActivities.length;

  const resetFilters = () => {
    setSearchTerm('');
    setCategoryFilter('all');
    setDateFilter('any');
    setLocationFilter('');
    setAvailabilityFilter('all');
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  };

  const handleProtectedAction = (action: GuestProtectedAction, activity: GuestActivityRecord) => {
    setAuthPrompt({ action, activity });
  };

  const handleShare = async (activity: GuestActivityRecord) => {
    const shareUrl = `${window.location.origin}/guest/activity/${activity.id}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: activity.title, text: activity.cardSummary, url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setShareNotice(`Share link ready for ${activity.title}.`);
    } catch {
      setShareNotice('Sharing was cancelled or is not available in this browser.');
    }
  };

  return (
    <GuestShell activeNav="browse">
      <section className="guest-browse-hero">
        <div>
          <p className="guest-section-label">Discover Impact.</p>
          <h1>Join a community of purposeful contributors.</h1>
          <p>
            Find opportunities to lend your skills and grow alongside others. Guests can browse public published activities
            in read-only mode.
          </p>
        </div>
      </section>

      <Card as="section" className="guest-browse-toolbar">
        <div className="guest-browse-search-row">
          <label className="guest-browse-search-shell" htmlFor="guest-browse-search-input">
            <Search size={16} />
            <Input
              className="guest-browse-search-input"
              id="guest-browse-search-input"
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setVisibleCount(INITIAL_VISIBLE_COUNT);
              }}
              placeholder="Search activities, keywords, or skills..."
              type="search"
              value={searchTerm}
            />
          </label>

          <div className="guest-browse-filter-grid">
            <label>
              <span>Category</span>
              <select
                className="text-input small"
                onChange={(event) => {
                  setCategoryFilter(event.target.value);
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                }}
                value={categoryFilter}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category === 'all' ? 'All Categories' : category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Date</span>
              <select
                className="text-input small"
                onChange={(event) => {
                  setDateFilter(event.target.value as DateFilter);
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                }}
                value={dateFilter}
              >
                <option value="any">Any Date</option>
                <option value="week">Next 7 Days</option>
                <option value="month">Next 30 Days</option>
              </select>
            </label>

            <label>
              <span>Location</span>
              <Input
                onChange={(event) => {
                  setLocationFilter(event.target.value);
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                }}
                placeholder="Location"
                sizeMode="small"
                type="text"
                value={locationFilter}
              />
            </label>

            <label>
              <span>Status</span>
              <select
                className="text-input small"
                onChange={(event) => {
                  setAvailabilityFilter(event.target.value as AvailabilityFilter);
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                }}
                value={availabilityFilter}
              >
                <option value="all">Published</option>
                <option value="open">Open</option>
                <option value="filling_fast">Filling Fast</option>
                <option value="waitlist">Waitlist Only</option>
              </select>
            </label>
          </div>
        </div>
      </Card>

      {shareNotice ? <p className="form-success">{shareNotice}</p> : null}

      {filteredActivities.length === 0 ? (
        <Card className="guest-browse-empty-card">
          <h2>No published activities match the current filters.</h2>
          <p className="muted">Try broadening the search, location, or availability filters.</p>
          <Button onClick={resetFilters} type="button" variant="secondary">
            Reset Filters
          </Button>
        </Card>
      ) : (
        <>
          <section aria-label="Published guest activities" className="guest-browse-grid">
            {visibleActivities.map((activity) => (
              <div className="guest-browse-card-wrap" key={activity.id}>
                <GuestActivityCard
                  activity={activity}
                  onProtectedAction={handleProtectedAction}
                  onViewDetails={(activityId) => navigate(`/guest/activity/${activityId}`)}
                />
                <button className="guest-browse-share-btn" onClick={() => void handleShare(activity)} type="button">
                  <Share2 size={14} />
                  <span>Share</span>
                </button>
              </div>
            ))}
          </section>

          <div className="guest-browse-load-more">
            {hasMore ? (
              <Button
                onClick={() => setVisibleCount((current) => current + LOAD_MORE_COUNT)}
                type="button"
                variant="secondary"
              >
                Load More Opportunities
              </Button>
            ) : (
              <Button disabled type="button" variant="secondary">
                No More Results
              </Button>
            )}
          </div>
        </>
      )}

      <GuestFooter />

      <AuthRequiredModal
        action={authPrompt?.action}
        nextPath={authPrompt ? buildGuestActivityIntentPath(authPrompt.activity.id, authPrompt.action) : undefined}
        onClose={() => setAuthPrompt(null)}
        open={Boolean(authPrompt)}
      />
    </GuestShell>
  );
}
