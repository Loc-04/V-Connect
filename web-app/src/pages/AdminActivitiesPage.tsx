import {
  CalendarDays,
  ClipboardList,
  Eye,
  FilterX,
  MapPin,
  MoreVertical,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { Badge, Button, Card, Input, Select, Table, type BadgeTone } from '../components/ui';
import { apiRequest } from '../lib/api';
import { formatActivityLocation } from '../lib/activityLocation';
import { deleteActivity, listActivities } from '../lib/activities';
import { listParticipations } from '../lib/participations';
import type { ActivityRecord, ActivityStatus } from '../types/activity';
import type { UserRecord } from '../types/domain';
import type { ParticipationRecord } from '../types/participation';
import './AdminActivitiesPage.css';

const ACTIVITY_STATUSES: ActivityStatus[] = ['draft', 'published', 'completed', 'cancelled'];
const ACTIVE_PARTICIPATION_STATUSES = new Set(['assigned', 'pending', 'approved', 'checked_in', 'upcoming', 'completed']);
const ACTIVITIES_PAGE_SIZE = 5;

type ActivityStatusFilter = 'all' | ActivityStatus;
type ActivityDateFilter = 'all' | 'upcoming' | 'past';

interface AdminUsersResponse {
  users: UserRecord[];
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

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateRange(startTime: string | null | undefined, endTime: string | null | undefined) {
  const start = parseDate(startTime);
  const end = parseDate(endTime);

  if (!start) {
    return '--';
  }

  const startDate = start.toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
  const startClock = start.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (!end) {
    return `${startDate}, ${startClock}`;
  }

  const sameDay = start.toDateString() === end.toDateString();
  const endDate = end.toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
  const endClock = end.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return sameDay ? `${startDate}, ${startClock} - ${endClock}` : `${startDate}, ${startClock} - ${endDate}, ${endClock}`;
}

function getStatusTone(status: string): BadgeTone {
  const normalized = status.toLowerCase();

  if (normalized === 'published') {
    return 'accent';
  }
  if (normalized === 'completed') {
    return 'success';
  }
  if (normalized === 'cancelled') {
    return 'danger';
  }
  return 'neutral';
}

function getLocationLabel(location: ActivityRecord['location']) {
  const label = formatActivityLocation(location);
  return label && label !== 'Location TBD' ? label : 'Location not set';
}

function getActivitySkills(activity: ActivityRecord) {
  return Array.isArray(activity.required_skills) ? activity.required_skills.filter(Boolean) : [];
}

function getFilterSearchText(activity: ActivityRecord, organizerName: string, organizerEmail: string) {
  return [
    activity.title,
    activity.description ?? '',
    organizerName,
    organizerEmail,
    getLocationLabel(activity.location),
    ...getActivitySkills(activity),
  ]
    .join(' ')
    .toLowerCase();
}

function getActivityReferenceDate(activity: ActivityRecord) {
  return parseDate(activity.end_time) ?? parseDate(activity.start_time);
}

function matchesDateFilter(activity: ActivityRecord, filter: ActivityDateFilter) {
  if (filter === 'all') {
    return true;
  }

  const referenceDate = getActivityReferenceDate(activity);
  if (!referenceDate) {
    return false;
  }

  const now = Date.now();
  return filter === 'upcoming' ? referenceDate.getTime() >= now : referenceDate.getTime() < now;
}

function getParticipationActivityId(participation: ParticipationRecord) {
  return participation.activityId ?? participation.activity_id ?? null;
}

function isActiveRegistration(participation: ParticipationRecord) {
  return ACTIVE_PARTICIPATION_STATUSES.has(String(participation.status ?? '').toLowerCase());
}

function buildCapacityText(capacity: number | null | undefined) {
  const parsed = Number(capacity ?? 0);
  return parsed > 0 ? parsed : '--';
}

export function AdminActivitiesPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;

  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [participations, setParticipations] = useState<ParticipationRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [participationsWarning, setParticipationsWarning] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ActivityStatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<ActivityDateFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [openMenuActivityId, setOpenMenuActivityId] = useState<string | null>(null);
  const [menuPlacement, setMenuPlacement] = useState<'down' | 'up'>('down');
  const [savingActivityId, setSavingActivityId] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);

  const loadData = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    setParticipationsWarning(null);

    const [activitiesResult, participationsResult, usersResult] = await Promise.allSettled([
      listActivities({
        accessToken,
        status: 'all',
        limit: 100,
      }),
      listParticipations({
        accessToken,
        status: 'all',
        limit: 300,
      }),
      apiRequest<AdminUsersResponse>('/admin/users', {
        accessToken,
      }),
    ]);

    if (activitiesResult.status === 'rejected') {
      setError(activitiesResult.reason instanceof Error ? activitiesResult.reason.message : 'Failed to load activities.');
      setLoading(false);
      return;
    }

    setActivities(activitiesResult.value);

    if (participationsResult.status === 'fulfilled') {
      setParticipations(participationsResult.value);
    } else {
      setParticipations([]);
      setParticipationsWarning('Registration counts are unavailable because participation data could not be loaded.');
    }

    if (usersResult.status === 'fulfilled') {
      setUsers(usersResult.value.users);
    } else {
      setUsers([]);
    }

    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const handleWindowClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('.row-action-wrap')) {
        return;
      }

      setOpenMenuActivityId(null);
    };

    window.addEventListener('click', handleWindowClick);
    return () => {
      window.removeEventListener('click', handleWindowClick);
    };
  }, []);

  const registrationStatsByActivity = useMemo(() => {
    const map = new Map<string, { registered: number; pending: number; checkedIn: number }>();

    participations.forEach((participation) => {
      const activityId = getParticipationActivityId(participation);
      if (!activityId) {
        return;
      }

      const status = String(participation.status ?? '').toLowerCase();
      const current = map.get(activityId) ?? { registered: 0, pending: 0, checkedIn: 0 };

      if (isActiveRegistration(participation)) {
        current.registered += 1;
      }
      if (status === 'pending') {
        current.pending += 1;
      }
      if (status === 'checked_in') {
        current.checkedIn += 1;
      }

      map.set(activityId, current);
    });

    return map;
  }, [participations]);

  const organizerById = useMemo(() => {
    return new Map(users.map((user) => [user.id, user]));
  }, [users]);

  const metrics = useMemo(
    () => ({
      total: activities.length,
      published: activities.filter((activity) => String(activity.status ?? '').toLowerCase() === 'published').length,
      completed: activities.filter((activity) => String(activity.status ?? '').toLowerCase() === 'completed').length,
      draftOrCancelled: activities.filter((activity) => {
        const status = String(activity.status ?? '').toLowerCase();
        return status === 'draft' || status === 'cancelled';
      }).length,
    }),
    [activities]
  );

  const filteredActivities = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return activities.filter((activity) => {
      const status = String(activity.status ?? 'draft').toLowerCase();
      const organizer = organizerById.get(activity.organizer_id) ?? null;
      const organizerName = String(organizer?.full_name ?? '').trim();
      const organizerEmail = String(organizer?.email ?? '').trim();
      const matchesSearch = !keyword || getFilterSearchText(activity, organizerName, organizerEmail).includes(keyword);
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesDate = matchesDateFilter(activity, dateFilter);

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [activities, dateFilter, organizerById, searchTerm, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / ACTIVITIES_PAGE_SIZE));
  const paginatedActivities = useMemo(() => {
    const offset = (currentPage - 1) * ACTIVITIES_PAGE_SIZE;
    return filteredActivities.slice(offset, offset + ACTIVITIES_PAGE_SIZE);
  }, [currentPage, filteredActivities]);
  const visibleRangeStart = filteredActivities.length === 0 ? 0 : (currentPage - 1) * ACTIVITIES_PAGE_SIZE + 1;
  const visibleRangeEnd = Math.min(currentPage * ACTIVITIES_PAGE_SIZE, filteredActivities.length);

  const hasActiveFilters = searchTerm.trim().length > 0 || statusFilter !== 'all' || dateFilter !== 'all';
  const isBlockingError = Boolean(error && !loading && activities.length === 0);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, dateFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleDelete = async (activityId: string) => {
    if (!accessToken) {
      setError('No active session token.');
      return;
    }

    const confirmed = window.confirm('Delete this activity? This will remove it from the activity list.');
    if (!confirmed) {
      return;
    }

    setSavingActivityId(activityId);
    setError(null);
    setMessage(null);

    try {
      await deleteActivity(activityId, accessToken);
      setActivities((current) => current.filter((activity) => activity.id !== activityId));
      setParticipations((current) => current.filter((participation) => getParticipationActivityId(participation) !== activityId));
      setSelectedActivity((current) => (current?.id === activityId ? null : current));
      setMessage('Activity deleted.');
      setOpenMenuActivityId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete activity.');
    } finally {
      setSavingActivityId(null);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDateFilter('all');
  };

  return (
    <section className="admin-activities-page">
      <div className="admin-activities-header">
        <div className="admin-activities-copy">
          <span className="admin-activities-eyebrow">Admin operations</span>
          <h2>Activity Oversight</h2>
          <p className="muted">Review, filter, and manage activities across the full V-Connect system.</p>
        </div>

        <div className="admin-activities-actions">
          <Button disabled={loading || Boolean(savingActivityId)} onClick={() => void loadData()} type="button" variant="secondary">
            <RefreshCw size={16} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="admin-activities-metrics">
        <Card as="article" className="admin-activities-metric-card">
          <span className="admin-activities-metric-icon">
            <ClipboardList size={17} />
          </span>
          <p>Total Activities</p>
          <strong>{metrics.total}</strong>
        </Card>
        <Card as="article" className="admin-activities-metric-card">
          <span className="admin-activities-metric-icon is-live">
            <CalendarDays size={17} />
          </span>
          <p>Published</p>
          <strong>{metrics.published}</strong>
        </Card>
        <Card as="article" className="admin-activities-metric-card">
          <span className="admin-activities-metric-icon is-success">
            <CalendarDays size={17} />
          </span>
          <p>Completed</p>
          <strong>{metrics.completed}</strong>
        </Card>
        <Card as="article" className="admin-activities-metric-card">
          <span className="admin-activities-metric-icon is-muted">
            <FilterX size={17} />
          </span>
          <p>Draft / Cancelled</p>
          <strong>{metrics.draftOrCancelled}</strong>
        </Card>
      </div>

      <Card as="section" className="admin-activities-filter-card">
        <div className="admin-activities-filter-head">
          <div>
            <h3>Find activities</h3>
            <p className="muted">Search title, skill, location, or organizer email. Filters are client-side for the first 100 API rows.</p>
          </div>
          {hasActiveFilters ? (
            <Button onClick={clearFilters} type="button" variant="secondary">
              <FilterX size={15} />
              Clear filters
            </Button>
          ) : null}
        </div>

        <div className="admin-activities-filter-grid">
          <label className="admin-activities-search-field">
            <span>Search</span>
            <div className="admin-activities-search-input">
              <Search size={16} />
              <Input
                aria-label="Search activities"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by title, skill, location, organizer email..."
                value={searchTerm}
              />
            </div>
          </label>

          <label>
            <span>Status</span>
            <Select
              aria-label="Filter by status"
              onChange={(event) => setStatusFilter(event.target.value as ActivityStatusFilter)}
              value={statusFilter}
            >
              <option value="all">All statuses</option>
              {ACTIVITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {toTitleCase(status)}
                </option>
              ))}
            </Select>
          </label>

          <label>
            <span>Date</span>
            <Select
              aria-label="Filter by date"
              onChange={(event) => setDateFilter(event.target.value as ActivityDateFilter)}
              value={dateFilter}
            >
              <option value="all">All dates</option>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
            </Select>
          </label>
        </div>
      </Card>

      <Card as="section" className="admin-activities-table-card">
        <div className="admin-activities-table-head">
          <div>
            <h3>Activities</h3>
            <p className="muted">
              Showing {visibleRangeStart}-{visibleRangeEnd} of {filteredActivities.length} filtered activities ({activities.length} total).
            </p>
          </div>
          {participationsWarning ? <span className="admin-activities-warning-pill">Registration counts unavailable</span> : null}
        </div>

        {isBlockingError ? (
          <div className="admin-activities-state admin-activities-state--error">
            <h3>Unable to load activities</h3>
            <p>{error}</p>
            <Button onClick={() => void loadData()} type="button" variant="secondary">
              Retry
            </Button>
          </div>
        ) : null}

        {!isBlockingError && error ? <p className="form-error">{error}</p> : null}
        {!isBlockingError && message ? <p className="form-success">{message}</p> : null}
        {!isBlockingError && participationsWarning ? <p className="admin-activities-warning-text">{participationsWarning}</p> : null}

        {!isBlockingError && loading ? (
          <div className="admin-activities-state">
            <RefreshCw className="admin-activities-spinner" size={22} />
            <p>Loading activities...</p>
          </div>
        ) : null}

        {!isBlockingError && !loading && activities.length === 0 ? (
          <div className="admin-activities-state">
            <h3>No activities found</h3>
            <p>Activities created by organizers or admins will appear here.</p>
          </div>
        ) : null}

        {!isBlockingError && !loading && activities.length > 0 ? (
          <Table className="admin-activities-table" wrapperClassName="admin-activities-table-wrap">
            <thead>
              <tr>
                <th>No.</th>
                <th>Activity</th>
                <th>Organizer</th>
                <th>Date / Time</th>
                <th>Location</th>
                <th>Capacity</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredActivities.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="admin-activities-state admin-activities-state--compact">
                      <h3>No matching activities</h3>
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
                paginatedActivities.map((activity, rowIndex) => {
                  const status = String(activity.status ?? 'draft').toLowerCase();
                  const skills = getActivitySkills(activity);
                  const registrationStats = registrationStatsByActivity.get(activity.id);
                  const organizer = organizerById.get(activity.organizer_id) ?? null;
                  const organizerName = String(organizer?.full_name ?? '').trim() || String(organizer?.email ?? '').trim() || 'Organizer unavailable';
                  const organizerEmail = String(organizer?.email ?? '').trim();
                  const capacity = Number(activity.capacity ?? 0);
                  const capacityValue = buildCapacityText(capacity);
                  const registeredCount = registrationStats ? registrationStats.registered : 0;
                  const capacityProgress =
                    registrationStats && capacity > 0 ? Math.min(100, Math.round((registeredCount / capacity) * 100)) : 0;

                  return (
                    <tr key={activity.id}>
                      <td>{visibleRangeStart + rowIndex}</td>
                      <td>
                        <div className="admin-activities-title-cell">
                          <strong>{activity.title}</strong>
                          <small>ID: {formatShortId(activity.id)}</small>
                          {skills[0] ? (
                            <Badge className="admin-activities-skill-badge" tone="info">
                              {skills[0]}
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="admin-activities-muted-cell">
                          <strong>{organizerName}</strong>
                          {organizerEmail && organizerEmail !== organizerName ? <small className="muted">{organizerEmail}</small> : null}
                        </div>
                      </td>
                      <td>{formatDateRange(activity.start_time, activity.end_time)}</td>
                      <td>
                        <div className="admin-activities-location-cell">
                          <MapPin size={14} />
                          <span>{getLocationLabel(activity.location)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="admin-activities-capacity-cell">
                          <div className="admin-activities-capacity-meta">
                            <span>{participationsWarning ? '--' : registeredCount}</span>
                            <small>/ {capacityValue}</small>
                          </div>
                          <div className="admin-activities-capacity-track" aria-hidden="true">
                            <div className="admin-activities-capacity-fill" style={{ width: `${capacityProgress}%` }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={getStatusTone(status)}>{toTitleCase(status || 'draft')}</Badge>
                      </td>
                      <td>
                        <div className="row-action-wrap">
                          <button
                            aria-expanded={openMenuActivityId === activity.id}
                            aria-haspopup="menu"
                            aria-label={`Open actions for ${activity.title}`}
                            className="row-menu-btn"
                            disabled={savingActivityId === activity.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              const triggerRect = event.currentTarget.getBoundingClientRect();
                              const availableBelow = window.innerHeight - triggerRect.bottom;
                              const availableAbove = triggerRect.top;
                              const estimatedMenuHeight = 250;
                              const shouldOpenUp = availableBelow < estimatedMenuHeight && availableAbove > availableBelow;

                              setMenuPlacement(shouldOpenUp ? 'up' : 'down');
                              setOpenMenuActivityId((current) => (current === activity.id ? null : activity.id));
                            }}
                            type="button"
                          >
                            <MoreVertical className="users-icon-sm" />
                          </button>

                          {openMenuActivityId === activity.id ? (
                            <div
                              aria-label="Activity row actions"
                              className={
                                menuPlacement === 'up'
                                  ? 'row-action-menu admin-activities-row-menu is-drop-up'
                                  : 'row-action-menu admin-activities-row-menu'
                              }
                              role="menu"
                            >
                              <button
                                className="row-action-item"
                                onClick={() => {
                                  setSelectedActivity(activity);
                                  setOpenMenuActivityId(null);
                                }}
                                type="button"
                              >
                                <Eye size={14} />
                                View Detail
                              </button>

                              <button
                                className="row-action-item danger"
                                disabled={savingActivityId === activity.id}
                                onClick={() => void handleDelete(activity.id)}
                                type="button"
                              >
                                <Trash2 size={14} />
                                Delete Activity
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        ) : null}

        {!isBlockingError && !loading && filteredActivities.length > ACTIVITIES_PAGE_SIZE ? (
          <div className="admin-activities-pagination">
            <Button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              type="button"
              variant="secondary"
            >
              Previous
            </Button>
            <span className="admin-activities-pagination-meta">
              Page {currentPage} / {totalPages}
            </span>
            <Button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              type="button"
              variant="secondary"
            >
              Next
            </Button>
          </div>
        ) : null}
      </Card>

      {selectedActivity ? (
        <div className="admin-activity-detail-backdrop" onClick={() => setSelectedActivity(null)} role="presentation">
          <Card
            aria-labelledby="admin-activity-detail-title"
            aria-modal="true"
            as="section"
            className="admin-activity-detail-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="admin-activity-detail-head">
              <div>
                <span className="admin-activities-eyebrow">Activity detail</span>
                <h3 id="admin-activity-detail-title">{selectedActivity.title}</h3>
                <p>ID: {selectedActivity.id}</p>
              </div>
              <Badge tone={getStatusTone(String(selectedActivity.status ?? 'draft'))}>
                {toTitleCase(String(selectedActivity.status ?? 'draft'))}
              </Badge>
            </div>

            <div className="admin-activity-detail-grid">
              <div>
                <span>Organizer</span>
                <strong>
                  {String(organizerById.get(selectedActivity.organizer_id)?.full_name ?? '').trim() ||
                    String(organizerById.get(selectedActivity.organizer_id)?.email ?? '').trim() ||
                    'Organizer unavailable'}
                </strong>
                {String(organizerById.get(selectedActivity.organizer_id)?.email ?? '').trim() &&
                String(organizerById.get(selectedActivity.organizer_id)?.email ?? '').trim() !==
                  (String(organizerById.get(selectedActivity.organizer_id)?.full_name ?? '').trim() ||
                    String(organizerById.get(selectedActivity.organizer_id)?.email ?? '').trim()) ? (
                  <small className="muted">{String(organizerById.get(selectedActivity.organizer_id)?.email ?? '').trim()}</small>
                ) : null}
              </div>
              <div>
                <span>Date / Time</span>
                <strong>{formatDateRange(selectedActivity.start_time, selectedActivity.end_time)}</strong>
              </div>
              <div>
                <span>Capacity</span>
                <strong>{buildCapacityText(selectedActivity.capacity)} spots</strong>
              </div>
              <div>
                <span>Location</span>
                <strong>{getLocationLabel(selectedActivity.location)}</strong>
              </div>
            </div>

            <div className="admin-activity-detail-section">
              <h4>Description</h4>
              <p>{selectedActivity.description || 'No description provided.'}</p>
            </div>

            <div className="admin-activity-detail-section">
              <h4>Skills / categories</h4>
              {getActivitySkills(selectedActivity).length > 0 ? (
                <div className="admin-activity-skill-list">
                  {getActivitySkills(selectedActivity).map((skill) => (
                    <Badge key={skill} tone="info">
                      {skill}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p>No skills provided.</p>
              )}
            </div>

            <div className="admin-activity-detail-actions">
              <Button onClick={() => setSelectedActivity(null)} type="button" variant="secondary">
                Close
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
