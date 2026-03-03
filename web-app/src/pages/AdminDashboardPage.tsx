import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { apiRequest } from '../lib/api';

interface DashboardMetrics {
  totalUsers: number;
  activeUsers: number;
  totalActivities: number;
  publishedActivities: number;
  completedActivities: number;
  totalParticipations: number;
  checkedInParticipations: number;
  totalReports: number;
  usersByRole: Record<string, number>;
  activitiesByStatus: Record<string, number>;
  participationsByStatus: Record<string, number>;
}

interface DistributionProps {
  title: string;
  data: Record<string, number>;
}

function DistributionList({ title, data }: DistributionProps) {
  const entries = Object.entries(data);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  return (
    <article className="metric-block">
      <h3>{title}</h3>
      {entries.length === 0 && <p className="muted">No data.</p>}
      {entries.length > 0 && (
        <ul className="distribution-list">
          {entries.map(([label, value]) => {
            const width = total === 0 ? 0 : Math.round((value / total) * 100);
            return (
              <li key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${width}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

export function AdminDashboardPage() {
  const { session } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dashboardMetrics = await apiRequest<DashboardMetrics>('/admin/dashboard', {
        accessToken: session.access_token,
      });
      setMetrics(dashboardMetrics);
      setLastSync(new Date().toLocaleString());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load dashboard';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const cards = useMemo(
    () => [
      { label: 'Total Users', value: metrics?.totalUsers ?? 0 },
      { label: 'Active Users', value: metrics?.activeUsers ?? 0 },
      { label: 'Total Activities', value: metrics?.totalActivities ?? 0 },
      { label: 'Published Activities', value: metrics?.publishedActivities ?? 0 },
      { label: 'Completed Activities', value: metrics?.completedActivities ?? 0 },
      { label: 'Participations', value: metrics?.totalParticipations ?? 0 },
      { label: 'Checked-in', value: metrics?.checkedInParticipations ?? 0 },
      { label: 'Activity Reports', value: metrics?.totalReports ?? 0 },
    ],
    [metrics]
  );

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h2>Admin Dashboard</h2>
          <p className="muted">Live metrics from public tables in Supabase.</p>
        </div>
        <button className="secondary-btn" onClick={() => void loadDashboard()} type="button">
          Refresh
        </button>
      </div>

      {lastSync && <p className="muted">Last sync: {lastSync}</p>}
      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="muted">Loading dashboard...</p>
      ) : (
        <>
          <div className="metric-grid">
            {cards.map((card) => (
              <article className="metric-card" key={card.label}>
                <p>{card.label}</p>
                <strong>{card.value}</strong>
              </article>
            ))}
          </div>

          <div className="distribution-grid">
            <DistributionList data={metrics?.usersByRole ?? {}} title="Users by Role" />
            <DistributionList data={metrics?.activitiesByStatus ?? {}} title="Activities by Status" />
            <DistributionList data={metrics?.participationsByStatus ?? {}} title="Participations by Status" />
          </div>
        </>
      )}
    </section>
  );
}
