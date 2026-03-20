import { CalendarDays, LoaderCircle, RefreshCw, Sparkles, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { Badge, Button, Card, Select, Table } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { listActivities } from '../lib/activities';
import { getRecommendationsForActivity } from '../lib/recommendations';
import type { ActivityRecord } from '../types/activity';
import type { RecommendedVolunteerRecord } from '../types/recommendation';
import './OrganizerRecommendationsPage.css';

type RecommendationFilter = 'all' | 'strong-fit' | 'weekend' | 'experienced';

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Schedule TBD';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function activityCanUseRecommendations(activity: ActivityRecord) {
  const status = String(activity.status ?? '').toLowerCase();
  return status === 'draft' || status === 'published';
}

function availabilityLabel(volunteer: RecommendedVolunteerRecord) {
  const flags = volunteer.availability ?? {};
  const labels = [];

  if (flags.weekdays) {
    labels.push('Weekdays');
  }
  if (flags.weekends) {
    labels.push('Weekends');
  }
  if (flags.evenings) {
    labels.push('Evenings');
  }

  return labels.length > 0 ? labels.join(', ') : 'No availability set';
}

function isStrongFit(volunteer: RecommendedVolunteerRecord) {
  return volunteer.matchScore >= 60;
}

function isWeekendReady(volunteer: RecommendedVolunteerRecord) {
  return Boolean(volunteer.availability?.weekends);
}

function isExperienced(volunteer: RecommendedVolunteerRecord) {
  return Number(volunteer.totalHours ?? 0) >= 10;
}

export function OrganizerRecommendationsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();

  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [recommendations, setRecommendations] = useState<RecommendedVolunteerRecord[]>([]);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RecommendationFilter>('all');
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadActivities = useCallback(async () => {
    if (!session?.access_token) {
      setLoadingActivities(false);
      setError('No active session token.');
      return;
    }

    setLoadingActivities(true);
    setError(null);

    try {
      const rows = await listActivities({
        accessToken: session.access_token,
        mine: true,
        status: 'all',
        limit: 120,
      });

      const eligibleActivities = rows.filter(activityCanUseRecommendations);
      const requestedActivityId = searchParams.get('activityId')?.trim() ?? '';

      setActivities(eligibleActivities);
      setSelectedActivityId((current) => {
        const candidateId =
          (requestedActivityId && eligibleActivities.some((activity) => activity.id === requestedActivityId)
            ? requestedActivityId
            : '') ||
          (current && eligibleActivities.some((activity) => activity.id === current) ? current : '') ||
          eligibleActivities[0]?.id ||
          '';

        return candidateId;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load organizer activities.');
    } finally {
      setLoadingActivities(false);
    }
  }, [searchParams, session?.access_token]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const loadRecommendations = useCallback(
    async (activityId: string) => {
      if (!session?.access_token || !activityId) {
        setRecommendations([]);
        setSelectedVolunteerId(null);
        setLoadingRecommendations(false);
        return;
      }

      setLoadingRecommendations(true);
      setError(null);

      try {
        const response = await getRecommendationsForActivity(activityId, session.access_token, 20);
        setRecommendations(response.volunteers ?? []);
        setSelectedVolunteerId((current) => {
          if (current && response.volunteers.some((volunteer) => volunteer.userId === current)) {
            return current;
          }
          return response.volunteers[0]?.userId ?? null;
        });
      } catch (loadError) {
        setRecommendations([]);
        setSelectedVolunteerId(null);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load volunteer recommendations.');
      } finally {
        setLoadingRecommendations(false);
      }
    },
    [session?.access_token]
  );

  useEffect(() => {
    void loadRecommendations(selectedActivityId);
  }, [loadRecommendations, selectedActivityId]);

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.id === selectedActivityId) ?? null,
    [activities, selectedActivityId]
  );

  const filteredRecommendations = useMemo(() => {
    return recommendations.filter((volunteer) => {
      if (filter === 'strong-fit') {
        return isStrongFit(volunteer);
      }
      if (filter === 'weekend') {
        return isWeekendReady(volunteer);
      }
      if (filter === 'experienced') {
        return isExperienced(volunteer);
      }
      return true;
    });
  }, [filter, recommendations]);

  const selectedVolunteer = useMemo(() => {
    if (filteredRecommendations.length === 0) {
      return null;
    }

    return (
      filteredRecommendations.find((volunteer) => volunteer.userId === selectedVolunteerId) ??
      filteredRecommendations[0]
    );
  }, [filteredRecommendations, selectedVolunteerId]);

  useEffect(() => {
    if (!selectedVolunteer) {
      setSelectedVolunteerId(null);
      return;
    }

    if (selectedVolunteer.userId !== selectedVolunteerId) {
      setSelectedVolunteerId(selectedVolunteer.userId);
    }
  }, [selectedVolunteer, selectedVolunteerId]);

  const metrics = useMemo(() => {
    const total = recommendations.length;
    const strongFitCount = recommendations.filter(isStrongFit).length;
    const weekendReadyCount = recommendations.filter(isWeekendReady).length;
    const averageMatch =
      total > 0 ? Math.round(recommendations.reduce((sum, volunteer) => sum + volunteer.matchScore, 0) / total) : 0;

    return {
      total,
      strongFitCount,
      weekendReadyCount,
      averageMatch,
    };
  }, [recommendations]);

  const loading = loadingActivities || loadingRecommendations;

  return (
    <OrganizerShell
      activeNav="recommendations"
      headerActions={
        <>
          <Button onClick={() => void loadRecommendations(selectedActivityId)} type="button" variant="secondary">
            <RefreshCw size={15} />
            <span>Refresh Recommendations</span>
          </Button>
          <Button onClick={() => navigate('/organizer/activities')} type="button" variant="secondary">
            Manage Activities
          </Button>
        </>
      }
      onSearchChange={() => {}}
      pageContext={<span className="org-reco-context">Sprint 3 Matching</span>}
      pageSubtitle="Review volunteer recommendations for each activity based on skills, interests, availability, and recorded hours."
      pageTitle="Volunteer Recommendations"
    >
      <section className="org-reco-page">
        <section className="org-reco-main">
          <Card as="section" className="org-reco-hero">
            <div className="org-reco-hero-copy">
              <p className="org-reco-eyebrow">Select activity</p>
              <Select
                className="org-reco-activity-select"
                disabled={loadingActivities || activities.length === 0}
                onChange={(event) => setSelectedActivityId(event.target.value)}
                value={selectedActivityId}
              >
                {activities.length === 0 ? (
                  <option value="">No eligible activities</option>
                ) : (
                  activities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.title}
                    </option>
                  ))
                )}
              </Select>
              <p className="muted">
                {selectedActivity ? formatDateLabel(selectedActivity.start_time) : 'Create or publish an activity first.'}
              </p>
            </div>

            <div className="org-reco-metrics">
              <div className="org-reco-metric">
                <span className="org-reco-metric-icon">
                  <UsersRound size={15} />
                </span>
                <p>Recommended volunteers</p>
                <strong>{metrics.total}</strong>
              </div>
              <div className="org-reco-metric">
                <span className="org-reco-metric-icon is-highlight">
                  <Sparkles size={15} />
                </span>
                <p>Average match</p>
                <strong>{metrics.averageMatch}%</strong>
              </div>
              <div className="org-reco-metric">
                <span className="org-reco-metric-icon is-success">
                  <CalendarDays size={15} />
                </span>
                <p>Weekend ready</p>
                <strong>{metrics.weekendReadyCount}</strong>
              </div>
            </div>
          </Card>

          <Card as="section" className="org-reco-table-shell">
            <div className="org-reco-toolbar">
              <div className="org-reco-filter-tabs" role="tablist" aria-label="Recommendation filter">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'strong-fit', label: 'Strong Fit' },
                  { key: 'weekend', label: 'Weekend Ready' },
                  { key: 'experienced', label: 'Experienced' },
                ].map((item) => (
                  <button
                    className={filter === item.key ? 'org-reco-filter-tab is-active' : 'org-reco-filter-tab'}
                    key={item.key}
                    onClick={() => setFilter(item.key as RecommendationFilter)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <small className="org-reco-toolbar-note">
                Strong fits: <strong>{metrics.strongFitCount}</strong>
              </small>
            </div>

            {error && <p className="form-error">{error}</p>}
            {loading ? (
              <div className="org-reco-loading-state">
                <LoaderCircle className="org-reco-loading-icon" />
                <p>Loading organizer recommendations...</p>
              </div>
            ) : activities.length === 0 ? (
              <div className="org-reco-empty-state">
                <p className="muted">Organizer role has no draft or published activities yet.</p>
                <Button onClick={() => navigate('/activities/create')} type="button">
                  Create Activity
                </Button>
              </div>
            ) : (
              <Table className="org-reco-table" wrapperClassName="org-reco-table-wrap">
                <thead>
                  <tr>
                    <th>Volunteer</th>
                    <th>Skills</th>
                    <th>Interests</th>
                    <th>Match</th>
                    <th>Hours</th>
                    <th>Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecommendations.map((volunteer) => (
                    <tr
                      className={selectedVolunteer?.userId === volunteer.userId ? 'is-selected' : ''}
                      key={volunteer.userId}
                      onClick={() => setSelectedVolunteerId(volunteer.userId)}
                    >
                      <td>
                        <div className="org-reco-volunteer-cell">
                          {volunteer.avatarUrl ? (
                            <img alt={volunteer.fullName} className="org-reco-avatar" src={volunteer.avatarUrl} />
                          ) : (
                            <span className="org-reco-avatar-fallback">{getInitials(volunteer.fullName)}</span>
                          )}
                          <div>
                            <strong>{volunteer.fullName}</strong>
                            <small>{volunteer.explanation}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="org-reco-badge-list">
                          {volunteer.skills.length > 0 ? (
                            volunteer.skills.slice(0, 2).map((skill) => (
                              <Badge className="org-reco-mini-badge" key={`${volunteer.userId}-${skill}`} tone="info">
                                {skill}
                              </Badge>
                            ))
                          ) : (
                            <span className="muted">No skills</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="org-reco-badge-list">
                          {volunteer.interests.length > 0 ? (
                            volunteer.interests.slice(0, 2).map((interest) => (
                              <Badge
                                className="org-reco-mini-badge"
                                key={`${volunteer.userId}-${interest}`}
                                tone="neutral"
                              >
                                {interest}
                              </Badge>
                            ))
                          ) : (
                            <span className="muted">No interests</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="org-reco-match-pill">{volunteer.matchScore}% Match</span>
                      </td>
                      <td>{volunteer.totalHours}h</td>
                      <td>{availabilityLabel(volunteer)}</td>
                    </tr>
                  ))}

                  {filteredRecommendations.length === 0 && (
                    <tr>
                      <td className="org-reco-empty-cell" colSpan={6}>
                        No volunteers matched the current recommendation filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            )}
          </Card>
        </section>

        <aside className="org-reco-detail">
          <Card as="section" className="org-reco-detail-card">
            <h3>Recommendation Detail</h3>

            {selectedVolunteer ? (
              <>
                <div className="org-reco-detail-identity">
                  {selectedVolunteer.avatarUrl ? (
                    <img alt={selectedVolunteer.fullName} className="org-reco-detail-avatar" src={selectedVolunteer.avatarUrl} />
                  ) : (
                    <span className="org-reco-detail-avatar-fallback">{getInitials(selectedVolunteer.fullName)}</span>
                  )}
                  <strong>{selectedVolunteer.fullName}</strong>
                  <p>{selectedVolunteer.matchScore}% Match Score</p>
                </div>

                <div className="org-reco-detail-actions">
                  <Button onClick={() => navigate('/organizer/registrations')} type="button">
                    Open Registrations
                  </Button>
                  <Button onClick={() => navigate(`/organizer/activities`)} type="button" variant="secondary">
                    Back to Activities
                  </Button>
                </div>

                <div className="org-reco-score-block">
                  <p>
                    Match Score <span>{selectedVolunteer.matchScore}%</span>
                  </p>
                  <div className="org-reco-score-track">
                    <div className="org-reco-score-fill" style={{ width: `${selectedVolunteer.matchScore}%` }} />
                  </div>

                  <p>
                    Recorded Hours <span>{selectedVolunteer.totalHours}h</span>
                  </p>
                  <div className="org-reco-score-track">
                    <div
                      className="org-reco-score-fill is-secondary"
                      style={{ width: `${Math.min(100, selectedVolunteer.totalHours * 4)}%` }}
                    />
                  </div>
                </div>

                <div className="org-reco-insight">
                  <h4>Why this volunteer</h4>
                  <p>{selectedVolunteer.explanation}</p>
                  <div className="org-reco-badge-list">
                    {selectedVolunteer.reasons.map((reason) => (
                      <Badge className="org-reco-mini-badge" key={reason} tone="accent">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="org-reco-note">
                  <h4>Skills & Interests</h4>
                  <p>
                    <strong>Skills:</strong>{' '}
                    {selectedVolunteer.skills.length > 0 ? selectedVolunteer.skills.join(', ') : 'No skills provided'}
                  </p>
                  <p>
                    <strong>Interests:</strong>{' '}
                    {selectedVolunteer.interests.length > 0
                      ? selectedVolunteer.interests.join(', ')
                      : 'No interests provided'}
                  </p>
                </div>

                <div className="org-reco-note">
                  <h4>Availability</h4>
                  <p>{availabilityLabel(selectedVolunteer)}</p>
                  {selectedVolunteer.availabilityNote && <p>{selectedVolunteer.availabilityNote}</p>}
                </div>
              </>
            ) : (
              <p className="muted">Select a volunteer recommendation to inspect the match details.</p>
            )}
          </Card>
        </aside>
      </section>
    </OrganizerShell>
  );
}
