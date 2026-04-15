import { CheckCircle2, Search, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { Badge, Button, Card, Select, Table } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { listActivities } from '../lib/activities';
import { approveRegistration, listActivityRegistrations, rejectRegistration } from '../lib/registrations';
import type { ActivityRecord } from '../types/activity';
import type { ParticipationRecord } from '../types/participation';
import './OrganizerRegistrationApprovalPage.css';

const PAGE_SIZE = 6;

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface ApplicantViewModel {
  participation: ParticipationRecord;
  activity: ActivityRecord | null;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  matchScore: number;
  skills: string[];
}

function normalizeMatchScore(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  if (value <= 1) {
    return Math.max(0, Math.min(100, Math.round(value * 100)));
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function toTitleCase(value: string) {
  if (!value) {
    return 'Unknown';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getStatusTone(status: string) {
  if (status === 'approved' || status === 'checked_in') {
    return 'success' as const;
  }
  if (status === 'rejected' || status === 'cancelled') {
    return 'danger' as const;
  }
  return 'info' as const;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function statusSortWeight(status: string) {
  if (status === 'pending') {
    return 0;
  }
  if (status === 'approved') {
    return 1;
  }
  if (status === 'checked_in') {
    return 2;
  }
  return 3;
}

export function OrganizerRegistrationApprovalPage() {
  const { session } = useAuth();

  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [participations, setParticipations] = useState<ParticipationRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ApprovalStatus>('pending');
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [applicantsLoading, setApplicantsLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadActiveActivities = useCallback(async () => {
    if (!session?.access_token) {
      setActivitiesLoading(false);
      setError('No active session token.');
      return;
    }

    setActivitiesLoading(true);
    setError(null);

    try {
      const activityRows = await listActivities({
        accessToken: session.access_token,
        mine: true,
        status: 'published',
        limit: 120,
      });
      setActivities(activityRows);
      setSelectedActivityId((current) => {
        if (current && activityRows.some((activity) => activity.id === current)) {
          return current;
        }
        return activityRows[0]?.id ?? '';
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load active activities.');
    } finally {
      setActivitiesLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadActiveActivities();
  }, [loadActiveActivities]);

  const loadApplicantsForActivity = useCallback(
    async (activityId: string) => {
      if (!session?.access_token || !activityId) {
        setParticipations([]);
        setApplicantsLoading(false);
        return;
      }

      setApplicantsLoading(true);
      setError(null);

      try {
        const participationRows = await listActivityRegistrations(activityId, session.access_token);
        setParticipations(participationRows);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load applicants for activity.');
      } finally {
        setApplicantsLoading(false);
      }
    },
    [session?.access_token]
  );

  useEffect(() => {
    setSelectedIds([]);
    setSelectedApplicantId(null);
    setPage(1);
    setMessage(null);
    void loadApplicantsForActivity(selectedActivityId);
  }, [loadApplicantsForActivity, selectedActivityId]);

  const activityById = useMemo(() => {
    return new Map(activities.map((activity) => [activity.id, activity]));
  }, [activities]);

  const applicants = useMemo(() => {
    return participations
      .map((participation): ApplicantViewModel => {
        const activityId = participation.activityId ?? participation.activity_id ?? '';
        const activity = activityById.get(activityId) ?? null;
        const fullName = participation.volunteer?.full_name?.trim() || 'Volunteer';
        const email = participation.volunteer?.phone?.trim() || `volunteer.${participation.id.slice(0, 6)}@example.com`;
        const status = String(participation.status ?? 'pending').toLowerCase();

        const skills =
          activity && Array.isArray(activity.required_skills) && activity.required_skills.length > 0
            ? activity.required_skills.slice(0, 3)
            : ['General'];

        return {
          participation,
          activity,
          name: fullName,
          email,
          avatarUrl: participation.volunteer?.avatar_url ?? null,
          status,
          matchScore: normalizeMatchScore(participation.ai_match_score),
          skills,
        };
      })
      .sort((left, right) => {
        const statusWeight = statusSortWeight(left.status) - statusSortWeight(right.status);
        if (statusWeight !== 0) {
          return statusWeight;
        }
        return right.matchScore - left.matchScore;
      });
  }, [participations, activityById]);

  const filteredApplicants = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    return applicants.filter((item) => {
      const statusMatches = statusFilter === 'all' || item.status === statusFilter;
      if (!statusMatches) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      return (
        item.name.toLowerCase().includes(normalized) ||
        item.email.toLowerCase().includes(normalized) ||
        (item.activity?.title ?? '').toLowerCase().includes(normalized)
      );
    });
  }, [applicants, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredApplicants.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pagedApplicants = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredApplicants.slice(start, start + PAGE_SIZE);
  }, [filteredApplicants, safePage]);

  useEffect(() => {
    if (pagedApplicants.length === 0) {
      setSelectedApplicantId(null);
      return;
    }

    const selectedStillExists = pagedApplicants.some((item) => item.participation.id === selectedApplicantId);
    if (!selectedStillExists) {
      setSelectedApplicantId(pagedApplicants[0].participation.id);
    }
  }, [pagedApplicants, selectedApplicantId]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => filteredApplicants.some((item) => item.participation.id === id)));
  }, [filteredApplicants]);

  const selectedApplicant = useMemo(
    () => applicants.find((item) => item.participation.id === selectedApplicantId) ?? null,
    [applicants, selectedApplicantId]
  );

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.id === selectedActivityId) ?? null,
    [activities, selectedActivityId]
  );

  const highlightedCapacity = useMemo(() => {
    if (!selectedActivity) {
      return null;
    }

    const joined = applicants.filter((item) => {
      const activityId = item.participation.activityId ?? item.participation.activity_id;
      return activityId === selectedActivity.id && ['pending', 'approved', 'checked_in'].includes(item.status);
    }).length;

    const capacity = Math.max(1, Number(selectedActivity.capacity ?? 0));
    const progress = Math.min(100, Math.round((joined / capacity) * 100));

    return {
      joined,
      capacity,
      progress,
    };
  }, [applicants, selectedActivity]);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = pagedApplicants.map((item) => item.participation.id);
    const allSelected = pageIds.every((id) => selectedIds.includes(id));

    setSelectedIds((current) => {
      if (allSelected) {
        return current.filter((id) => !pageIds.includes(id));
      }

      return Array.from(new Set([...current, ...pageIds]));
    });
  };

  const applyStatus = async (ids: string[], nextStatus: ApprovalStatus) => {
    if (ids.length === 0) {
      return;
    }

    if (!session?.access_token) {
      setError('No active session token.');
      setMessage(null);
      return;
    }

    setError(null);
    setMessage(null);

    const action = nextStatus === 'approved' ? approveRegistration : rejectRegistration;
    const results = await Promise.allSettled(ids.map((id) => action(id, session.access_token)));

    const successfulResults = results.filter(
      (result): result is PromiseFulfilledResult<{ registration: ParticipationRecord; message?: string }> =>
        result.status === 'fulfilled'
    );
    const failedResults = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

    if (successfulResults.length > 0) {
      const updatedById = new Map(successfulResults.map((result) => [result.value.registration.id, result.value.registration]));
      setParticipations((current) =>
        current.map((participation) => updatedById.get(participation.id) ?? participation)
      );
      setSelectedIds([]);

      const successMessage =
        successfulResults.length === 1
          ? successfulResults[0].value.message ?? `Registration ${nextStatus} successfully.`
          : `${successfulResults.length} registrations ${nextStatus} successfully.`;
      setMessage(successMessage);
    }

    if (failedResults.length > 0) {
      const firstError = failedResults[0].reason;
      const failureMessage =
        firstError instanceof Error ? firstError.message : `Failed to ${nextStatus} one or more registrations.`;
      setError(failureMessage);
      if (successfulResults.length > 0 && selectedActivityId) {
        await loadApplicantsForActivity(selectedActivityId);
      }
      return;
    }
  };

  const handleSingleStatus = async (id: string, nextStatus: ApprovalStatus) => {
    setUpdatingId(id);
    await applyStatus([id], nextStatus);
    setUpdatingId(null);
  };

  const handleBulkStatus = async (nextStatus: ApprovalStatus) => {
    setBulkUpdating(true);
    await applyStatus(selectedIds, nextStatus);
    setBulkUpdating(false);
  };

  const contributions = useMemo(() => {
    if (!selectedApplicant?.participation.volunteer_id) {
      return [];
    }

    const volunteerId = selectedApplicant.participation.volunteer_id;

    return applicants
      .filter(
        (item) =>
          item.participation.volunteer_id === volunteerId && item.participation.id !== selectedApplicant.participation.id
      )
      .slice(0, 3);
  }, [applicants, selectedApplicant]);

  const skillProficiency = selectedApplicant ? Math.max(35, selectedApplicant.matchScore) : 0;
  const historicalFit = selectedApplicant
    ? Math.max(30, selectedApplicant.matchScore - (selectedApplicant.status === 'pending' ? 8 : 4))
    : 0;

  const pageAllSelected =
    pagedApplicants.length > 0 && pagedApplicants.every((item) => selectedIds.includes(item.participation.id));
  const loading = activitiesLoading || applicantsLoading;

  return (
    <OrganizerShell
      activeNav="volunteers"
      pageSubtitle="Review volunteer applications and manage participation requests in one queue."
      pageTitle="Registration Approval"
      searchPlaceholder="Search applications..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
    >
      <section className="org-approval-page">
        <section className="org-approval-main">
          <Card as="section" className="org-approval-hero">
            <div className="org-approval-hero-copy">
              <p className="org-approval-eyebrow">Active Event</p>
              <Select
                className="org-approval-activity-select"
                disabled={activitiesLoading || activities.length === 0}
                onChange={(event) => setSelectedActivityId(event.target.value)}
                value={selectedActivityId}
              >
                {activities.length === 0 ? (
                  <option value="">No active activities</option>
                ) : (
                  activities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.title}
                    </option>
                  ))
                )}
              </Select>
              <p className="muted">
                {selectedActivity ? new Date(selectedActivity.start_time).toLocaleDateString() : 'No upcoming event'}
              </p>
            </div>

            <div className="org-approval-capacity">
              <p>Capacity Reached</p>
              <strong>{highlightedCapacity ? `${highlightedCapacity.progress}%` : '--'}</strong>
              <div className="org-approval-capacity-track">
                <div
                  className="org-approval-capacity-fill"
                  style={{ width: `${highlightedCapacity?.progress ?? 0}%` }}
                />
              </div>
              <small>
                {highlightedCapacity
                  ? `${highlightedCapacity.joined} of ${highlightedCapacity.capacity} spots filled`
                  : 'No capacity data yet'}
              </small>
            </div>
          </Card>

          {selectedIds.length > 0 && (
            <div className="org-approval-bulkbar">
              <strong>{selectedIds.length} applicants selected</strong>
              <div className="org-approval-bulk-actions">
                <Button
                  disabled={bulkUpdating}
                  onClick={() => void handleBulkStatus('approved')}
                  type="button"
                  variant="secondary"
                >
                  <CheckCircle2 size={14} />
                  <span>Approve All</span>
                </Button>
                <Button
                  disabled={bulkUpdating}
                  onClick={() => void handleBulkStatus('rejected')}
                  type="button"
                  variant="secondary"
                >
                  <XCircle size={14} />
                  <span>Reject All</span>
                </Button>
                <button className="org-approval-clear-btn" onClick={() => setSelectedIds([])} type="button">
                  Clear
                </button>
              </div>
            </div>
          )}

          <Card as="section" className="org-approval-table-shell">
            <div className="org-approval-toolbar">
              <label className="org-approval-search-filter" htmlFor="org-approval-filter-search">
                <Search size={14} />
                <input
                  id="org-approval-filter-search"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Filter current list..."
                  type="search"
                  value={searchTerm}
                />
              </label>

              <div className="org-approval-tabs" role="tablist" aria-label="Approval status filter">
                {['pending', 'approved', 'rejected', 'all'].map((status) => (
                  <button
                    className={statusFilter === status ? 'org-approval-tab is-active' : 'org-approval-tab'}
                    key={status}
                    onClick={() => setStatusFilter(status as 'all' | ApprovalStatus)}
                    type="button"
                  >
                    {toTitleCase(status)}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="form-error">{error}</p>}
            {message && <p className="form-success">{message}</p>}

            {loading ? (
              <p className="muted">Loading applications...</p>
            ) : (
              <Table className="org-approval-table" wrapperClassName="org-approval-table-wrap">
                <thead>
                  <tr>
                    <th>
                      <input
                        aria-label="Select all applicants on page"
                        checked={pageAllSelected}
                        onChange={toggleSelectAllOnPage}
                        type="checkbox"
                      />
                    </th>
                    <th>Volunteer</th>
                    <th>Skills</th>
                    <th>Match</th>
                    <th>Status</th>
                    <th>Activity</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedApplicants.map((item) => {
                    const id = item.participation.id;
                    const checked = selectedIds.includes(id);
                    const isSelected = selectedApplicantId === id;
                    const canApproveOrReject = item.status === 'pending';

                    return (
                      <tr
                        className={isSelected ? 'is-selected' : ''}
                        key={id}
                        onClick={() => setSelectedApplicantId(id)}
                      >
                        <td>
                          <input
                            aria-label={`Select ${item.name}`}
                            checked={checked}
                            onChange={() => toggleSelected(id)}
                            onClick={(event) => event.stopPropagation()}
                            type="checkbox"
                          />
                        </td>
                        <td>
                          <div className="org-approval-volunteer-cell">
                            {item.avatarUrl ? (
                              <img alt={item.name} className="org-approval-avatar" src={item.avatarUrl} />
                            ) : (
                              <span className="org-approval-avatar-fallback">{getInitials(item.name)}</span>
                            )}
                            <div>
                              <strong>{item.name}</strong>
                              <small>{item.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="org-approval-skill-list">
                            {item.skills.map((skill) => (
                              <Badge className="org-approval-skill" key={`${id}-${skill}`} tone="neutral">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className="org-approval-match-pill">{item.matchScore}% Match</span>
                        </td>
                        <td>
                          <Badge tone={getStatusTone(item.status)}>{toTitleCase(item.status)}</Badge>
                        </td>
                        <td>{item.activity?.title ?? 'Activity unavailable'}</td>
                        <td>
                          <div className="org-approval-row-actions">
                            <button
                              className="org-approval-action-btn approve"
                              disabled={!canApproveOrReject || updatingId === id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleSingleStatus(id, 'approved');
                              }}
                              type="button"
                            >
                              Approve
                            </button>
                            <button
                              className="org-approval-action-btn reject"
                              disabled={!canApproveOrReject || updatingId === id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleSingleStatus(id, 'rejected');
                              }}
                              type="button"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!loading && pagedApplicants.length === 0 && (
                    <tr>
                      <td className="org-approval-empty" colSpan={7}>
                        No applicants found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            )}

            {!loading && filteredApplicants.length > 0 && (
              <div className="org-approval-pagination">
                <small>
                  Showing {(safePage - 1) * PAGE_SIZE + 1} to {Math.min(safePage * PAGE_SIZE, filteredApplicants.length)} of{' '}
                  {filteredApplicants.length} results
                </small>
                <div className="org-approval-pagination-actions">
                  <Button
                    disabled={safePage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    type="button"
                    variant="secondary"
                  >
                    Previous
                  </Button>
                  <Button
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    type="button"
                    variant="secondary"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </section>

        <aside className="org-approval-detail">
          <Card as="section" className="org-approval-detail-card">
            <h3>Applicant Details</h3>

            {selectedApplicant ? (
              <>
                <div className="org-approval-detail-identity">
                  {selectedApplicant.avatarUrl ? (
                    <img alt={selectedApplicant.name} className="org-approval-detail-avatar" src={selectedApplicant.avatarUrl} />
                  ) : (
                    <span className="org-approval-detail-avatar-fallback">{getInitials(selectedApplicant.name)}</span>
                  )}
                  <strong>{selectedApplicant.name}</strong>
                  <p>{selectedApplicant.matchScore}% Match Score</p>
                </div>

                <div className="org-approval-detail-actions">
                  <Button
                    disabled={selectedApplicant.status !== 'pending' || updatingId === selectedApplicant.participation.id}
                    onClick={() => void handleSingleStatus(selectedApplicant.participation.id, 'approved')}
                    type="button"
                  >
                    Approve
                  </Button>
                  <Button
                    disabled={selectedApplicant.status !== 'pending' || updatingId === selectedApplicant.participation.id}
                    onClick={() => void handleSingleStatus(selectedApplicant.participation.id, 'rejected')}
                    type="button"
                    variant="secondary"
                  >
                    Reject
                  </Button>
                </div>

                <div className="org-approval-score-block">
                  <p>
                    Skill Proficiency <span>{skillProficiency}%</span>
                  </p>
                  <div className="org-approval-score-track">
                    <div className="org-approval-score-fill" style={{ width: `${skillProficiency}%` }} />
                  </div>

                  <p>
                    Historical Fit <span>{historicalFit}%</span>
                  </p>
                  <div className="org-approval-score-track">
                    <div className="org-approval-score-fill" style={{ width: `${historicalFit}%` }} />
                  </div>
                </div>

                <div className="org-approval-insight">
                  <h4>{selectedApplicant.matchScore > 0 ? 'Match Insight (Score-Based)' : 'Application Insight'}</h4>
                  <p>
                    {selectedApplicant.matchScore > 0
                      ? `Current match signal is ${selectedApplicant.matchScore}% for ${
                          selectedApplicant.activity?.title ?? 'this activity'
                        }, with key required skills: ${selectedApplicant.skills.join(', ')}.`
                      : `No structured match diagnostics are available yet for ${
                          selectedApplicant.activity?.title ?? 'this activity'
                        }. Review profile details and participation history before approval.`}
                  </p>
                </div>

                <div className="org-approval-contributions">
                  <h4>Past Contributions</h4>
                  {contributions.length === 0 ? (
                    <p className="muted">No previous contributions found.</p>
                  ) : (
                    <ul>
                      {contributions.map((item) => (
                        <li key={item.participation.id}>
                          <strong>{item.activity?.title ?? 'Activity'}</strong>
                          <span>{toTitleCase(item.status)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="org-approval-note">
                  <h4>Internal Notes</h4>
                  <p>
                    Internal note is generated from current registration status and available history only. Add manual
                    review notes before final approval when needed.
                  </p>
                </div>
              </>
            ) : (
              <p className="muted">Select an applicant to view details.</p>
            )}
          </Card>
        </aside>
      </section>
    </OrganizerShell>
  );
}
