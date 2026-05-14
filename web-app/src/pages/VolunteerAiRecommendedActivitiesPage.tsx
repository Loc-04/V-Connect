import { CalendarDays, LoaderCircle, MapPin, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { Badge, Button, Card, Select } from '../components/ui';
import { VolunteerShell } from '../layouts/VolunteerShell';
import { formatActivityLocation } from '../lib/activityLocation';
import { createParticipation } from '../lib/participations';
import { usePrefetchActivityDetail } from '../lib/queries';
import { getVolunteerRecommendationPayload, logRecommendationInteraction } from '../lib/recommendations';
import type { ActivityLocation } from '../types/activity';
import type {
  RecommendationAiDecision,
  RecommendationFeatureContribution,
  RecommendationScoreBreakdown,
  RecommendedActivityRecord,
} from '../types/recommendation';
import './VolunteerAiRecommendedActivitiesPage.css';

type MatchFilter = 'all' | 'high' | 'weekend' | 'skill-based';
type SortMode = 'best-match' | 'soonest';
type MatchTier = 'strong_match' | 'good_match' | 'potential_match' | 'low_match';

interface RecommendationViewModel {
  activityId: string;
  recommendationItemId: string | null;
  title: string;
  organizerName: string;
  matchScore: number;
  matchTier: MatchTier;
  explanation: string;
  reasons: string[];
  reasonCodes: string[];
  scoreBreakdown: RecommendationScoreBreakdown | null;
  featureContributions: RecommendationFeatureContribution[];
  modelVersion: string | null;
  modelKind: string | null;
  provider: string | null;
  aiBadgeLabel: string | null;
  friendlyBadgeLabel: string | null;
  displayExplanation: string;
  displayReasons: string[];
  hasAiData: boolean;
  aiDecision: RecommendationAiDecision | null;
  recommendationGroup: string;
  ctaLabel: string;
  priorityLabel: string;
  decision: string;
  decisionReason: string;
  hasAvailabilitySignal: boolean;
  hasInterestSignal: boolean;
  matchedSkills: string[];
  locationLabel: string;
  dateLabel: string;
  timeLabel: string;
  hoursLabel: string;
  heroImageUrl: string;
  startTime: string;
}

function resolveMatchTier(rawTier: unknown, score: number): MatchTier {
  const normalized = String(rawTier ?? '').trim().toLowerCase();
  if (
    normalized === 'strong_match' ||
    normalized === 'good_match' ||
    normalized === 'potential_match' ||
    normalized === 'low_match'
  ) {
    return normalized;
  }

  if (score >= 75) {
    return 'strong_match';
  }
  if (score >= 50) {
    return 'good_match';
  }
  if (score >= 30) {
    return 'potential_match';
  }
  return 'low_match';
}

function matchTierLabel(tier: MatchTier): string {
  if (tier === 'strong_match') {
    return 'Strong match';
  }
  if (tier === 'good_match') {
    return 'Good match';
  }
  if (tier === 'potential_match') {
    return 'Potential match';
  }
  return 'Explore option';
}

function matchTierWeight(tier: MatchTier): number {
  if (tier === 'strong_match') {
    return 4;
  }
  if (tier === 'good_match') {
    return 3;
  }
  if (tier === 'potential_match') {
    return 2;
  }
  return 1;
}

function isStrongOrGoodMatch(tier: MatchTier): boolean {
  return tier === 'strong_match' || tier === 'good_match';
}

function formatMatchScore(score: number, usePrecise: boolean): string {
  const bounded = Math.max(0, Math.min(100, score));
  if (!usePrecise && Math.abs(bounded - Math.round(bounded)) < 0.05) {
    return `${Math.round(bounded)}%`;
  }
  return `${bounded.toFixed(1)}%`;
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

function shouldUsePreciseScoreDisplay(items: RecommendationViewModel[]): boolean {
  if (items.length < 2) {
    return false;
  }
  const roundedBuckets = new Map<number, number>();
  for (const item of items) {
    const rounded = Math.round(item.matchScore);
    roundedBuckets.set(rounded, (roundedBuckets.get(rounded) ?? 0) + 1);
  }
  return [...roundedBuckets.values()].some((count) => count > 1);
}

function toTitleCase(input: string): string {
  const value = String(input ?? '').trim();
  if (!value) {
    return '';
  }
  return value
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function joinReadableList(values: string[]): string {
  if (values.length === 0) {
    return '';
  }
  if (values.length === 1) {
    return values[0];
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function normalizeFeatureList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0);
}

function getFriendlyBadgeLabel(modelKind: string | null, provider: string | null): string {
  if (String(provider ?? '').trim().toLowerCase() === 'external') {
    return 'AI enhanced';
  }
  if (String(modelKind ?? '').trim().toLowerCase() === 'ml_logistic_regression_v1') {
    return 'AI-assisted';
  }
  return 'Profile-based';
}

function formatFriendlyReasons(item: RecommendationViewModel): string[] {
  const reasons: string[] = [];
  const skillHighlights = item.matchedSkills.map((skill) => toTitleCase(skill)).slice(0, 2);

  if (item.matchedSkills.length >= 2) {
    reasons.push(`Skills: ${joinReadableList(skillHighlights)}`);
  } else if (item.matchedSkills.length === 1) {
    reasons.push(`Skill: ${skillHighlights[0]}`);
  }

  if (item.hasAvailabilitySignal) {
    reasons.push('Fits your availability');
  }

  if (item.hasInterestSignal) {
    reasons.push('Matches your interests');
  }

  if (
    item.matchScore >= 30 &&
    (item.decision === 'consider' || item.matchTier === 'potential_match')
  ) {
    reasons.push('Potential match');
  }

  if (reasons.length === 0) {
    reasons.push(item.decision === 'recommend' ? 'Recommended for your profile' : 'Worth exploring');
  }

  return reasons.slice(0, 3);
}

function getFriendlyRecommendationCopy(item: RecommendationViewModel): string {
  const isPotential = item.decision === 'consider' || item.matchTier === 'potential_match' || item.matchTier === 'low_match';
  const skillHighlights = item.matchedSkills.map((skill) => toTitleCase(skill)).slice(0, 2);
  const hasSkillEvidence = skillHighlights.length > 0 || Number(item.scoreBreakdown?.skill_score ?? 0) > 0;
  const hasInterestEvidence = item.hasInterestSignal;
  const hasAvailabilityEvidence = item.hasAvailabilitySignal;

  if (!isPotential) {
    if (skillHighlights.length >= 2 && hasAvailabilityEvidence) {
      return `This activity matches several of your skills, including ${joinReadableList(skillHighlights)}, and fits one of your available time slots.`;
    }
    if (skillHighlights.length === 1 && hasAvailabilityEvidence) {
      return `This activity matches your ${skillHighlights[0]} skill and fits one of your available time slots.`;
    }
    if (skillHighlights.length >= 2) {
      return `This activity matches several of your skills, including ${joinReadableList(skillHighlights)}.`;
    }
    if (skillHighlights.length === 1) {
      return `This activity matches your ${skillHighlights[0]} skill.`;
    }
    if (hasAvailabilityEvidence && hasInterestEvidence) {
      return 'This activity aligns with your interests and fits your available time. It looks like a good fit.';
    }
    if (hasAvailabilityEvidence) {
      return 'This activity fits your available time and has enough profile alignment to be recommended.';
    }
    return 'This activity is recommended based on your current profile details.';
  }

  if (hasSkillEvidence && !hasInterestEvidence && !hasAvailabilityEvidence) {
    return 'This may be worth exploring because it matches part of your skills, but we need more details to rank it higher.';
  }

  if (hasSkillEvidence && hasAvailabilityEvidence) {
    return 'This may be worth exploring because it matches part of your profile, including skill and time availability.';
  }

  if (!hasAvailabilityEvidence && !hasInterestEvidence) {
    return 'This is only a partial match. Add interests and availability so we can rank activities more accurately.';
  }

  if (!hasAvailabilityEvidence) {
    return 'This is a partial match. Add availability so we can avoid suggesting activities at the wrong time.';
  }

  if (!hasInterestEvidence) {
    return 'This is a partial match. Add interests to help us understand which causes matter most to you.';
  }

  return 'This may be worth exploring because it matches part of your profile, but it is not a top recommendation yet.';
}

function getPrimaryBadgeLabel(item: RecommendationViewModel): string {
  if (item.decision === 'recommend') {
    return 'Recommended';
  }
  if (item.matchScore >= 30) {
    return 'Potential match';
  }
  return 'Explore option';
}

function toViewModel(record: RecommendedActivityRecord): RecommendationViewModel {
  const { dateLabel, timeLabel } = formatDateTime(record.startTime, record.endTime);
  const reasonCodes = normalizeReasonCodes(record.reason_codes);
  const scoreBreakdown = normalizeScoreBreakdown(record.score_breakdown);
  const featureContributions = normalizeFeatureContributions(record.feature_contributions);
  const modelVersion = String(record.model_version ?? '').trim() || null;
  const modelKind = String(record.model_kind ?? '').trim() || null;
  const provider = String(record.provider ?? '').trim() || null;
  const aiBadgeLabel = String(record.ai_badge_label ?? '').trim() || null;
  const featureSnapshot =
    record.feature_snapshot && typeof record.feature_snapshot === 'object' && !Array.isArray(record.feature_snapshot)
      ? record.feature_snapshot
      : null;
  const matchedSkills = normalizeFeatureList(featureSnapshot?.matched_skills);
  const matchedInterests = normalizeFeatureList(featureSnapshot?.matched_interests);
  const displayExplanation =
    String(record.display_explanation ?? '').trim() || String(record.explanation ?? '').trim();
  const displayReasonsRaw = Array.isArray(record.display_reasons) ? record.display_reasons : [];
  const displayReasons =
    displayReasonsRaw
      .map((reason) => String(reason ?? '').trim())
      .filter((reason) => reason.length > 0)
      .slice(0, 3);
  const hasAiData = Boolean(scoreBreakdown || featureContributions.length > 0 || reasonCodes.length > 0 || modelVersion);
  const rawScoreFromRatio = Number(record.matchRatio);
  const rawScoreFromMatch = Number(record.matchScore);
  const scoreFromRatio = Number.isFinite(rawScoreFromRatio) ? rawScoreFromRatio * 100 : Number.NaN;
  const rawFinalScore = Number.isFinite(scoreFromRatio)
    ? scoreFromRatio
    : Number.isFinite(rawScoreFromMatch)
      ? rawScoreFromMatch
      : Number(scoreBreakdown?.final_score ?? 0);
  const matchScore = Math.max(0, Math.min(100, Number(rawFinalScore.toFixed(1))));
  const aiDecision =
    record.ai_decision && typeof record.ai_decision === 'object' ? record.ai_decision : null;
  const decision = String(aiDecision?.decision ?? '').trim().toLowerCase() || 'recommend';
  const recommendationGroup = String(aiDecision?.recommendation_group ?? '').trim().toLowerCase() || 'recommended';
  const matchTier = resolveMatchTier(aiDecision?.match_tier ?? record.match_tier, matchScore);
  const decisionDisplayExplanation = String(aiDecision?.display_explanation ?? '').trim();
  const decisionDisplayReasons = Array.isArray(aiDecision?.display_reasons)
    ? aiDecision.display_reasons
        .map((reason) => String(reason ?? '').trim())
        .filter((reason) => reason.length > 0)
        .slice(0, 3)
    : [];
  const ctaLabel = String(aiDecision?.cta_label ?? '').trim();
  const priorityLabel = String(aiDecision?.priority_label ?? '').trim();
  const decisionReason = String(aiDecision?.decision_reason ?? '').trim().toLowerCase();
  const hasAvailabilitySignal =
    Number(scoreBreakdown?.availability_score ?? 0) > 0 || reasonCodes.includes('availability_overlap');
  const hasInterestSignal =
    Number(scoreBreakdown?.interest_score ?? 0) > 0 ||
    matchedInterests.length > 0 ||
    reasonCodes.includes('interest_overlap');

  return {
    activityId: record.activityId,
    recommendationItemId: typeof record.recommendation_item_id === 'string' ? record.recommendation_item_id : null,
    title: record.title,
    organizerName: record.organizerName || 'Organizer',
    matchScore,
    matchTier,
    explanation: record.explanation,
    reasons: Array.isArray(record.reasons) ? record.reasons.slice(0, 4) : [],
    reasonCodes,
    scoreBreakdown,
    featureContributions,
    modelVersion,
    modelKind,
    provider,
    aiBadgeLabel,
    friendlyBadgeLabel: getFriendlyBadgeLabel(modelKind, provider),
    displayExplanation: decisionDisplayExplanation || displayExplanation,
    displayReasons: decisionDisplayReasons.length > 0 ? decisionDisplayReasons : displayReasons,
    hasAiData,
    aiDecision,
    recommendationGroup,
    ctaLabel: ctaLabel || (decision === 'consider' ? 'Explore option' : 'Join now'),
    priorityLabel: priorityLabel || matchTierLabel(matchTier),
    decision,
    decisionReason,
    hasAvailabilitySignal,
    hasInterestSignal,
    matchedSkills,
    locationLabel: formatLocation(record.location),
    dateLabel,
    timeLabel,
    hoursLabel: toHoursLabel(record.hours),
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

function getRecommendationSubtitle({
  strongCount,
  hasPotentialOnly,
  hasAnyMatch,
}: {
  strongCount: number;
  hasPotentialOnly: boolean;
  hasAnyMatch: boolean;
}): string {
  if (strongCount > 0) {
    return `${strongCount} strong match${strongCount === 1 ? '' : 'es'} found based on your profile.`;
  }
  if (hasPotentialOnly) {
    return 'We found a few possible matches to explore.';
  }
  if (!hasAnyMatch) {
    return 'Set up your profile to get personalized recommendations.';
  }
  return 'Recommended activities based on your skills and availability.';
}

function getEmptyStateCopy(hasStarterRecommendations: boolean): { title: string; body: string; cta: string } {
  if (hasStarterRecommendations) {
    return {
      title: 'Add a little more detail to improve matches',
      body: 'Your skills are saved, but interests and availability help us rank activities more accurately.',
      cta: 'Manage skills & availability',
    };
  }

  return {
    title: 'Set up your profile to get recommendations',
    body: 'Add your skills, interests, and weekly availability so we can suggest activities that fit you.',
    cta: 'Update profile',
  };
}

export function VolunteerAiRecommendedActivitiesPage() {
  const navigate = useNavigate();
  const { profile, session } = useAuth();
  const prefetchActivityDetail = usePrefetchActivityDetail(session?.access_token ?? null, profile?.id ?? null);

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
        const payload = await getVolunteerRecommendationPayload(profile.id, session.access_token, 24);
        if (cancelled) {
          return;
        }

        const rows = Array.isArray(payload.activities) ? payload.activities : [];
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
      return (
        right.matchScore - left.matchScore ||
        matchTierWeight(right.matchTier) - matchTierWeight(left.matchTier) ||
        new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
      );
    });
    return sorted;
  }, [recommendations, matchFilter, sortMode]);

  const strongRecommendedItems = useMemo(
    () => filteredRecommendations.filter((item) => isStrongOrGoodMatch(item.matchTier)),
    [filteredRecommendations]
  );
  const lowConfidenceItems = useMemo(() => {
    return filteredRecommendations
      .filter((item) => !isStrongOrGoodMatch(item.matchTier))
      .slice(0, 8);
  }, [filteredRecommendations]);
  const hasStrongRecommendations = strongRecommendedItems.length > 0;
  const hasLowConfidenceMatches = !hasStrongRecommendations && lowConfidenceItems.length > 0;
  const hasStarterRecommendations = lowConfidenceItems.some((item) => item.decisionReason === 'cold_start_skill_match');
  const hasPotentialScoreBand = lowConfidenceItems.some((item) => item.matchScore >= 30);
  const pageSubtitle = useMemo(
    () =>
      getRecommendationSubtitle({
        strongCount: strongRecommendedItems.length,
        hasPotentialOnly: hasLowConfidenceMatches,
        hasAnyMatch: filteredRecommendations.length > 0,
      }),
    [filteredRecommendations.length, hasLowConfidenceMatches, strongRecommendedItems.length]
  );
  const emptyStateCopy = useMemo(() => getEmptyStateCopy(hasStarterRecommendations), [hasStarterRecommendations]);
  const selectableRecommendations = filteredRecommendations;
  const selectedRecommendation = useMemo(() => {
    const candidateList = selectableRecommendations;
    if (candidateList.length === 0) {
      return null;
    }

    return (
      candidateList.find((item) => item.activityId === selectedActivityId) ??
      candidateList[0]
    );
  }, [selectableRecommendations, selectedActivityId]);

  const secondaryRecommendation = useMemo(() => {
    if (!selectedRecommendation) {
      return null;
    }
    const strongAlternative = strongRecommendedItems.find(
      (item) => item.activityId !== selectedRecommendation.activityId
    );
    if (strongAlternative) {
      return strongAlternative;
    }
    return (
      filteredRecommendations.find((item) => item.activityId !== selectedRecommendation.activityId) ?? null
    );
  }, [filteredRecommendations, selectedRecommendation, strongRecommendedItems]);
  const considerOptions = useMemo(() => {
    return filteredRecommendations
      .filter(
        (item) =>
          item.activityId !== selectedRecommendation?.activityId &&
          item.activityId !== secondaryRecommendation?.activityId
      )
      .slice(0, 6);
  }, [filteredRecommendations, secondaryRecommendation?.activityId, selectedRecommendation?.activityId]);
  const shouldShowPreciseScores = useMemo(
    () => shouldUsePreciseScoreDisplay(filteredRecommendations),
    [filteredRecommendations]
  );
  const hasCloseScoreTie = shouldShowPreciseScores;

  useEffect(() => {
    if (!selectedRecommendation) {
      setSelectedActivityId('');
      return;
    }

    if (selectedRecommendation.activityId !== selectedActivityId) {
      setSelectedActivityId(selectedRecommendation.activityId);
    }
  }, [selectedActivityId, selectedRecommendation]);

  const handleViewDetails = (activityId: string, recommendationItemId: string | null) => {
    if (session?.access_token && recommendationItemId) {
      void logRecommendationInteraction(
        {
          eventType: 'detail_open',
          servingItemId: recommendationItemId,
          activityId,
          sourceSurface: 'web',
        },
        session.access_token
      ).catch(() => {
        // Best-effort analytics logging only.
      });
    }
    void prefetchActivityDetail(activityId);
    const query = recommendationItemId ? `?recommendationItemId=${encodeURIComponent(recommendationItemId)}` : '';
    navigate(`/volunteer/activity/${activityId}${query}`);
  };

  const handleJoin = async (activityId: string, recommendationItemId: string | null) => {
    if (!session?.access_token) {
      setError('No active session token.');
      setMessage(null);
      return;
    }

    setJoiningActivityId(activityId);
    setError(null);
    setMessage(null);

    try {
      const result = await createParticipation(activityId, session.access_token, {
        recommendationItemId,
      });
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
      pageSubtitle={pageSubtitle}
      pageTitle="Recommended Activities"
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
                <option value="all">Recommended items</option>
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
            </div>

            <p className="ai-reco-state-note">
              {hasStrongRecommendations
                ? `Showing ${strongRecommendedItems.length} strong recommendation${strongRecommendedItems.length === 1 ? '' : 's'}`
                : hasLowConfidenceMatches
                  ? `Showing ${lowConfidenceItems.length} activities worth exploring`
                  : 'No confident matches yet'}
            </p>
          </div>
        </div>

        {loading ? (
          <Card className="ai-reco-loading-card">
            <LoaderCircle className="ai-reco-loading-icon" />
            <p>Loading your recommendations...</p>
          </Card>
        ) : hasStrongRecommendations ? (
          <div className="ai-reco-main-grid">
            {selectedRecommendation ? (
              <Card as="article" className="ai-reco-featured-card">
                <div className="ai-reco-image-wrap">
                  <img alt={selectedRecommendation.title} className="ai-reco-image" src={selectedRecommendation.heroImageUrl} />
                  <span className="ai-reco-match-pill">
                    <Star size={12} />
                    {formatMatchScore(selectedRecommendation.matchScore, shouldShowPreciseScores)} match
                  </span>
                </div>

                <div className="ai-reco-featured-body">
                  <div className="ai-reco-category-row">
                    <Badge className="ai-reco-category-badge" tone="accent">
                      {getPrimaryBadgeLabel(selectedRecommendation)}
                    </Badge>
                    <Badge className="ai-reco-category-badge" tone={selectedRecommendation.matchTier === 'low_match' ? 'neutral' : 'success'}>
                      {matchTierLabel(selectedRecommendation.matchTier)}
                    </Badge>
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
                    {selectedRecommendation.friendlyBadgeLabel && <span>{selectedRecommendation.friendlyBadgeLabel}</span>}
                  </div>

                  <div className="ai-reco-why-card">
                    <p className="ai-reco-why-title">
                      {selectedRecommendation.decision === 'consider'
                        ? 'Why this is a potential match'
                        : 'Why this is recommended'}
                    </p>
                    <p>{getFriendlyRecommendationCopy(selectedRecommendation)}</p>
                    <div className="ai-reco-why-tags">
                      {formatFriendlyReasons(selectedRecommendation).map((reason) => (
                        <Badge className="ai-reco-reason-tag" key={reason} tone="info">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                    {hasCloseScoreTie ? (
                      <p className="ai-reco-score-note">
                        Close scores can come from different factor mixes. Badges show top contributors, not the full formula.
                      </p>
                    ) : null}
                  </div>

                  <div className="ai-reco-cta-row">
                    <Button
                      className="ai-reco-view-btn"
                      onClick={() =>
                        void handleViewDetails(
                          selectedRecommendation.activityId,
                          selectedRecommendation.recommendationItemId
                        )
                      }
                      type="button"
                    >
                      View details
                    </Button>
                    <Button
                      className="ai-reco-join-btn"
                      disabled={joiningActivityId === selectedRecommendation.activityId}
                      onClick={() =>
                        void handleJoin(
                          selectedRecommendation.activityId,
                          selectedRecommendation.recommendationItemId
                        )
                      }
                      type="button"
                      variant="secondary"
                    >
                      {joiningActivityId === selectedRecommendation.activityId
                        ? 'Joining...'
                        : selectedRecommendation.ctaLabel}
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="ai-reco-missing-selected">
                <p className="muted">
                  No confident matches yet. Add more skills, interests, or availability to improve your recommendations.
                </p>
                <Button onClick={() => navigate('/browse')} type="button" variant="secondary">
                  Browse all opportunities
                </Button>
              </Card>
            )}

            <Card as="article" className="ai-reco-next-card">
              {secondaryRecommendation ? (
                <>
                  <div className="ai-reco-next-icon-wrap">
                    <Star size={16} />
                  </div>
                  <p className="ai-reco-why-title">Up next</p>
                  <h3>{secondaryRecommendation.title}</h3>
                  <p className="muted">{getFriendlyRecommendationCopy(secondaryRecommendation)}</p>
                  <p className="muted">
                    {matchTierLabel(secondaryRecommendation.matchTier)} - {formatMatchScore(secondaryRecommendation.matchScore, shouldShowPreciseScores)} match -{' '}
                    {secondaryRecommendation.dateLabel}
                  </p>
                  <Button onClick={() => setSelectedActivityId(secondaryRecommendation.activityId)} type="button" variant="secondary">
                    Preview next recommendation
                  </Button>
                </>
              ) : (
                <>
                  <div className="ai-reco-next-icon-wrap">
                    <Star size={16} />
                  </div>
                  <p className="ai-reco-why-title">Recommendation coverage</p>
                  <h3>No secondary match yet</h3>
                  <p className="muted">
                    You currently have {filteredRecommendations.length} result
                    {filteredRecommendations.length === 1 ? '' : 's'} for the active filter set.
                  </p>
                  <Button onClick={() => navigate('/browse')} type="button" variant="secondary">
                    Open activity browser
                  </Button>
                </>
              )}
            </Card>
          </div>
        ) : hasLowConfidenceMatches ? (
          <div className="ai-reco-low-confidence-layout">
            <Card as="section" className="ai-reco-low-hero">
              <div>
                <h2>{hasStarterRecommendations ? 'Add a little more detail to improve matches' : 'No confident matches yet'}</h2>
                <p>
                  {hasStarterRecommendations
                    ? 'Your skills are saved, but interests and availability help us rank activities more accurately.'
                    : 'We could not find a strong match from your current profile. Add more skills, interests, or availability to improve your recommendations.'}
                </p>
              </div>
              <div className="ai-reco-low-hero-actions">
                <Button onClick={() => navigate('/volunteer/profile-ui')} type="button" variant="primary">
                  {hasStarterRecommendations ? 'Manage skills & availability' : 'Update profile'}
                </Button>
                <Button onClick={() => navigate('/browse')} type="button" variant="secondary">
                  Browse all opportunities
                </Button>
              </div>
            </Card>

            <Card as="section" className="ai-reco-partial-section">
              <div className="ai-reco-partial-head">
                <h3>{hasPotentialScoreBand ? 'Potential matches' : 'Explore options'}</h3>
                <p>
                  {hasPotentialScoreBand
                    ? hasStarterRecommendations
                      ? 'These matches can be a good start, but adding interests and availability will improve ranking quality.'
                      : 'These are not top recommendations, but they may still be worth checking.'
                    : 'These options have low current profile alignment and are shown for exploration only.'}
                </p>
              </div>
              <div className="ai-reco-partial-grid">
                {lowConfidenceItems.map((item) => (
                  <article className="ai-reco-partial-card" key={item.activityId}>
                    <div className="ai-reco-partial-top">
                      <Badge tone="accent">{formatMatchScore(item.matchScore, shouldShowPreciseScores)} match</Badge>
                      <Badge tone={item.matchTier === 'low_match' ? 'neutral' : 'info'}>
                        {matchTierLabel(item.matchTier)}
                      </Badge>
                    </div>
                    <h4>{item.title}</h4>
                    <p className="ai-reco-partial-organizer">Hosted by {item.organizerName}</p>
                    <p className="ai-reco-partial-explanation">{getFriendlyRecommendationCopy(item)}</p>
                    <div className="ai-reco-why-tags">
                      {formatFriendlyReasons(item).map((reason) => (
                        <Badge className="ai-reco-reason-tag" key={reason} tone="info">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                    {hasCloseScoreTie ? (
                      <p className="ai-reco-score-note">Similar overall score, different contributing factors.</p>
                    ) : null}
                    <p className="ai-reco-partial-meta">
                      {item.dateLabel} | {item.locationLabel}
                    </p>
                    <Button
                      onClick={() => void handleViewDetails(item.activityId, item.recommendationItemId)}
                      type="button"
                      variant="secondary"
                    >
                      View details
                    </Button>
                  </article>
                ))}
              </div>
            </Card>
          </div>
        ) : (
          <Card as="section" className="ai-reco-low-hero">
            <div>
              <h2>{emptyStateCopy.title}</h2>
              <p>
                {emptyStateCopy.body}
              </p>
            </div>
            <div className="ai-reco-low-hero-actions">
              <Button onClick={() => navigate('/volunteer/profile-ui')} type="button" variant="primary">
                {emptyStateCopy.cta}
              </Button>
              <Button onClick={() => navigate('/browse')} type="button" variant="secondary">
                Browse all opportunities
              </Button>
            </div>
          </Card>
        )}

        {!loading && hasStrongRecommendations && considerOptions.length > 0 && (
          <Card as="section" className="ai-reco-next-card">
            <div className="ai-reco-partial-head">
              <h3>Other options to explore</h3>
              <p>These are not top recommendations, but they may still be worth checking.</p>
            </div>
            <div className="ai-reco-partial-grid">
              {considerOptions.map((item) => (
                <article className="ai-reco-partial-card" key={item.activityId}>
                  <div className="ai-reco-partial-top">
                    <Badge tone="accent">{formatMatchScore(item.matchScore, shouldShowPreciseScores)} match</Badge>
                    <Badge tone={item.matchTier === 'low_match' ? 'neutral' : 'info'}>{matchTierLabel(item.matchTier)}</Badge>
                  </div>
                  <h4>{item.title}</h4>
                  <p className="ai-reco-partial-organizer">Hosted by {item.organizerName}</p>
                  <p className="ai-reco-partial-explanation">{getFriendlyRecommendationCopy(item)}</p>
                  <div className="ai-reco-why-tags">
                    {formatFriendlyReasons(item).map((reason) => (
                      <Badge className="ai-reco-reason-tag" key={reason} tone="info">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                  {hasCloseScoreTie ? (
                    <p className="ai-reco-score-note">Similar overall score, different contributing factors.</p>
                  ) : null}
                  <Button
                    onClick={() => void handleViewDetails(item.activityId, item.recommendationItemId)}
                    type="button"
                    variant="secondary"
                  >
                    View details
                  </Button>
                </article>
              ))}
            </div>
          </Card>
        )}
      </section>
    </VolunteerShell>
  );
}
