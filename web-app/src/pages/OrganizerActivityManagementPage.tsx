import {
  CalendarDays,
  MoreVertical,
  PlusCircle,
  RefreshCw,
  Ticket,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { AttendanceStatusBadge, CheckInResultState, type CheckInResultTone } from '../components/attendance';
import { Badge, Button, Card, Table } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { formatActivityLocation } from '../lib/activityLocation';
import { deleteActivity, listActivities, updateActivity } from '../lib/activities';
import { checkInParticipation, listParticipations } from '../lib/participations';
import type { ActivityRecord, ActivityStatus } from '../types/activity';
import type { ParticipationRecord } from '../types/participation';
import './OrganizerActivityManagementPage.css';

const statusOptions: ActivityStatus[] = ['draft', 'published', 'completed', 'cancelled'];

function formatDateLabel(value: string) {
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

function getLocationLabel(location: ActivityRecord['location']) {
  return formatActivityLocation(location);
}

function toTitleCase(value: string) {
  if (!value) {
    return 'Unknown';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getActivityStatusTone(status: string) {
  if (status === 'published') {
    return 'accent' as const;
  }
  if (status === 'completed') {
    return 'success' as const;
  }
  if (status === 'cancelled') {
    return 'danger' as const;
  }
  return 'neutral' as const;
}

interface AttendanceNoticeState {
  tone: CheckInResultTone;
  title: string;
  description?: string;
}

export function OrganizerActivityManagementPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [participations, setParticipations] = useState<ParticipationRecord[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<ParticipationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [openMenuActivityId, setOpenMenuActivityId] = useState<string | null>(null);
  const [openStatusPickerActivityId, setOpenStatusPickerActivityId] = useState<string | null>(null);
  const [menuPlacement, setMenuPlacement] = useState<'down' | 'up'>('down');
  const [savingActivityId, setSavingActivityId] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [checkingInParticipationId, setCheckingInParticipationId] = useState<string | null>(null);
  const [attendanceNotice, setAttendanceNotice] = useState<AttendanceNoticeState | null>(null);

  const loadData = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [activityRows, participationRows] = await Promise.all([
        listActivities({
          accessToken: session.access_token,
          mine: true,
          status: 'all',
          limit: 120,
        }),
        listParticipations({
          accessToken: session.access_token,
          mine: true,
          limit: 400,
        }),
      ]);

      setActivities(activityRows);
      setParticipations(participationRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load activity management data.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

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
      setOpenStatusPickerActivityId(null);
    };

    window.addEventListener('click', handleWindowClick);
    return () => {
      window.removeEventListener('click', handleWindowClick);
    };
  }, []);

  const participationStatsByActivity = useMemo(() => {
    const map = new Map<string, { joined: number; pending: number }>();

    participations.forEach((participation) => {
      const activityId = participation.activityId ?? participation.activity_id;
      if (!activityId) {
        return;
      }

      const current = map.get(activityId) ?? { joined: 0, pending: 0 };
      const status = String(participation.status ?? '').toLowerCase();

      const countsForJoined = status === 'pending' || status === 'approved' || status === 'checked_in';
      if (countsForJoined) {
        current.joined += 1;
      }

      if (status === 'pending') {
        current.pending += 1;
      }

      map.set(activityId, current);
    });

    return map;
  }, [participations]);

  const filteredActivities = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) {
      return activities;
    }

    return activities.filter((activity) => {
      const category = Array.isArray(activity.required_skills) ? activity.required_skills[0] ?? '' : '';
      const location = getLocationLabel(activity.location);
      return (
        activity.title.toLowerCase().includes(normalized) ||
        category.toLowerCase().includes(normalized) ||
        location.toLowerCase().includes(normalized)
      );
    });
  }, [activities, searchTerm]);

  const metrics = useMemo(() => {
    const totalActivities = activities.length;
    const openActivities = activities.filter((activity) => String(activity.status).toLowerCase() === 'published').length;
    const closedActivities = activities.filter((activity) => {
      const status = String(activity.status).toLowerCase();
      return status === 'completed' || status === 'cancelled';
    }).length;
    const pendingRegistrations = participations.filter(
      (participation) => String(participation.status).toLowerCase() === 'pending'
    ).length;

    return {
      totalActivities,
      openActivities,
      closedActivities,
      pendingRegistrations,
    };
  }, [activities, participations]);

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.id === selectedActivityId) ?? null,
    [activities, selectedActivityId]
  );

  const loadAttendanceForActivity = useCallback(
    async (activityId: string) => {
      if (!session?.access_token) {
        setError('No active session token.');
        return;
      }

      setAttendanceLoading(true);
      setAttendanceNotice(null);
      setSelectedActivityId(activityId);

      try {
        const rows = await listParticipations({
          accessToken: session.access_token,
          mine: true,
          activityId,
          limit: 300,
        });
        setAttendanceRows(rows);
      } catch (loadError) {
        setAttendanceNotice({
          tone: 'error',
          title: 'Unable to load attendance list',
          description: loadError instanceof Error ? loadError.message : 'Failed to load attendance list.',
        });
      } finally {
        setAttendanceLoading(false);
      }
    },
    [session?.access_token]
  );

  const handleCheckIn = async (participationId: string) => {
    if (!session?.access_token) {
      setAttendanceNotice({
        tone: 'error',
        title: 'Check-in failed',
        description: 'No active session token.',
      });
      return;
    }

    setCheckingInParticipationId(participationId);
    setAttendanceNotice(null);

    try {
      const updated = await checkInParticipation(participationId, session.access_token);
      setAttendanceRows((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setParticipations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setAttendanceNotice({
        tone: 'success',
        title: 'Check-in successful',
        description: 'Volunteer attendance was recorded for this activity.',
      });
    } catch (checkInError) {
      setAttendanceNotice({
        tone: 'error',
        title: 'Check-in failed',
        description: checkInError instanceof Error ? checkInError.message : 'Failed to check in volunteer.',
      });
    } finally {
      setCheckingInParticipationId(null);
    }
  };

  const handleChangeStatus = async (activityId: string, status: ActivityStatus) => {
    if (!session?.access_token) {
      setError('No active session token.');
      return;
    }

    setSavingActivityId(activityId);
    setError(null);
    setMessage(null);

    try {
      const updated = await updateActivity(
        activityId,
        {
          status,
        },
        session.access_token
      );

      setActivities((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(`Activity status changed to ${status}.`);
      setOpenStatusPickerActivityId(null);
      setOpenMenuActivityId(null);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update activity status.');
    } finally {
      setSavingActivityId(null);
    }
  };

  const handleDelete = async (activityId: string) => {
    if (!session?.access_token) {
      setError('No active session token.');
      return;
    }

    const confirmed = window.confirm('Delete this activity?');
    if (!confirmed) {
      return;
    }

    setSavingActivityId(activityId);
    setError(null);
    setMessage(null);

    try {
      await deleteActivity(activityId, session.access_token);
      setActivities((current) => current.filter((item) => item.id !== activityId));
      setParticipations((current) =>
        current.filter((participation) => (participation.activityId ?? participation.activity_id) !== activityId)
      );
      if (selectedActivityId === activityId) {
        setSelectedActivityId(null);
        setAttendanceRows([]);
      }
      setMessage('Activity deleted.');
      setOpenMenuActivityId(null);
      setOpenStatusPickerActivityId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete activity.');
    } finally {
      setSavingActivityId(null);
    }
  };

  return (
    <OrganizerShell
      activeNav="activities"
      headerActions={
        <>
          <Button onClick={() => navigate('/organizer/recommendations')} type="button" variant="secondary">
            <UsersRound size={15} />
            <span>AI Recommendations</span>
          </Button>
          <Button onClick={() => void loadData()} type="button" variant="secondary">
            <RefreshCw size={15} />
            <span>Refresh</span>
          </Button>
          <Button onClick={() => navigate('/activities/create')} type="button">
            <PlusCircle size={15} />
            <span>Create New Activity</span>
          </Button>
        </>
      }
      onSearchChange={setSearchTerm}
      pageSubtitle="Manage created activities, review registrations, and update activity status."
      pageTitle="Activity Management"
      searchPlaceholder="Search activities..."
      searchValue={searchTerm}
    >
      <section className="org-activities-page">
        <div className="org-activities-metrics">
          <Card as="article" className="org-activities-metric-card">
            <span className="org-activities-metric-icon">
              <Ticket size={16} />
            </span>
            <p>Total Activities</p>
            <strong>{metrics.totalActivities}</strong>
          </Card>

          <Card as="article" className="org-activities-metric-card">
            <span className="org-activities-metric-icon is-success">
              <CalendarDays size={16} />
            </span>
            <p>Open Activities</p>
            <strong>{metrics.openActivities}</strong>
          </Card>

          <Card as="article" className="org-activities-metric-card">
            <span className="org-activities-metric-icon is-muted">
              <RefreshCw size={16} />
            </span>
            <p>Closed Activities</p>
            <strong>{metrics.closedActivities}</strong>
          </Card>

          <Card as="article" className="org-activities-metric-card">
            <span className="org-activities-metric-icon is-warning">
              <UsersRound size={16} />
            </span>
            <p>Pending Registrations</p>
            <strong>{metrics.pendingRegistrations}</strong>
          </Card>
        </div>

        <Card as="section" className="org-activities-table-shell">
          {error && <p className="form-error">{error}</p>}
          {message && <p className="form-success">{message}</p>}

          {loading ? (
            <p className="muted">Loading activities...</p>
          ) : (
            <Table className="org-activities-table" wrapperClassName="org-activities-table-wrap">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Location</th>
                  <th>Participants</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivities.map((activity) => {
                  const category = Array.isArray(activity.required_skills)
                    ? activity.required_skills[0] || 'General'
                    : 'General';

                  const participationStats = participationStatsByActivity.get(activity.id) ?? {
                    joined: 0,
                    pending: 0,
                  };

                  const capacity = Math.max(1, Number(activity.capacity ?? 0));
                  const progress = Math.min(100, Math.round((participationStats.joined / capacity) * 100));
                  const status = String(activity.status ?? 'draft').toLowerCase();

                  return (
                    <tr key={activity.id}>
                      <td>
                        <div className="org-activities-title-cell">
                          <strong>{activity.title}</strong>
                          <small>ID: {activity.id.slice(0, 8)}</small>
                        </div>
                      </td>
                      <td>
                        <Badge className="org-activities-category" tone="info">
                          {category}
                        </Badge>
                      </td>
                      <td>{formatDateLabel(activity.start_time)}</td>
                      <td>{getLocationLabel(activity.location)}</td>
                      <td>
                        <div className="org-activities-participants-cell">
                          <div className="org-activities-participants-meta">
                            <span>
                              {participationStats.joined}/{capacity}
                            </span>
                            <small>{progress}%</small>
                          </div>
                          <div className="org-activities-progress-track" role="presentation">
                            <div className="org-activities-progress-fill" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={getActivityStatusTone(status)}>{toTitleCase(status)}</Badge>
                      </td>
                      <td>
                        <div className="row-action-wrap">
                          <button
                            aria-expanded={openMenuActivityId === activity.id}
                            aria-haspopup="menu"
                            aria-label="Open row actions"
                            className="row-menu-btn"
                            disabled={savingActivityId === activity.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              const triggerRect = event.currentTarget.getBoundingClientRect();
                              const availableBelow = window.innerHeight - triggerRect.bottom;
                              const availableAbove = triggerRect.top;
                              const estimatedMenuHeight = 220;
                              const shouldOpenUp =
                                availableBelow < estimatedMenuHeight && availableAbove > availableBelow;

                              setMenuPlacement(shouldOpenUp ? 'up' : 'down');
                              setOpenMenuActivityId((current) => (current === activity.id ? null : activity.id));
                              setOpenStatusPickerActivityId(null);
                            }}
                            type="button"
                          >
                            <MoreVertical className="users-icon-sm" />
                          </button>

                          {openMenuActivityId === activity.id && (
                            <div
                              className={
                                menuPlacement === 'up'
                                  ? 'row-action-menu org-row-action-menu is-drop-up'
                                  : 'row-action-menu org-row-action-menu'
                              }
                              role="menu"
                            >
                              <button
                                className="row-action-item"
                                onClick={() => {
                                  void loadAttendanceForActivity(activity.id);
                                  setOpenMenuActivityId(null);
                                  setOpenStatusPickerActivityId(null);
                                }}
                                type="button"
                              >
                                Manage Attendance
                              </button>

                              <button
                                className="row-action-item"
                                onClick={() => {
                                  navigate(`/activities/${activity.id}/edit`);
                                  setOpenMenuActivityId(null);
                                  setOpenStatusPickerActivityId(null);
                                }}
                                type="button"
                              >
                                Edit Activity
                              </button>

                              <button
                                aria-expanded={openStatusPickerActivityId === activity.id}
                                className="row-action-item"
                                onClick={() =>
                                  setOpenStatusPickerActivityId((current) => (current === activity.id ? null : activity.id))
                                }
                                type="button"
                              >
                                Change Status
                              </button>

                              {openStatusPickerActivityId === activity.id && (
                                <div className="org-row-status-submenu">
                                  {statusOptions.map((statusOption) => (
                                    <button
                                      className={
                                        status === statusOption ? 'row-action-item is-current-status' : 'row-action-item'
                                      }
                                      key={statusOption}
                                      onClick={() => void handleChangeStatus(activity.id, statusOption)}
                                      type="button"
                                    >
                                      {toTitleCase(statusOption)}
                                    </button>
                                  ))}
                                </div>
                              )}

                              <button
                                className="row-action-item"
                                onClick={() => {
                                  navigate(`/organizer/recommendations?activityId=${activity.id}`);
                                  setOpenMenuActivityId(null);
                                  setOpenStatusPickerActivityId(null);
                                }}
                                type="button"
                              >
                                Recommend Volunteers
                              </button>

                              <button
                                className="row-action-item"
                                onClick={() => {
                                  setMessage('Other actions are coming soon.');
                                  setOpenMenuActivityId(null);
                                  setOpenStatusPickerActivityId(null);
                                }}
                                type="button"
                              >
                                Other actions
                              </button>

                              <button
                                className="row-action-item danger"
                                onClick={() => void handleDelete(activity.id)}
                                type="button"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredActivities.length === 0 && (
                  <tr>
                    <td className="org-activities-empty" colSpan={7}>
                      No activities found.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          )}
        </Card>

        {selectedActivity && (
          <Card as="section" className="org-attendance-shell">
            <div className="org-attendance-head">
              <div>
                <h2>Attendance for {selectedActivity.title}</h2>
                <p className="muted">Track check-ins and volunteer participation statuses.</p>
              </div>
              <Button
                disabled={attendanceLoading}
                onClick={() => void loadAttendanceForActivity(selectedActivity.id)}
                type="button"
                variant="secondary"
              >
                {attendanceLoading ? 'Refreshing...' : 'Refresh Attendance'}
              </Button>
            </div>

            {attendanceNotice ? (
              <CheckInResultState
                className="org-attendance-result"
                description={attendanceNotice.description}
                title={attendanceNotice.title}
                tone={attendanceNotice.tone}
              />
            ) : null}

            {attendanceLoading ? (
              <p className="muted">Loading attendance records...</p>
            ) : (
              <Table className="org-attendance-table" wrapperClassName="org-attendance-table-wrap">
                <thead>
                  <tr>
                    <th>Volunteer</th>
                    <th>Status</th>
                    <th>Match Score</th>
                    <th>Checked In At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRows.map((participation) => {
                    const status = String(participation.status ?? '').toLowerCase();
                    const score =
                      typeof participation.ai_match_score === 'number'
                        ? Math.round(
                            participation.ai_match_score <= 1
                              ? participation.ai_match_score * 100
                              : participation.ai_match_score
                          )
                        : null;

                    return (
                      <tr key={participation.id}>
                        <td>{participation.volunteer?.full_name ?? participation.volunteer_id ?? 'Unknown volunteer'}</td>
                        <td>
                          <AttendanceStatusBadge status={status} />
                        </td>
                        <td>{score !== null ? `${score}%` : '--'}</td>
                        <td>
                          <div className="org-attendance-time-cell">
                            <span>
                              {participation.checked_in_at
                                ? new Date(participation.checked_in_at).toLocaleString()
                                : 'Not checked in'}
                            </span>
                            <AttendanceStatusBadge
                              className="org-attendance-time-badge"
                              status={participation.checked_in_at ? 'checked_in' : 'not_checked_in'}
                            />
                          </div>
                        </td>
                        <td>
                          <Button
                            disabled={
                              checkingInParticipationId === participation.id ||
                              status === 'checked_in' ||
                              status === 'rejected'
                            }
                            onClick={() => void handleCheckIn(participation.id)}
                            type="button"
                            variant="secondary"
                          >
                            {checkingInParticipationId === participation.id
                              ? 'Checking...'
                              : status === 'checked_in'
                                ? 'Checked In'
                                : 'Check In'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}

                  {attendanceRows.length === 0 && (
                    <tr>
                      <td className="org-activities-empty" colSpan={5}>
                        No participation records for this activity yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            )}
          </Card>
        )}
      </section>
    </OrganizerShell>
  );
}
