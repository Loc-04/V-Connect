import { CalendarDays, LoaderCircle, MapPin, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, Card, Select } from '../components/ui';
import { VolunteerShell } from '../layouts/VolunteerShell';
import './VolunteerAiRecommendedActivitiesPage.css';

interface RecommendationItem {
  id: string;
  title: string;
  organizer: string;
  startAt: string;
  dateLabel: string;
  location: string;
  imageUrl: string;
  matchScore: number;
  matchLabel: string;
  categories: string[];
  whyMatches: string;
  reasons: string[];
  activityId: string | null;
}

const mockRecommendations: RecommendationItem[] = [
  {
    id: 'rec-tech-literacy',
    title: 'Tech Literacy for Seniors',
    organizer: 'Downtown Community Center',
    startAt: '2024-10-12T10:00:00.000Z',
    dateLabel: 'Oct 12, 2024 - 10:00 AM - 1:00 PM',
    location: 'Central Library, Learning Wing',
    imageUrl:
      'https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg?auto=compress&cs=tinysrgb&w=1200',
    matchScore: 98,
    matchLabel: 'Excellent Match',
    categories: ['Education', 'Senior Care'],
    whyMatches: 'Matches your teaching skills and weekend availability.',
    reasons: ['Skill Match', 'Interest Match', 'Availability Match'],
    activityId: null,
  },
  {
    id: 'rec-river-cleanup',
    title: 'River Cleanup Sprint',
    organizer: 'Greenline Youth Network',
    startAt: '2024-10-18T07:30:00.000Z',
    dateLabel: 'Oct 18, 2024 - 7:30 AM - 11:30 AM',
    location: 'Riverside Public Park',
    imageUrl:
      'https://images.pexels.com/photos/6646918/pexels-photo-6646918.jpeg?auto=compress&cs=tinysrgb&w=1200',
    matchScore: 93,
    matchLabel: 'Strong Match',
    categories: ['Environment', 'Community'],
    whyMatches: 'Aligned with your eco-volunteering history and preferred morning schedule.',
    reasons: ['Interest Match', 'Historical Match', 'Availability Match'],
    activityId: null,
  },
  {
    id: 'rec-food-drive',
    title: 'Weekend Food Drive Logistics',
    organizer: 'City Relief Coalition',
    startAt: '2024-11-02T13:00:00.000Z',
    dateLabel: 'Nov 02, 2024 - 1:00 PM - 5:00 PM',
    location: 'Community Hall B',
    imageUrl:
      'https://images.pexels.com/photos/6995268/pexels-photo-6995268.jpeg?auto=compress&cs=tinysrgb&w=1200',
    matchScore: 89,
    matchLabel: 'Good Match',
    categories: ['Logistics', 'Community'],
    whyMatches: 'Recommended based on your coordination experience and teamwork preference.',
    reasons: ['Skill Match', 'Availability Match'],
    activityId: null,
  },
];

function monthIndex(dateValue: string): number | null {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.getMonth();
}

export function VolunteerAiRecommendedActivitiesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('this-month');
  const [matchFilter, setMatchFilter] = useState('high-low');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Recommendation API is not available in the current backend, so this page uses mock fallback data.
  const usingMockFallback = true;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecommendations(mockRecommendations);
      setLoading(false);
    }, 360);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const categoryOptions = useMemo(() => {
    const dynamic = new Set<string>();
    recommendations.forEach((item) => {
      item.categories.forEach((category) => dynamic.add(category));
    });

    return ['all', ...Array.from(dynamic)];
  }, [recommendations]);

  const filteredRecommendations = useMemo(() => {
    const currentMonth = new Date().getMonth();
    const nextMonth = (currentMonth + 1) % 12;

    const filtered = recommendations.filter((item) => {
      if (categoryFilter !== 'all' && !item.categories.includes(categoryFilter)) {
        return false;
      }

      const month = monthIndex(item.startAt);
      if (dateFilter === 'this-month' && month !== currentMonth) {
        return false;
      }
      if (dateFilter === 'next-month' && month !== nextMonth) {
        return false;
      }

      return true;
    });

    return filtered.sort((left, right) =>
      matchFilter === 'high-low' ? right.matchScore - left.matchScore : left.matchScore - right.matchScore
    );
  }, [categoryFilter, dateFilter, matchFilter, recommendations]);

  const featuredRecommendation = filteredRecommendations[0] ?? null;

  const handleViewDetails = () => {
    if (!featuredRecommendation?.activityId) {
      setActionNotice('Detailed activity endpoint is not connected for fallback recommendations yet.');
      return;
    }

    navigate(`/volunteer/activity/${featuredRecommendation.activityId}`);
  };

  const handleApplyJoin = () => {
    setActionNotice('Apply / Join API is not connected for fallback recommendations yet.');
  };

  return (
    <VolunteerShell
      activeNav="ai-recommendations"
      pageEyebrow="Smart Matchmaking Engine"
      pageSubtitle="Smart suggestions based on your skills, interests, availability, and past participation."
      pageTitle="AI Recommended Activities"
    >
      <section className="ai-reco-page">
        <section className="ai-reco-filter-strip" aria-label="Recommendation filters">
          <div className="ai-reco-filter-row">
            <div className="ai-reco-filter-group">
              <Select
                className="ai-reco-filter-select"
                onChange={(event) => setCategoryFilter(event.target.value)}
                value={categoryFilter}
              >
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All Categories' : option}
                  </option>
                ))}
              </Select>

              <Select
                className="ai-reco-filter-select"
                onChange={(event) => setDateFilter(event.target.value)}
                value={dateFilter}
              >
                <option value="this-month">Date: This Month</option>
                <option value="next-month">Date: Next Month</option>
                <option value="all">Date: Any Time</option>
              </Select>

              <Select
                className="ai-reco-filter-select"
                onChange={(event) => setMatchFilter(event.target.value)}
                value={matchFilter}
              >
                <option value="high-low">Match: High to Low</option>
                <option value="low-high">Match: Low to High</option>
              </Select>
            </div>

            <p className="ai-reco-sort-note">
              Sorted by: <strong>Match Score</strong>
            </p>
          </div>
        </section>

        {actionNotice && <p className="form-error">{actionNotice}</p>}

        {loading ? (
          <Card as="section" className="ai-reco-loading-card">
            <LoaderCircle className="ai-reco-loading-icon" />
            <div>
              <h3>Loading recommendations...</h3>
              <p className="muted">Preparing your best activity matches.</p>
            </div>
          </Card>
        ) : filteredRecommendations.length === 0 ? (
          <Card as="section" className="ai-reco-loading-card">
            <LoaderCircle className="ai-reco-loading-icon" />
            <div>
              <h3>No recommendations available</h3>
              <p className="muted">
                {usingMockFallback
                  ? 'No fallback recommendations match the selected filters.'
                  : 'Try changing filters to discover more suggested activities.'}
              </p>
            </div>
          </Card>
        ) : (
          <div className="ai-reco-main-grid">
            <Card as="article" className="ai-reco-featured-card">
              {featuredRecommendation ? (
                <>
                  <div className="ai-reco-image-wrap">
                    <img alt={featuredRecommendation.title} className="ai-reco-image" src={featuredRecommendation.imageUrl} />
                    <span className="ai-reco-match-pill" aria-label={`${featuredRecommendation.matchScore}% match`}>
                      <Star size={12} />
                      <span>
                        {featuredRecommendation.matchScore}% {featuredRecommendation.matchLabel}
                      </span>
                    </span>
                  </div>

                  <div className="ai-reco-featured-body">
                    <div className="ai-reco-category-row">
                      {featuredRecommendation.categories.map((category) => (
                        <Badge className="ai-reco-category-badge" key={category} tone="neutral">
                          {category}
                        </Badge>
                      ))}
                    </div>

                    <h2>{featuredRecommendation.title}</h2>
                    <p className="ai-reco-organizer">Organized by {featuredRecommendation.organizer}</p>

                    <div className="ai-reco-meta-row">
                      <span>
                        <CalendarDays size={14} />
                        {featuredRecommendation.dateLabel}
                      </span>
                      <span>
                        <MapPin size={14} />
                        {featuredRecommendation.location}
                      </span>
                    </div>

                    <div className="ai-reco-why-card">
                      <p className="ai-reco-why-title">Why This Matches</p>
                      <p>{featuredRecommendation.whyMatches}</p>
                      <div className="ai-reco-why-tags">
                        {featuredRecommendation.reasons.map((reason) => (
                          <Badge className="ai-reco-reason-tag" key={reason} tone="info">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="ai-reco-cta-row">
                      <Button className="ai-reco-view-btn" onClick={handleViewDetails} type="button">
                        View Details
                      </Button>
                      <Button className="ai-reco-join-btn" onClick={handleApplyJoin} type="button" variant="secondary">
                        Apply / Join
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="ai-reco-missing-selected">
                  <p className="muted">Selected recommendation is unavailable.</p>
                </div>
              )}
            </Card>

            <Card as="section" className="ai-reco-next-card">
              <div className="ai-reco-next-icon-wrap" aria-hidden="true">
                <LoaderCircle size={18} />
              </div>
              <h3>Loading more activities...</h3>
              <p className="muted">Scanning for matches...</p>
            </Card>
          </div>
        )}
      </section>
    </VolunteerShell>
  );
}
