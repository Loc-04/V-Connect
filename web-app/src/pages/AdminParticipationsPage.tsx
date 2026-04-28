import {
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  FilterX,
  RefreshCw,
  Search,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { AttendanceStatusBadge } from '../components/attendance';
import { Button, Card, Input, Select, Table } from '../components/ui';
import { listParticipations } from '../lib/participations';
import type { ParticipationRecord } from '../types/participation';
import './AdminParticipationsPage.css';

const BASE_STATUS_OPTIONS = ['assigned', 'pending', 'approved', 'rejected', 'cancelled', 'checked_in', 'completed'];

type AttendanceFilter = 'all' | 'checked_in' | 'not_checked_in';

interface ParticipationViewModel {
  id: string;
  participation: ParticipationRecord;
  volunteerName: string;
  volunteerMeta: string;
  avatarUrl: string | null;
  activityId: string | null;
  activityName: string;
  organizerName: string;
  status: string;
  registeredAt: string | null;
  checkedInAt: string | null;
  matchScore: number | null;
  hours: number | null;
  searchText: string;
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? 'unknown').trim().toLowerCase().replace(/\s+/g, '_');
}

function toTitleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatShortId(value: string | null | undefined) {
  if (!value) {
    return '--';
  }
  return value.slice(0, 8);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCheckInTime(value: string | null | undefined) {
  if (!value) {
    return 'Not checked in';
  }
  return formatDateTime(value);
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function normalizeMatchScore(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  if (value <= 1) {
    return Math.max(0, Math.min(100, Math.round(value * 100)));
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getParticipationId(participation: ParticipationRecord) {
  return participation.participationId || participation.id;
}

function getActivityId(participation: ParticipationRecord) {
  return participation.activityId ?? participation.activity_id ?? null;
}

function buildViewModel(participation: ParticipationRecord): ParticipationViewModel {
  const id = getParticipationId(participation);
  const activityId = getActivityId(participation);
  const volunteerName = participation.volunteer?.full_name?.trim() || 'Volunteer unavailable';
  const volunteerMeta = participation.volunteer?.phone?.trim() || formatShortId(participation.volunteer_id);
  const activityName = participation.activityName || 'Activity unavailable';
  const organizerName = participation.organization || 'Organizer unavailable';
  const status = normalizeStatus(participation.status);
  const registeredAt = participation.created_at ?? null;
  const checkedInAt = participation.checked_in_at ?? null;
  const matchScore = normalizeMatchScore(participation.ai_match_score);
  const hours = typeof participation.hours === 'number' ? participation.hours : null;
  const searchText = [
    id,
    participation.volunteer_id ?? '',
    volunteerName,
    volunteerMeta,
    activityId ?? '',
    activityName,
    organizerName,
    status,
  ]
    .join(' ')
    .toLowerCase();

  return {
    id,
    participation,
    volunteerName,
    volunteerMeta,
    avatarUrl: participation.volunteer?.avatar_url ?? null,
    activityId,
    activityName,
    organizerName,
    status,
    registeredAt,
    checkedInAt,
    matchScore,
    hours,
    searchText,
  };
}

export function AdminParticipationsPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;

  const [participations, setParticipations] = useState<ParticipationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [organizerFilter, setOrganizerFilter] = useState('all');
  const [selectedParticipation, setSelectedParticipation] = useState<ParticipationViewModel | null>(null);

  const loadData = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rows = await listParticipations({
        accessToken,
        status: 'all',
        limit: 300,
      });
      setParticipations(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load participations.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const rows = useMemo(() => participations.map(buildViewModel), [participations]);

  const metrics = useMemo(
    () => ({
      pending: rows.filter((row) => row.status === 'pending').length,
      approved: rows.filter((row) => row.status === 'approved').length,
      rejected: rows.filter((row) => row.status === 'rejected').length,
      checkedIn: rows.filter((row) => row.status === 'checked_in' || Boolean(row.checkedInAt)).length,
      completed: rows.filter((row) => row.status === 'completed').length,
    }),
    [rows]
  );

  const statusOptions = useMemo(() => {
    const dynamicStatuses = rows.map((row) => row.status).filter(Boolean);
    return Array.from(new Set([...BASE_STATUS_OPTIONS, ...dynamicStatuses])).sort();
  }, [rows]);

  const activityOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => {
      if (row.activityId) {
        map.set(row.activityId, row.activityName);
      }
    });
    return Array.from(map.entries()).sort((left, right) => left[1].localeCompare(right[1]));
  }, [rows]);

  const organizerOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.organizerName).filter(Boolean))).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch = !keyword || row.searchText.includes(keyword);
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      const matchesAttendance =
        attendanceFilter === 'all' ||
        (attendanceFilter === 'checked_in' && (row.status === 'checked_in' || Boolean(row.checkedInAt))) ||
        (attendanceFilter === 'not_checked_in' && row.status !== 'checked_in' && !row.checkedInAt);
      const matchesActivity = activityFilter === 'all' || row.activityId === activityFilter;
      const matchesOrganizer = organizerFilter === 'all' || row.organizerName === organizerFilter;

      return matchesSearch && matchesStatus && matchesAttendance && matchesActivity && matchesOrganizer;
    });
  }, [activityFilter, attendanceFilter, organizerFilter, rows, searchTerm, statusFilter]);

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    statusFilter !== 'all' ||
    attendanceFilter !== 'all' ||
    activityFilter !== 'all' ||
    organizerFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setAttendanceFilter('all');
    setActivityFilter('all');
    setOrganizerFilter('all');
  };

  const openDetail = (row: ParticipationViewModel) => {
    setSelectedParticipation(row);
  };

  const isBlockingError = Boolean(error && !loading && rows.length === 0);

  return (
    <section className="admin-participations-page">
      <div className="admin-participations-header">
        <div className="admin-participations-copy">
          <span className="admin-participations-eyebrow">Admin operations</span>
          <h2>Participation Oversight</h2>
          <p className="muted">Review participation records, approvals, and check-in status across the full system.</p>
        </div>

        <div className="admin-participations-actions">
          <Button disabled={loading} onClick={() => void loadData()} type="button" variant="secondary">
            <RefreshCw size={16} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="admin-participations-metrics">
        <Card as="article" className="admin-participations-metric-card">
          <span className="admin-participations-metric-icon is-warning">
            <CircleDashed size={17} />
          </span>
          <p>Pending Approvals</p>
          <strong>{metrics.pending}</strong>
        </Card>
        <Card as="article" className="admin-participations-metric-card">
          <span className="admin-participations-metric-icon">
            <UserCheck size={17} />
          </span>
          <p>Approved</p>
          <strong>{metrics.approved}</strong>
        </Card>
        <Card as="article" className="admin-participations-metric-card">
          <span className="admin-participations-metric-icon is-danger">
            <XCircle size={17} />
          </span>
          <p>Rejected</p>
          <strong>{metrics.rejected}</strong>
        </Card>
        <Card as="article" className="admin-participations-metric-card">
          <span className="admin-participations-metric-icon is-success">
            <CheckCircle2 size={17} />
          </span>
          <p>Checked-in</p>
          <strong>{metrics.checkedIn}</strong>
        </Card>
        <Card as="article" className="admin-participations-metric-card">
          <span className="admin-participations-metric-icon is-muted">
            <ClipboardList size={17} />
          </span>
          <p>Completed</p>
          <strong>{metrics.completed}</strong>
        </Card>
      </div>

      <Card as="section" className="admin-participations-filter-card">
        <div className="admin-participations-filter-head">
          <div>
            <h3>Find records</h3>
            <p className="muted">Search volunteer, activity, organizer, or record id. Filters are applied client-side to loaded records.</p>
          </div>
          {hasActiveFilters ? (
            <Button onClick={clearFilters} type="button" variant="secondary">
              <FilterX size={15} />
              Clear filters
            </Button>
          ) : null}
        </div>

        <div className="admin-participations-filter-grid">
          <label className="admin-participations-search-field">
            <span>Search</span>
            <div className="admin-participations-search-input">
              <Search size={16} />
              <Input
                aria-label="Search participations"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search volunteer, activity, organizer, record id..."
                value={searchTerm}
              />
            </div>
          </label>

          <label>
            <span>Status</span>
            <Select aria-label="Filter by participation status" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {toTitleCase(status)}
                </option>
              ))}
            </Select>
          </label>

          <label>
            <span>Check-in</span>
            <Select
              aria-label="Filter by check-in status"
              onChange={(event) => setAttendanceFilter(event.target.value as AttendanceFilter)}
              value={attendanceFilter}
            >
              <option value="all">All</option>
              <option value="checked_in">Checked in</option>
              <option value="not_checked_in">Not checked in</option>
            </Select>
          </label>

          <label>
            <span>Activity</span>
            <Select aria-label="Filter by activity" onChange={(event) => setActivityFilter(event.target.value)} value={activityFilter}>
              <option value="all">All activities</option>
              {activityOptions.map(([activityId, activityName]) => (
                <option key={activityId} value={activityId}>
                  {activityName}
                </option>
              ))}
            </Select>
          </label>

          <label>
            <span>Organizer</span>
            <Select aria-label="Filter by organizer" onChange={(event) => setOrganizerFilter(event.target.value)} value={organizerFilter}>
              <option value="all">All organizers</option>
              {organizerOptions.map((organizer) => (
                <option key={organizer} value={organizer}>
                  {organizer}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </Card>

      <Card as="section" className="admin-participations-table-card">
        <div className="admin-participations-table-head">
          <div>
            <h3>Participation records</h3>
            <p className="muted">
              Showing {filteredRows.length} of {rows.length} records.
            </p>
          </div>
          <span className="admin-participations-limit-pill">Max 300 records</span>
        </div>

        {isBlockingError ? (
          <div className="admin-participations-state admin-participations-state--error">
            <h3>Unable to load participations</h3>
            <p>{error}</p>
            <Button onClick={() => void loadData()} type="button" variant="secondary">
              Retry
            </Button>
          </div>
        ) : null}

        {!isBlockingError && error ? <p className="form-error">{error}</p> : null}

        {!isBlockingError && loading ? (
          <div className="admin-participations-state">
            <RefreshCw className="admin-participations-spinner" size={22} />
            <p>Loading participation records...</p>
          </div>
        ) : null}

        {!isBlockingError && !loading && rows.length === 0 ? (
          <div className="admin-participations-state">
            <h3>No participation records found</h3>
            <p>Volunteer registrations and attendance records will appear here when available.</p>
          </div>
        ) : null}

        {!isBlockingError && !loading && rows.length > 0 ? (
          <Table className="admin-participations-table" wrapperClassName="admin-participations-table-wrap">
            <thead>
              <tr>
                <th>No.</th>
                <th>Volunteer</th>
                <th>Activity</th>
                <th>Organizer</th>
                <th>Status</th>
                <th>Check-in</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="admin-participations-state admin-participations-state--compact">
                      <h3>No matching records</h3>
                      <p>Adjust search or filters to see more results.</p>
                      {hasActiveFilters ? (
                        <Button onClick={clearFilters} type="button" variant="secondary">
                          Clear filters
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, rowIndex) => (
                  <tr
                    className="admin-participations-data-row"
                    key={row.id}
                    onClick={() => openDetail(row)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openDetail(row);
                      }
                    }}
                  >
                    <td>{rowIndex + 1}</td>
                    <td>
                      <div className="admin-participations-volunteer-cell">
                        {row.avatarUrl ? <img alt={row.volunteerName} src={row.avatarUrl} /> : <span>{getInitials(row.volunteerName) || 'V'}</span>}
                        <div>
                          <strong>{row.volunteerName}</strong>
                          <small>{row.volunteerMeta}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="admin-participations-title-cell">
                        <strong>{row.activityName}</strong>
                        <small>ID: {formatShortId(row.activityId)}</small>
                      </div>
                    </td>
                    <td>{row.organizerName}</td>
                    <td>
                      <AttendanceStatusBadge status={row.status} />
                    </td>
                    <td>
                      <div className="admin-participations-checkin-cell">
                        <span>{formatCheckInTime(row.checkedInAt)}</span>
                        <AttendanceStatusBadge
                          className="admin-participations-checkin-badge"
                          status={row.checkedInAt || row.status === 'checked_in' ? 'checked_in' : 'not_checked_in'}
                        />
                      </div>
                    </td>
                    <td>{formatDateTime(row.registeredAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        ) : null}
      </Card>

      {selectedParticipation ? (
        <div className="admin-participation-detail-backdrop" onClick={() => setSelectedParticipation(null)} role="presentation">
          <Card
            aria-labelledby="admin-participation-detail-title"
            aria-modal="true"
            as="section"
            className="admin-participation-detail-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="admin-participation-detail-head">
              <div>
                <span className="admin-participations-eyebrow">Participation detail</span>
                <h3 id="admin-participation-detail-title">{selectedParticipation.volunteerName}</h3>
                <p>Record ID: {selectedParticipation.id}</p>
              </div>
              <AttendanceStatusBadge status={selectedParticipation.status} />
            </div>

            <div className="admin-participation-detail-grid">
              <div>
                <span>Activity</span>
                <strong>{selectedParticipation.activityName}</strong>
              </div>
              <div>
                <span>Organizer</span>
                <strong>{selectedParticipation.organizerName}</strong>
              </div>
              <div>
                <span>Registered at</span>
                <strong>{formatDateTime(selectedParticipation.registeredAt)}</strong>
              </div>
              <div>
                <span>Checked in</span>
                <strong>{formatCheckInTime(selectedParticipation.checkedInAt)}</strong>
              </div>
              <div>
                <span>Match score</span>
                <strong>{selectedParticipation.matchScore === null ? '--' : `${selectedParticipation.matchScore}%`}</strong>
              </div>
              <div>
                <span>Hours</span>
                <strong>{selectedParticipation.hours === null ? '--' : selectedParticipation.hours}</strong>
              </div>
            </div>

            <div className="admin-participation-detail-actions is-footer">
              <Button onClick={() => setSelectedParticipation(null)} type="button" variant="secondary">
                Close
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
