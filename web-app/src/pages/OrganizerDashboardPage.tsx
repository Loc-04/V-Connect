import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { deleteActivity, listActivities, updateActivity } from '../lib/activities';
import type { ActivityRecord, ActivityStatus } from '../types/activity';

const statusOptions: ActivityStatus[] = ['draft', 'published', 'completed', 'cancelled'];

export function OrganizerDashboardPage() {
  const navigate = useNavigate();
  const { profile, session, signOut } = useAuth();
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, ActivityStatus | string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadActivities = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rows = await listActivities({
        accessToken: session.access_token,
        mine: true,
        status: 'all',
        limit: 100,
      });

      setActivities(rows);
      setStatusDrafts(
        Object.fromEntries(rows.map((activity) => [activity.id, String(activity.status ?? 'draft')]))
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load activities.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleSaveStatus = async (activityId: string) => {
    if (!session?.access_token) {
      setError('No active session token.');
      return;
    }

    const nextStatus = statusDrafts[activityId];
    if (!nextStatus || !statusOptions.includes(nextStatus as ActivityStatus)) {
      setError('Invalid status value.');
      return;
    }

    setSavingId(activityId);
    setMessage(null);
    setError(null);

    try {
      const updated = await updateActivity(
        activityId,
        {
          status: nextStatus as ActivityStatus,
        },
        session.access_token
      );

      setActivities((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setMessage(`Updated activity status to ${updated.status}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update activity.');
    } finally {
      setSavingId(null);
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

    setSavingId(activityId);
    setMessage(null);
    setError(null);

    try {
      await deleteActivity(activityId, session.access_token);
      setActivities((current) => current.filter((row) => row.id !== activityId));
      setMessage('Activity deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete activity.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="app-shell">
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Organizer Activities</h2>
            <p className="muted">Welcome {profile?.full_name ?? 'Organizer'}.</p>
          </div>
          <div className="header-actions">
            <button className="primary-btn" onClick={() => navigate('/activities/create')} type="button">
              Create Activity
            </button>
            <button className="secondary-btn" onClick={() => void loadActivities()} type="button">
              Refresh
            </button>
            <button className="secondary-btn" onClick={() => navigate('/feedback')} type="button">
              Feedback
            </button>
            <button className="danger-btn" onClick={handleSignOut} type="button">
              Logout
            </button>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}

        {loading ? (
          <p className="muted">Loading activities...</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Start</th>
                  <th>Capacity</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => (
                  <tr key={activity.id}>
                    <td>{activity.title}</td>
                    <td>{new Date(activity.start_time).toLocaleString()}</td>
                    <td>{activity.capacity}</td>
                    <td>
                      <select
                        className="text-input small"
                        onChange={(event) =>
                          setStatusDrafts((current) => ({
                            ...current,
                            [activity.id]: event.target.value,
                          }))
                        }
                        value={statusDrafts[activity.id] ?? String(activity.status)}
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="header-actions">
                        <button
                          className="secondary-btn"
                          disabled={savingId === activity.id}
                          onClick={() => void handleSaveStatus(activity.id)}
                          type="button"
                        >
                          {savingId === activity.id ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          className="danger-btn"
                          disabled={savingId === activity.id}
                          onClick={() => void handleDelete(activity.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {activities.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <p className="muted">No activities found. Create your first one.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
