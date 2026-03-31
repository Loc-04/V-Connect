import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, FilterX, MapPin, Search } from 'lucide-react';

import { AuthRequiredModal } from '../components/auth/AuthRequiredModal';
import { Badge, Button, Card, Input } from '../components/ui';
import { GuestShell } from '../layouts/GuestShell';
import { listGuestActivities, type GuestActivityRecord, type GuestActivityStatus } from '../lib/guestActivities';
import './BrowseOpportunitiesPage.css';
import './GuestBrowsePage.css';

type CategoryTone = 'accent' | 'neutral' | 'success' | 'danger' | 'info';

const statusFilters: Array<{ label: string; value: GuestActivityStatus | 'all' }> = [
  { label: 'Published', value: 'published' },
  { label: 'All', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

function formatDateLabel(startTime: string) {
  const date = new Date(startTime);
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

function mapStatusToTone(status: GuestActivityStatus): CategoryTone {
  if (status === 'completed') {
    return 'success';
  }
  if (status === 'cancelled') {
    return 'danger';
  }
  if (status === 'published') {
    return 'accent';
  }
  return 'info';
}

function getLocationLabel(activity: GuestActivityRecord) {
  const address = activity.location.address.trim();
  const city = activity.location.city.trim();
  return [address, city].filter(Boolean).join(', ') || 'Location TBD';
}

export function GuestBrowsePage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<GuestActivityStatus | 'all'>('published');
  const [skillFilter, setSkillFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const activities = useMemo(() => listGuestActivities(), []);

  const filteredActivities = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const skillKeyword = skillFilter.trim().toLowerCase();
    const locationKeyword = locationFilter.trim().toLowerCase();

    return activities.filter((activity) => {
      if (statusFilter !== 'all' && activity.status !== statusFilter) {
        return false;
      }

      if (keyword) {
        const searchable = [activity.title, activity.description, activity.organization, activity.requiredSkills.join(' ')]
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(keyword)) {
          return false;
        }
      }

      if (skillKeyword) {
        const skills = activity.requiredSkills.map((skill) => skill.toLowerCase()).join(' ');
        if (!skills.includes(skillKeyword)) {
          return false;
        }
      }

      if (locationKeyword) {
        const locationText = getLocationLabel(activity).toLowerCase();
        if (!locationText.includes(locationKeyword)) {
          return false;
        }
      }

      return true;
    });
  }, [activities, locationFilter, searchTerm, skillFilter, statusFilter]);

  const hasAdvancedFilters = Boolean(skillFilter.trim() || locationFilter.trim());

  return (
    <GuestShell
      activeNav="browse"
      headerActions={
        <Button onClick={() => navigate('/login')} type="button" variant="secondary">
          Sign In
        </Button>
      }
      pageSubtitle="Start exploring opportunities that match your interests."
      pageTitle="Browse Activities"
    >
      <section className="browse-page">
        <Card as="section" className="browse-toolbar-card">
          <div className="browse-toolbar-copy">
            <h2>Explore Volunteer Activities</h2>
            <p>Discover meaningful volunteer opportunities in public guest mode.</p>
          </div>

          <div className="browse-search-wrap">
            <label className="browse-search-input-shell" htmlFor="guest-browse-search-input">
              <Search className="browse-icon" />
              <Input
                aria-label="Search activities"
                className="browse-search-input"
                id="guest-browse-search-input"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search activities"
                type="search"
                value={searchTerm}
              />
            </label>

            <div aria-label="Activity status filters" className="browse-filters" role="tablist">
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

          <div aria-label="Advanced filters" className="browse-advanced-filters">
            <label className="browse-advanced-field" htmlFor="guest-filter-skill">
              <span>Skill</span>
              <Input
                id="guest-filter-skill"
                onChange={(event) => setSkillFilter(event.target.value)}
                placeholder="e.g. teamwork"
                sizeMode="small"
                type="text"
                value={skillFilter}
              />
            </label>

            <label className="browse-advanced-field" htmlFor="guest-filter-location">
              <span>Location</span>
              <Input
                id="guest-filter-location"
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
              onClick={() => {
                setSkillFilter('');
                setLocationFilter('');
              }}
              type="button"
              variant="secondary"
            >
              <FilterX size={14} />
              <span>Clear filters</span>
            </Button>
          </div>
        </Card>

        {filteredActivities.length === 0 ? (
          <Card className="browse-empty-card">
            <p className="muted">No activities found</p>
          </Card>
        ) : (
          <section aria-label="Guest public opportunities" className="browse-grid">
            {filteredActivities.map((activity) => (
              <Card
                as="article"
                className="browse-card"
                key={activity.id}
                onClick={() => navigate(`/guest/activity/${activity.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/guest/activity/${activity.id}`);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="browse-card-image-wrap">
                  <img alt={activity.title} className="browse-card-image" src={activity.imageUrl} />
                  <Badge className="browse-category" tone={mapStatusToTone(activity.status)}>
                    {activity.status}
                  </Badge>
                </div>

                <div className="browse-card-body">
                  <div className="browse-meta-line">
                    <CalendarDays className="browse-icon-sm" />
                    <span>{formatDateLabel(activity.startTime)}</span>
                  </div>

                  <h2>{activity.title}</h2>

                  <p className="guest-browse-org muted">{activity.organization}</p>

                  <div className="browse-meta-line browse-location-line">
                    <MapPin className="browse-icon-sm" />
                    <span>{getLocationLabel(activity)}</span>
                  </div>

                  <div className="browse-tags">
                    {activity.requiredSkills.length === 0 ? (
                      <Badge className="browse-tag" tone="neutral">
                        General
                      </Badge>
                    ) : (
                      activity.requiredSkills.slice(0, 3).map((tag) => (
                        <Badge className="browse-tag" key={`${activity.id}-${tag}`} tone="accent">
                          {tag}
                        </Badge>
                      ))
                    )}
                  </div>

                  <div className="browse-card-footer">
                    <span>
                      {activity.currentParticipants}/{activity.capacity} participants
                    </span>
                    <Button
                      className="guest-browse-join-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowAuthModal(true);
                      }}
                      type="button"
                      variant="secondary"
                    >
                      Join Activity
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </section>
        )}
      </section>

      <AuthRequiredModal intent="register" onClose={() => setShowAuthModal(false)} open={showAuthModal} />
    </GuestShell>
  );
}
