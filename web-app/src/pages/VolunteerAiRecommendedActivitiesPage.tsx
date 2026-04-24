import { ArrowRight, CalendarDays, LoaderCircle, MapPin, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { Badge, Button, Card, Select } from '../components/ui';
import { VolunteerShell } from '../layouts/VolunteerShell';
import { formatActivityLocation } from '../lib/activityLocation';
import { createParticipation } from '../lib/participations';
import { getRecommendedActivitiesForVolunteer } from '../lib/recommendations';
import type { ActivityLocation } from '../types/activity';
import type {
  RecommendationFeatureContribution,
  RecommendationScoreBreakdown,
  RecommendedActivityRecord,
} from '../types/recommendation';
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
  reasonCodes: string[];
  scoreBreakdown: RecommendationScoreBreakdown | null;
  featureContributions: RecommendationFeatureContribution[];
  modelVersion: string | null;
  hasAiData: boolean;
  locationLabel: string;
  dateLabel: string;
  timeLabel: string;
  hoursLabel: string;
  categories: string[];
  heroImageUrl: string;
  startTime: string;
}

function formatLocation(location: ActivityLocation | string | null): string {
  return formatActivityLocation(location);
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

function normalizeReasonCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? '').trim().toLowerCase())
    .filter((item) => item.length > 0)
    .slice(0, 6);
}

function normalizeFeatureContributions(value: unknown): RecommendationFeatureContribution[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as RecommendationFeatureContribution;
      return {
        feature: String(row.feature ?? '').trim(),
        score: Number(row.score ?? 0),
        max_score: Number(row.max_score ?? 0),
        detail: String(row.detail ?? '').trim(),
      };
    })
    .filter((item) => item.feature.length > 0)
    .slice(0, 5);
}

function normalizeScoreBreakdown(value: unknown): RecommendationScoreBreakdown | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const item = value as RecommendationScoreBreakdown;
  return {
    skill_score: Number(item.skill_score ?? 0),
    interest_score: Number(item.interest_score ?? 0),
    availability_score: Number(item.availability_score ?? 0),
    experience_score: Number(item.experience_score ?? 0),
    history_score: Number(item.history_score ?? 0),
    final_score: Number(item.final_score ?? 0),
  };
}

function humanizeReasonCode(code: string): string {
  const dictionary: Record<string, string> = {
    skills_full_match: 'Full skill match',
    skills_partial_match: 'Partial skill match',
    skills_not_required_profile_has_skills: 'Profile skills support this activity',
    interest_overlap: 'Interest overlap',
    availability_overlap: 'Availability overlap',
    experience_signal: 'Experience signal',
    organizer_history_signal: 'Prior organizer history',
  };
  const normalized = String(code ?? '').trim().toLowerCase();
  return dictionary[normalized] ?? normalized.replace(/_/g, ' ');
}

function toViewModel(record: RecommendedActivityRecord): RecommendationViewModel {
  const { dateLabel, timeLabel } = formatDateTime(record.startTime, record.endTime);
  const reasonCodes = normalizeReasonCodes(record.reason_codes);
  const scoreBreakdown = normalizeScoreBreakdown(record.score_breakdown);
  const featureContributions = normalizeFeatureContributions(record.feature_contributions);
  const modelVersion = String(record.model_version ?? '').trim() || null;
  const hasAiData = Boolean(scoreBreakdown || featureContributions.length > 0 || reasonCodes.length > 0 || modelVersion);

  return {
    activityId: record.activityId,
    title: record.title,
    organizerName: record.organizerName || 'Organizer',
    matchScore: Math.max(0, Math.min(100, Math.round(record.matchScore))),
    explanation: record.explanation,
    reasons: Array.isArray(record.reasons) ? record.reasons.slice(0, 4) : [],
    reasonCodes,
    scoreBreakdown,
    featureContributions,
    modelVersion,
    hasAiData,
    locationLabel: formatLocation(record.location),
    dateLabel,
    timeLabel,
    hoursLabel: toHoursLabel(record.hours),
    categories: toCategoryList(record),
    heroImageUrl: String(record.coverImageUrl ?? '').trim(),
    startTime: record.startTime,
  };
}

function hasWeekendSignal(item: RecommendationViewModel) {
  return (
    Number(item.scoreBreakdown?.availability_score ?? 0) > 0 ||
    item.reasonCodes.includes('availability_overlap') ||
    item.reasons.some((reason) => reason.toLowerCase().includes('weekend'))
  );
}

function hasSkillSignal(item: RecommendationViewModel) {
  return (
    Number(item.scoreBreakdown?.skill_score ?? 0) > 0 ||
    item.reasonCodes.some((code) => code.startsWith('skills_')) ||
    item.reasons.some((reason) => reason.toLowerCase().includes('skill'))
  );
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

  const hasStructuredAiData = useMemo(
    () => recommendations.some((item) => item.hasAiData),
    [recommendations]
  );

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
      pageSubtitle={
        hasStructuredAiData
          ? 'Recommendations are ranked from structured profile/activity signals with score breakdowns.'
          : 'Recommendations are ranked from profile and activity signals.'
      }
      pageTitle={hasStructuredAiData ? 'AI Recommended Activities' : 'Recommended Activities'}
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
                      {selectedRecommendation.dateLabel} - {selectedRecommendation.timeLabel}
                    </span>
                    <span>
                      <MapPin size={15} />
                      {selectedRecommendation.locationLabel}
                    </span>
                    <span>{selectedRecommendation.hoursLabel}</span>
                    {selectedRecommendation.modelVersion && <span>Model: {selectedRecommendation.modelVersion}</span>}
                  </div>

                  <div className="ai-reco-why-card">
                    <p className="ai-reco-why-title">
                      {selectedRecommendation.hasAiData ? 'Why this was recommended' : 'Recommendation summary'}
                    </p>
                    <p>{selectedRecommendation.explanation || 'Score is calculated from profile and activity signals.'}</p>
                    <div className="ai-reco-why-tags">
                      {selectedRecommendation.reasonCodes.length > 0
                        ? selectedRecommendation.reasonCodes.map((reasonCode) => (
                            <Badge className="ai-reco-reason-tag" key={reasonCode} tone="info">
                              {humanizeReasonCode(reasonCode)}
                            </Badge>
                          ))
                        : selectedRecommendation.reasons.map((reason) => (
                            <Badge className="ai-reco-reason-tag" key={reason} tone="info">
                              {reason}
                            </Badge>
                          ))}
                    </div>
                  </div>

                  {selectedRecommendation.scoreBreakdown && (
                    <div className="ai-reco-breakdown-card">
                      <p className="ai-reco-why-title">Score breakdown</p>
                      <div className="ai-reco-breakdown-grid">
                        <span>Skills: {Math.round(selectedRecommendation.scoreBreakdown.skill_score)}</span>
                        <span>Interests: {Math.round(selectedRecommendation.scoreBreakdown.interest_score)}</span>
                        <span>Availability: {Math.round(selectedRecommendation.scoreBreakdown.availability_score)}</span>
                        <span>Experience: {Math.round(selectedRecommendation.scoreBreakdown.experience_score)}</span>
                        <span>History: {Math.round(selectedRecommendation.scoreBreakdown.history_score)}</span>
                        <span>Total: {Math.round(selectedRecommendation.scoreBreakdown.final_score)}</span>
                      </div>
                    </div>
                  )}

                  {selectedRecommendation.featureContributions.length > 0 && (
                    <div className="ai-reco-breakdown-card">
                      <p className="ai-reco-why-title">Feature contributions</p>
                      <ul className="ai-reco-contribution-list">
                        {selectedRecommendation.featureContributions.map((item) => (
                          <li key={`${selectedRecommendation.activityId}-${item.feature}`}>
                            <strong>
                              {item.feature}: {Math.round(item.score)}/{Math.round(item.max_score)}
                            </strong>
                            <span>{item.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

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
                    {secondaryRecommendation.matchScore}% match - {secondaryRecommendation.dateLabel}
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
