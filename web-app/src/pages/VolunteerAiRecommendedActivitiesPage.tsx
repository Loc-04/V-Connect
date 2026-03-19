import { ArrowRight, CalendarDays, LoaderCircle, MapPin, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { Badge, Button, Card, Select } from '../components/ui';
import { VolunteerShell } from '../layouts/VolunteerShell';
import { createParticipation } from '../lib/participations';
import { getRecommendedActivitiesForVolunteer } from '../lib/recommendations';
import type { ActivityLocation } from '../types/activity';
import type { RecommendedActivityRecord } from '../types/recommendation';
import './VolunteerAiRecommendedActivitiesPage.css';

type MatchFilter = 'all' | 'high' | 'weekend' | 'skill-based';
type SortMode = 'best-match' | 'soonest';

interface RecommendationViewModel {
  activityId: string;
  title: string;
  organizerName: string;
  matchScore: number;
  explanation: string;
  reasons: string[];
  locationLabel: string;
  dateLabel: string;
  timeLabel: string;
  hoursLabel: string;
  categories: string[];
  heroImageUrl: string;
  startTime: string;
}

const FALLBACK_IMAGES = [
  'https://images.pexels.com/photos/6646918/pexels-photo-6646918.jpeg?auto=compress&cs=tinysrgb&w=1400',
  'https://images.pexels.com/photos/6647043/pexels-photo-6647043.jpeg?auto=compress&cs=tinysrgb&w=1400',
  'https://images.pexels.com/photos/5731866/pexels-photo-5731866.jpeg?auto=compress&cs=tinysrgb&w=1400',
  'https://images.pexels.com/photos/7656740/pexels-photo-7656740.jpeg?auto=compress&cs=tinysrgb&w=1400',
];

function hashString(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function formatLocation(location: ActivityLocation | string | null): string {
  if (!location) {
    return 'Location TBD';
  }

  if (typeof location === 'string') {
    return location.trim() || 'Location TBD';
  }

  const addressParts = [location.address, location.city].filter(Boolean);
  return addressParts.join(', ') || 'Location TBD';
}

function formatDateTime(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      dateLabel: 'Date TBD',
      timeLabel: 'Time TBD',
    };
  }

  return {
    dateLabel: start.toLocaleDateString(undefined, {
      weekday: 'short',
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

function toCategoryList(record: RecommendedActivityRecord): string[] {
  const skills = Array.isArray(record.requiredSkills) ? record.requiredSkills.filter(Boolean) : [];
  if (skills.length > 0) {
    return skills.slice(0, 3);
  }
  return ['Community', 'General'];
}

function toHoursLabel(hours: number | null | undefined): string {
  if (typeof hours !== 'number' || Number.isNaN(hours) || hours <= 0) {
    return 'Flexible duration';
  }

  const rounded = Number(hours.toFixed(1));
  return `${rounded} volunteer hours`;
}

function toViewModel(record: RecommendedActivityRecord): RecommendationViewModel {
  const { dateLabel, timeLabel } = formatDateTime(record.startTime, record.endTime);
  return {
    activityId: record.activityId,
    title: record.title,
    organizerName: record.organizerName || 'Organizer',
    matchScore: Math.max(0, Math.min(100, Math.round(record.matchScore))),
    explanation: record.explanation,
    reasons: Array.isArray(record.reasons) ? record.reasons.slice(0, 4) : [],
    locationLabel: formatLocation(record.location),
    dateLabel,
    timeLabel,
    hoursLabel: toHoursLabel(record.hours),
    categories: toCategoryList(record),
    heroImageUrl: FALLBACK_IMAGES[hashString(record.activityId || record.title) % FALLBACK_IMAGES.length],
    startTime: record.startTime,
  };
}

function hasWeekendSignal(item: RecommendationViewModel) {
  return item.reasons.some((reason) => reason.toLowerCase().includes('weekend'));
}

function hasSkillSignal(item: RecommendationViewModel) {
  return item.reasons.some((reason) => reason.toLowerCase().includes('skill'));
}

export function VolunteerAiRecommendedActivitiesPage() {
  const navigate = useNavigate();
  const { profile, session } = useAuth();

  const [recommendations, setRecommendations] = useState<RecommendationViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [joiningActivityId, setJoiningActivityId] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('best-match');

  useEffect(() => {
    if (!profile?.id || !session?.access_token) {
      setLoading(false);
      setError('No active volunteer session.');
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError(null);
    setMessage(null);

    void (async () => {
      try {
        const rows = await getRecommendedActivitiesForVolunteer(profile.id, session.access_token, 12);
        if (cancelled) {
          return;
        }

        const mapped = rows.map((row) => toViewModel(row));
        setRecommendations(mapped);
        setSelectedActivityId((current) => {
          if (current && mapped.some((item) => item.activityId === current)) {
            return current;
          }
          return mapped[0]?.activityId ?? '';
        });
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setRecommendations([]);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load recommended activities.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile?.id, session?.access_token]);

  const filteredRecommendations = useMemo(() => {
    const filtered = recommendations.filter((item) => {
      if (matchFilter === 'high') {
        return item.matchScore >= 75;
      }
      if (matchFilter === 'weekend') {
        return hasWeekendSignal(item);
      }
      if (matchFilter === 'skill-based') {
        return hasSkillSignal(item);
      }
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      if (sortMode === 'soonest') {
        return new Date(left.startTime).getTime() - new Date(right.startTime).getTime();
      }
      return right.matchScore - left.matchScore || new Date(left.startTime).getTime() - new Date(right.startTime).getTime();
    });
    return sorted;
  }, [recommendations, matchFilter, sortMode]);

  const selectedRecommendation = useMemo(() => {
    if (filteredRecommendations.length === 0) {
      return null;
    }

    return (
      filteredRecommendations.find((item) => item.activityId === selectedActivityId) ??
      filteredRecommendations[0]
    );
  }, [filteredRecommendations, selectedActivityId]);

  const secondaryRecommendation = useMemo(() => {
    if (!selectedRecommendation) {
      return null;
    }
    return filteredRecommendations.find((item) => item.activityId !== selectedRecommendation.activityId) ?? null;
  }, [filteredRecommendations, selectedRecommendation]);

  useEffect(() => {
    if (!selectedRecommendation) {
      setSelectedActivityId('');
      return;
    }

    if (selectedRecommendation.activityId !== selectedActivityId) {
      setSelectedActivityId(selectedRecommendation.activityId);
    }
  }, [selectedActivityId, selectedRecommendation]);

  const handleViewDetails = (activityId: string) => {
    navigate(`/volunteer/activity/${activityId}`);
  };

  const handleJoin = async (activityId: string) => {
    if (!session?.access_token) {
      setError('No active session token.');
      setMessage(null);
      return;
    }

    setJoiningActivityId(activityId);
    setError(null);
    setMessage(null);

    try {
      const result = await createParticipation(activityId, session.access_token);
      setRecommendations((current) => current.filter((item) => item.activityId !== activityId));
      setMessage(result.message ?? (result.created ? 'Registration submitted successfully.' : 'You are already registered.'));
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Failed to register for activity.');
    } finally {
      setJoiningActivityId(null);
    }
  };

  return (
    <VolunteerShell
      activeNav="ai-recommendations"
      headerActions={
        <Button onClick={() => navigate('/browse')} type="button" variant="secondary">
          Browse all opportunities
        </Button>
      }
      pageEyebrow="Sprint 3 Matching"
      pageSubtitle="Recommendations are ranked from your skills, interests, availability, and participation history."
      pageTitle="AI Recommended Activities"
    >
      <section className="ai-reco-page">
        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}

        <div className="ai-reco-filter-strip">
          <div className="ai-reco-filter-row">
            <div className="ai-reco-filter-group">
              <Select
                className="ai-reco-filter-select"
                onChange={(event) => setMatchFilter(event.target.value as MatchFilter)}
                value={matchFilter}
              >
                <option value="all">All recommendations</option>
                <option value="high">High match only</option>
                <option value="weekend">Weekend fit</option>
                <option value="skill-based">Skill-based</option>
              </Select>

              <Select
                className="ai-reco-filter-select"
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                value={sortMode}
              >
                <option value="best-match">Sort by best match</option>
                <option value="soonest">Sort by soonest date</option>
              </Select>

              <Select
                className="ai-reco-filter-select"
                disabled={filteredRecommendations.length === 0}
                onChange={(event) => setSelectedActivityId(event.target.value)}
                value={selectedRecommendation?.activityId ?? ''}
              >
                {filteredRecommendations.length === 0 ? (
                  <option value="">No recommendations available</option>
                ) : (
                  filteredRecommendations.map((item) => (
                    <option key={item.activityId} value={item.activityId}>
                      {item.title}
                    </option>
                  ))
                )}
              </Select>
            </div>

            <p className="ai-reco-sort-note">
              Ranked by <strong>{sortMode === 'best-match' ? 'match score' : 'upcoming date'}</strong>
            </p>
          </div>
        </div>

        {loading ? (
          <Card className="ai-reco-loading-card">
            <LoaderCircle className="ai-reco-loading-icon" />
            <p>Loading recommendation engine output...</p>
          </Card>
        ) : (
          <div className="ai-reco-main-grid">
            {selectedRecommendation ? (
              <Card as="article" className="ai-reco-featured-card">
                <div className="ai-reco-image-wrap">
                  <img alt={selectedRecommendation.title} className="ai-reco-image" src={selectedRecommendation.heroImageUrl} />
                  <span className="ai-reco-match-pill">
                    <Star size={12} />
                    {selectedRecommendation.matchScore}% match
                  </span>
                </div>

                <div className="ai-reco-featured-body">
                  <div className="ai-reco-category-row">
                    {selectedRecommendation.categories.map((category) => (
                      <Badge className="ai-reco-category-badge" key={category} tone="accent">
                        {category}
                      </Badge>
                    ))}
                  </div>

                  <div>
                    <h2>{selectedRecommendation.title}</h2>
                    <p className="ai-reco-organizer">Hosted by {selectedRecommendation.organizerName}</p>
                  </div>

                  <div className="ai-reco-meta-row">
                    <span>
                      <CalendarDays size={15} />
                      {selectedRecommendation.dateLabel} · {selectedRecommendation.timeLabel}
                    </span>
                    <span>
                      <MapPin size={15} />
                      {selectedRecommendation.locationLabel}
                    </span>
                    <span>{selectedRecommendation.hoursLabel}</span>
                  </div>

                  <div className="ai-reco-why-card">
                    <p className="ai-reco-why-title">Why this was recommended</p>
                    <p>{selectedRecommendation.explanation}</p>
                    <div className="ai-reco-why-tags">
                      {selectedRecommendation.reasons.map((reason) => (
                        <Badge className="ai-reco-reason-tag" key={reason} tone="info">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="ai-reco-cta-row">
                    <Button
                      className="ai-reco-view-btn"
                      onClick={() => handleViewDetails(selectedRecommendation.activityId)}
                      type="button"
                    >
                      View details
                    </Button>
                    <Button
                      className="ai-reco-join-btn"
                      disabled={joiningActivityId === selectedRecommendation.activityId}
                      onClick={() => void handleJoin(selectedRecommendation.activityId)}
                      type="button"
                      variant="secondary"
                    >
                      {joiningActivityId === selectedRecommendation.activityId ? 'Joining...' : 'Join now'}
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="ai-reco-missing-selected">
                <p className="muted">No activities matched the current filters. Try broadening the filter set.</p>
              </Card>
            )}

            <Card as="article" className="ai-reco-next-card">
              {secondaryRecommendation ? (
                <>
                  <div className="ai-reco-next-icon-wrap">
                    <ArrowRight size={18} />
                  </div>
                  <p className="ai-reco-why-title">Up next</p>
                  <h3>{secondaryRecommendation.title}</h3>
                  <p className="muted">{secondaryRecommendation.explanation}</p>
                  <p className="muted">
                    {secondaryRecommendation.matchScore}% match · {secondaryRecommendation.dateLabel}
                  </p>
                  <Button onClick={() => setSelectedActivityId(secondaryRecommendation.activityId)} type="button" variant="secondary">
                    Preview next recommendation
                  </Button>
                </>
              ) : (
                <>
                  <div className="ai-reco-next-icon-wrap">
                    <LoaderCircle size={18} />
                  </div>
                  <p className="ai-reco-why-title">Recommendation coverage</p>
                  <h3>No secondary match yet</h3>
                  <p className="muted">
                    The engine currently has {filteredRecommendations.length} result
                    {filteredRecommendations.length === 1 ? '' : 's'} for the active filter set.
                  </p>
                  <Button onClick={() => navigate('/browse')} type="button" variant="secondary">
                    Open activity browser
                  </Button>
                </>
              )}
            </Card>
          </div>
        )}
      </section>
    </VolunteerShell>
  );
}
