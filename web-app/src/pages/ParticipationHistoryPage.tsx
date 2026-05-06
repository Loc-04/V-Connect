import { BriefcaseBusiness, Clock3, History, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { RegistrationAction } from '../components/activities/RegistrationAction';
import { Button, Card, Input, Table } from '../components/ui';
import { VolunteerShell } from '../layouts/VolunteerShell';
import { useParticipationMineQuery, usePrefetchActivityDetail } from '../lib/queries';
import type { ParticipationRecord, ParticipationStatus } from '../types/participation';
import './ParticipationHistoryPage.css';

type StatusFilter = ParticipationStatus | 'all';

const STATUS_TABS: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Expired', value: 'expired' },
  { label: 'Cancelled', value: 'cancelled' },
];

const PAGE_SIZE = 6;
const EMPTY_PARTICIPATIONS: ParticipationRecord[] = [];
const UPCOMING_LIKE_STATUSES = new Set(['assigned', 'pending', 'approved', 'upcoming']);

function toTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function statusPriorityForAll(status: string): number {
  if (status === 'assigned') return 0;
  if (status === 'pending') return 1;
  if (status === 'approved') return 2;
  if (status === 'upcoming') return 3;
  if (status === 'checked_in') return 4;
  if (status === 'completed') return 5;
  if (status === 'expired') return 6;
  if (status === 'rejected') return 7;
  if (status === 'cancelled') return 8;
  return 9;
}

function compareByDateAsc(left: ParticipationRecord, right: ParticipationRecord): number {
  const leftTs = toTimestamp(left.date);
  const rightTs = toTimestamp(right.date);

  if (leftTs === null && rightTs === null) {
    return 0;
  }
  if (leftTs === null) {
    return 1;
  }
  if (rightTs === null) {
    return -1;
  }

  return leftTs - rightTs;
}

function compareByDateDesc(left: ParticipationRecord, right: ParticipationRecord): number {
  return compareByDateAsc(right, left);
}

function compareParticipationRecords(left: ParticipationRecord, right: ParticipationRecord, filter: StatusFilter): number {
  if (filter === 'all') {
    const byDate = compareByDateDesc(left, right);
    if (byDate !== 0) {
      return byDate;
    }
  } else if (filter === 'upcoming') {
    const byDate = compareByDateAsc(left, right);
    if (byDate !== 0) {
      return byDate;
    }
  } else if (filter === 'completed' || filter === 'expired' || filter === 'cancelled') {
    const byDate = compareByDateDesc(left, right);
    if (byDate !== 0) {
      return byDate;
    }
  } else {
    const leftStatus = normalizeStatus(left.status);
    const rightStatus = normalizeStatus(right.status);
    const statusDiff = statusPriorityForAll(leftStatus) - statusPriorityForAll(rightStatus);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    const byDate = UPCOMING_LIKE_STATUSES.has(leftStatus)
      ? compareByDateAsc(left, right)
      : compareByDateDesc(left, right);
    if (byDate !== 0) {
      return byDate;
    }
  }

  const byName = left.activityName.localeCompare(right.activityName);
  if (byName !== 0) {
    return byName;
  }

  return left.id.localeCompare(right.id);
}

function isUpcomingEligibleRecord(record: ParticipationRecord): boolean {
  const status = normalizeStatus(record.status);
  if (!UPCOMING_LIKE_STATUSES.has(status)) {
    return false;
  }

  const startTimestamp = toTimestamp(record.date);
  if (startTimestamp === null) {
    return false;
  }

  return startTimestamp > Date.now();
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatHours(value: number | null) {
  if (value === null) {
    return '--';
  }
  return `${value.toFixed(1)}h`;
}

export function ParticipationHistoryPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const userId = session?.user?.id ?? null;
  const participationsQuery = useParticipationMineQuery(accessToken, userId, { limit: 250 });
  const prefetchActivityDetail = usePrefetchActivityDetail(accessToken, userId);
  const loading = participationsQuery.isLoading;
  const records: ParticipationRecord[] = participationsQuery.data ?? EMPTY_PARTICIPATIONS;
  const error =
    participationsQuery.error instanceof Error
      ? participationsQuery.error.message
      : !accessToken
        ? 'No active session token.'
        : null;
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = records.filter((record) => {
      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'upcoming'
            ? isUpcomingEligibleRecord(record)
            : normalizeStatus(record.status) === normalizeStatus(statusFilter);
      if (!matchStatus) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        record.activityName.toLowerCase().includes(normalizedQuery) ||
        record.organization.toLowerCase().includes(normalizedQuery)
      );
    });

    return [...filtered].sort((left, right) => compareParticipationRecords(left, right, statusFilter));
  }, [query, records, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pagedRecords = filteredRecords.slice(startIndex, startIndex + PAGE_SIZE);

  const totalHours = useMemo(
    () => records.reduce((sum, record) => sum + (record.hours ?? 0), 0),
    [records]
  );
  const completedCount = useMemo(
    () => records.filter((record) => record.status === 'completed').length,
    [records]
  );
  const impactScore = Math.max(70, Math.min(100, Math.round(70 + totalHours / 2)));

  return (
    <VolunteerShell
      activeNav="my-activities"
      headerActions={
        <Button onClick={() => navigate('/browse')} type="button" variant="secondary">
          <BriefcaseBusiness size={16} />
          <span>Browse Opportunities</span>
        </Button>
      }
      pageSubtitle="Track your past impacts and upcoming commitments in one place."
      pageTitle="Participation History"
    >
      <section className="history-page">
        <div className="history-metrics">
          <Card as="article" className="history-metric-card">
            <div className="history-metric-copy">
              <span className="history-metric-icon-wrap" aria-hidden="true">
                <History size={16} />
              </span>
              <div>
                <p>Activities Joined</p>
                <strong>{records.length}</strong>
                <small>{completedCount} completed</small>
              </div>
            </div>
          </Card>

          <Card as="article" className="history-metric-card">
            <div className="history-metric-copy">
              <span className="history-metric-icon-wrap accent" aria-hidden="true">
                <Clock3 size={16} />
              </span>
              <div>
                <p>Total Hours</p>
                <strong>{totalHours.toFixed(1)}</strong>
                <small>Community contribution logged</small>
              </div>
            </div>
          </Card>

          <Card as="article" className="history-metric-card">
            <div className="history-metric-copy">
              <span className="history-metric-icon-wrap success" aria-hidden="true">
                <TrendingUp size={16} />
              </span>
              <div>
                <p>Impact Score</p>
                <strong>{impactScore}</strong>
                <small>Momentum from recent activity</small>
              </div>
            </div>
          </Card>
        </div>

        <Card as="section" className="history-table-shell">
          <div className="history-table-tools">
            <div className="history-tabs">
              {STATUS_TABS.map((tab) => (
                <button
                  className={statusFilter === tab.value ? 'history-tab is-active' : 'history-tab'}
                  key={tab.value}
                  onClick={() => handleStatusFilterChange(tab.value)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <Input
              className="history-search"
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="Search activities or organizations..."
              type="search"
              value={query}
            />
          </div>

          <Table className="history-table" wrapperClassName="history-table-wrap">
            <thead>
              <tr>
                <th>Activity Name</th>
                <th>Organization</th>
                <th>Date</th>
                <th>Hours</th>
                <th>Registration</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="history-empty" colSpan={6}>
                    Loading participation history...
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td className="history-empty" colSpan={6}>
                    {error}
                  </td>
                </tr>
              )}

              {!loading && pagedRecords.length === 0 && (
                <tr>
                  <td className="history-empty" colSpan={6}>
                    No participation records found.
                  </td>
                </tr>
              )}

              {!loading &&
                pagedRecords.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <div className="history-activity-cell">
                        <span className="history-activity-icon" aria-hidden="true">
                          <History size={14} />
                        </span>
                        <div className="history-activity-copy">
                          <span>{record.activityName}</span>
                          {record.activityDeleted ? (
                            <small className="history-activity-note">Removed by organizer. Historical record kept.</small>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>{record.organization}</td>
                    <td>{formatDateLabel(record.date)}</td>
                    <td>{formatHours(record.hours)}</td>
                    <td>
                      {record.activityId ? (
                        <RegistrationAction
                          activityId={record.activityId}
                          className="history-registration-action"
                          currentStatus={record.status}
                          mode="badge"
                        />
                      ) : (
                        <span className="muted">--</span>
                      )}
                    </td>
                    <td>
                      <Button
                        className="history-view-btn"
                        disabled={record.activityDeleted || !record.activityId}
                        onClick={() => {
                          if (record.activityId) {
                            void prefetchActivityDetail(record.activityId);
                            navigate(`/volunteer/activity/${record.activityId}`);
                          }
                        }}
                        onMouseEnter={() => {
                          if (record.activityId) {
                            void prefetchActivityDetail(record.activityId);
                          }
                        }}
                        type="button"
                        variant="secondary"
                      >
                        {record.activityDeleted ? 'Unavailable' : 'View Details'}
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </Table>

          <div className="history-pagination">
            <small>
              Showing {filteredRecords.length === 0 ? 0 : startIndex + 1} to{' '}
              {Math.min(startIndex + PAGE_SIZE, filteredRecords.length)} of {filteredRecords.length} results
            </small>

            <div className="history-pagination-actions">
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
        </Card>
      </section>
    </VolunteerShell>
  );
}
