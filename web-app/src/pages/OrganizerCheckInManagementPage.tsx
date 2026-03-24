import { Check, CircleDashed, Clock3, Filter, RefreshCw, Search, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { Badge, Button, Card, Input, Select, Table } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { listActivities } from '../lib/activities';
import { checkInParticipation, listParticipations } from '../lib/participations';
import type { ActivityRecord } from '../types/activity';
import type { ParticipationRecord } from '../types/participation';
import './OrganizerCheckInManagementPage.css';

type AttendanceStatusFilter = 'all' | 'pending' | 'approved' | 'checked_in' | 'rejected' | 'cancelled';

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function formatCheckInTime(value: string | null | undefined) {
  if (!value) {
    return 'Not checked in';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not checked in';
  }

  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatActivityDate(value: string | null | undefined) {
  if (!value) {
    return 'Schedule TBD';
  }

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

function toTitleCase(value: string) {
  if (!value) {
    return 'Unknown';
  }

  return value
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function getStatusTone(status: string) {
  if (status === 'checked_in') {
    return 'success' as const;
  }
  if (status === 'rejected' || status === 'cancelled') {
    return 'danger' as const;
  }
  if (status === 'approved') {
    return 'accent' as const;
  }
  return 'info' as const;
}

export function OrganizerCheckInManagementPage() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();

  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [attendees, setAttendees] = useState<ParticipationRecord[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [bulkChecking, setBulkChecking] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatusFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
        limit: 150,
      });

      const requestedActivityId = searchParams.get('activityId')?.trim() ?? '';
      setActivities(rows);
      setSelectedActivityId((current) => {
        if (requestedActivityId && rows.some((activity) => activity.id === requestedActivityId)) {
          return requestedActivityId;
        }
        if (current && rows.some((activity) => activity.id === current)) {
          return current;
        }
        return rows[0]?.id ?? '';
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load activities.');
    } finally {
      setLoadingActivities(false);
    }
  }, [searchParams, session?.access_token]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const loadAttendees = useCallback(
    async (activityId: string) => {
      if (!session?.access_token || !activityId) {
        setAttendees([]);
        setLoadingAttendees(false);
        return;
      }

      setLoadingAttendees(true);
      setError(null);

      try {
        const rows = await listParticipations({
          accessToken: session.access_token,
          mine: true,
          activityId,
          limit: 400,
        });
        setAttendees(rows);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load attendee records.');
      } finally {
        setLoadingAttendees(false);
      }
    },
    [session?.access_token]
  );

  useEffect(() => {
    setMessage(null);
    setStatusFilter('all');
    void loadAttendees(selectedActivityId);
  }, [loadAttendees, selectedActivityId]);

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.id === selectedActivityId) ?? null,
    [activities, selectedActivityId]
  );

  const metrics = useMemo(() => {
    const activeStatuses = new Set(['pending', 'approved', 'checked_in']);
    const totalRegistered = attendees.filter((item) => activeStatuses.has(normalizeStatus(item.status))).length;
    const checkedIn = attendees.filter((item) => normalizeStatus(item.status) === 'checked_in').length;
    const notCheckedIn = Math.max(0, totalRegistered - checkedIn);
    const rate = totalRegistered > 0 ? Math.round((checkedIn / totalRegistered) * 100) : 0;

    return {
      capacity: Math.max(0, Number(selectedActivity?.capacity ?? 0)),
      totalRegistered,
      checkedIn,
      notCheckedIn,
      attendanceRate: rate,
    };
  }, [attendees, selectedActivity?.capacity]);

  const filteredAttendees = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return attendees.filter((item) => {
      const status = normalizeStatus(item.status);
      if (statusFilter !== 'all' && status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const fullName = String(item.volunteer?.full_name ?? '').toLowerCase();
      const phone = String(item.volunteer?.phone ?? '').toLowerCase();
      return (
        fullName.includes(normalizedSearch) ||
        phone.includes(normalizedSearch) ||
        item.id.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [attendees, searchTerm, statusFilter]);

  const checkInEligibleRows = useMemo(
    () =>
      filteredAttendees.filter((item) => {
        const status = normalizeStatus(item.status);
        return status === 'pending' || status === 'approved';
      }),
    [filteredAttendees]
  );

  const attendanceInsight = useMemo(() => {
    if (!selectedActivity) {
      return 'Select an activity to view attendance insight.';
    }

    if (metrics.totalRegistered === 0) {
      return 'No registrations yet. Attendance insight will appear once attendees are registered.';
    }

    const checkedInTimes = attendees
      .map((item) => item.checked_in_at)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((left, right) => left.getTime() - right.getTime());

    if (checkedInTimes.length === 0) {
      return `Current check-in rate is ${metrics.attendanceRate}%. No completed check-ins yet for "${selectedActivity.title}".`;
    }

    const first = checkedInTimes[0];
    const last = checkedInTimes[checkedInTimes.length - 1];
    const firstLabel = first.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const lastLabel = last.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `Current check-in rate is ${metrics.attendanceRate}%. Peak check-in flow is between ${firstLabel} and ${lastLabel}.`;
  }, [attendees, metrics.attendanceRate, metrics.totalRegistered, selectedActivity]);

  const handleCheckIn = async (participationId: string) => {
    if (!session?.access_token) {
      setError('No active session token.');
      return;
    }

    setCheckingInId(participationId);
    setError(null);
    setMessage(null);

    try {
      const updated = await checkInParticipation(participationId, session.access_token);
      setAttendees((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage('Check-in recorded successfully.');
    } catch (checkInError) {
      setError(checkInError instanceof Error ? checkInError.message : 'Failed to check in attendee.');
    } finally {
      setCheckingInId(null);
    }
  };

  const handleCheckInAll = async () => {
    if (!session?.access_token) {
      setError('No active session token.');
      return;
    }

    if (checkInEligibleRows.length === 0) {
      setMessage('No eligible attendees to check in for the current filter.');
      return;
    }

    setBulkChecking(true);
    setError(null);
    setMessage(null);

    const results = await Promise.allSettled(
      checkInEligibleRows.map((row) => checkInParticipation(row.id, session.access_token))
    );

    const successful = results.filter(
      (result): result is PromiseFulfilledResult<ParticipationRecord> => result.status === 'fulfilled'
    );
    const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

    if (successful.length > 0) {
      const updatedMap = new Map(successful.map((result) => [result.value.id, result.value]));
      setAttendees((current) => current.map((item) => updatedMap.get(item.id) ?? item));
      setMessage(
        successful.length === 1
          ? '1 attendee checked in successfully.'
          : `${successful.length} attendees checked in successfully.`
      );
    }

    if (failed.length > 0) {
      const firstError = failed[0].reason;
      setError(firstError instanceof Error ? firstError.message : 'Some check-ins could not be completed.');
    }

    setBulkChecking(false);
  };

  const loading = loadingActivities || loadingAttendees;

  return (
    <OrganizerShell
      activeNav="assignments"
      headerActions={
        <Button onClick={() => void loadAttendees(selectedActivityId)} type="button" variant="secondary">
          <RefreshCw size={15} />
          <span>Refresh</span>
        </Button>
      }
      onSearchChange={setSearchTerm}
      pageContext={<span className="org-checkin-context">Event Operations</span>}
      pageSubtitle="Track and manage volunteer attendance in real time."
      pageTitle="Check-in Management"
      searchPlaceholder="Search check-ins..."
      searchValue={searchTerm}
    >
      <section className="org-checkin-page">
        <Card as="section" className="org-checkin-header">
          <div className="org-checkin-header-copy">
            <p className="org-checkin-eyebrow">Select Activity</p>
            <Select
              className="org-checkin-activity-select"
              disabled={loadingActivities || activities.length === 0}
              onChange={(event) => setSelectedActivityId(event.target.value)}
              value={selectedActivityId}
            >
              {activities.length === 0 ? (
                <option value="">No activities available</option>
              ) : (
                activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.title}
                  </option>
                ))
              )}
            </Select>
            <p className="muted">{selectedActivity ? formatActivityDate(selectedActivity.start_time) : 'Schedule TBD'}</p>
          </div>
          <div className="org-checkin-capacity-badge">
            <span>Capacity</span>
            <strong>{metrics.capacity}</strong>
          </div>
        </Card>

        <div className="org-checkin-metrics">
          <Card as="article" className="org-checkin-metric-card">
            <span className="org-checkin-metric-icon">
              <UsersRound size={16} />
            </span>
            <p>Total Registered</p>
            <strong>{metrics.totalRegistered}</strong>
          </Card>

          <Card as="article" className="org-checkin-metric-card">
            <span className="org-checkin-metric-icon is-success">
              <Check size={16} />
            </span>
            <p>Checked In</p>
            <strong>{metrics.checkedIn}</strong>
            <small>{metrics.attendanceRate}% attendance rate</small>
          </Card>

          <Card as="article" className="org-checkin-metric-card">
            <span className="org-checkin-metric-icon is-danger">
              <CircleDashed size={16} />
            </span>
            <p>Not Checked In</p>
            <strong>{metrics.notCheckedIn}</strong>
          </Card>
        </div>

        <Card as="section" className="org-checkin-table-shell">
          <div className="org-checkin-toolbar">
            <div className="org-checkin-actions">
              <Button disabled={bulkChecking || checkInEligibleRows.length === 0} onClick={() => void handleCheckInAll()} type="button">
                <Check size={14} />
                <span>{bulkChecking ? 'Checking In...' : 'Check-in All'}</span>
              </Button>
              <Button disabled type="button" variant="secondary">
                <CircleDashed size={14} />
                <span>Mark All Absent</span>
              </Button>
            </div>

            <div className="org-checkin-filter-row">
              <label className="org-checkin-search-field" htmlFor="org-checkin-list-search">
                <Search size={14} />
                <Input
                  id="org-checkin-list-search"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search attendee..."
                  value={searchTerm}
                />
              </label>

              <label className="org-checkin-status-filter" htmlFor="org-checkin-status-filter">
                <Filter size={14} />
                <Select
                  id="org-checkin-status-filter"
                  onChange={(event) => setStatusFilter(event.target.value as AttendanceStatusFilter)}
                  sizeMode="small"
                  value={statusFilter}
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="checked_in">Checked In</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </label>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}
          {message && <p className="form-success">{message}</p>}

          {loading ? (
            <p className="muted">Loading check-in records...</p>
          ) : (
            <Table className="org-checkin-table" wrapperClassName="org-checkin-table-wrap">
              <thead>
                <tr>
                  <th>Volunteer</th>
                  <th>Status</th>
                  <th>Check-in Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendees.map((attendee) => {
                  const status = normalizeStatus(attendee.status);
                  const canCheckIn = status === 'pending' || status === 'approved';
                  const volunteerName = attendee.volunteer?.full_name?.trim() || 'Volunteer';
                  const volunteerMeta = attendee.volunteer?.phone?.trim() || attendee.id.slice(0, 8);

                  return (
                    <tr key={attendee.id}>
                      <td>
                        <div className="org-checkin-volunteer-cell">
                          <span className="org-checkin-avatar">{volunteerName.charAt(0).toUpperCase()}</span>
                          <div>
                            <strong>{volunteerName}</strong>
                            <small>{volunteerMeta}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={getStatusTone(status)}>{toTitleCase(status)}</Badge>
                      </td>
                      <td>
                        <div className="org-checkin-time-cell">
                          <span>{formatCheckInTime(attendee.checked_in_at)}</span>
                          {status === 'checked_in' && (
                            <small>
                              <Clock3 size={12} />
                              <span>Attendance recorded</span>
                            </small>
                          )}
                        </div>
                      </td>
                      <td>
                        <Button
                          disabled={checkingInId === attendee.id || !canCheckIn}
                          onClick={() => void handleCheckIn(attendee.id)}
                          type="button"
                          variant="secondary"
                        >
                          {checkingInId === attendee.id ? 'Checking...' : status === 'checked_in' ? 'Checked In' : 'Check-in'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredAttendees.length === 0 && (
                  <tr>
                    <td className="org-checkin-empty-cell" colSpan={4}>
                      No attendees found for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          )}
        </Card>

        <Card as="section" className="org-checkin-insight">
          <div className="org-checkin-insight-icon">
            <Filter size={15} />
          </div>
          <div className="org-checkin-insight-copy">
            <p className="org-checkin-insight-eyebrow">Attendance Insight</p>
            <h3>Attendance Trend Analysis</h3>
            <p>{attendanceInsight}</p>
          </div>
          <Button type="button">Optimize Flow</Button>
        </Card>
      </section>
    </OrganizerShell>
  );
}
