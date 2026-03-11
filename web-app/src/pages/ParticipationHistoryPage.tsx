import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, History, LayoutDashboard, Settings, UserCircle, BriefcaseBusiness } from 'lucide-react';

import { useAuth } from '../auth/useAuth';
import { mockParticipationHistory } from '../lib/participationMocks';
import type { ParticipationMockRecord, ParticipationStatus } from '../lib/participationMocks';
import './ParticipationHistoryPage.css';

type StatusFilter = ParticipationStatus | 'all';

const STATUS_TABS: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Cancelled', value: 'cancelled' },
];

const PAGE_SIZE = 4;

function formatDateLabel(value: string) {
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

function statusLabel(status: ParticipationStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ParticipationHistoryPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ParticipationMockRecord[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecords(mockParticipationHistory);
      setLoading(false);
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return records.filter((record) => {
      const matchStatus = statusFilter === 'all' || record.status === statusFilter;
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
    <main className="history-page">
      <aside className="history-sidebar">
        <div className="history-brand">V-Connect</div>
        <nav className="history-nav">
          <button className="history-nav-item" onClick={() => navigate('/volunteer/home')} type="button">
            <LayoutDashboard className="history-nav-icon" />
            Dashboard
          </button>
          <button className="history-nav-item is-active" type="button">
            <History className="history-nav-icon" />
            Participation
          </button>
          <button className="history-nav-item" onClick={() => navigate('/browse')} type="button">
            <BriefcaseBusiness className="history-nav-icon" />
            Opportunities
          </button>
          <button className="history-nav-item" onClick={() => navigate('/volunteer/profile-ui')} type="button">
            <Settings className="history-nav-icon" />
            Settings
          </button>
        </nav>

        <div className="history-sidebar-footer">
          <span className="history-avatar">{(profile?.full_name ?? 'V').slice(0, 2).toUpperCase()}</span>
          <div>
            <p>{profile?.full_name ?? 'Volunteer'}</p>
            <small>Volunteer</small>
          </div>
        </div>
      </aside>

      <section className="history-content">
        <header className="history-topbar">
          <strong>Participation History</strong>
          <div className="history-top-icons">
            <button type="button">
              <Bell className="history-top-icon" />
            </button>
            <button type="button">
              <UserCircle className="history-top-icon" />
            </button>
          </div>
        </header>

        <div className="history-main">
          <div className="history-head">
            <h1>Your Volunteering Journey</h1>
            <p>Track your past impacts and upcoming commitments in one place.</p>
          </div>

          <section className="history-metrics">
            <article className="history-metric-card">
              <p>Activities Joined</p>
              <strong>{records.length}</strong>
              <small>{completedCount} completed</small>
            </article>
            <article className="history-metric-card">
              <p>Total Hours</p>
              <strong>{totalHours.toFixed(1)}</strong>
              <small>this month contribution</small>
            </article>
            <article className="history-metric-card">
              <p>Impact Score</p>
              <strong>{impactScore}</strong>
              <small>Community Guardian</small>
            </article>
          </section>

          <section className="history-table-shell">
            <div className="history-table-tools">
              <div className="history-tabs">
                {STATUS_TABS.map((tab) => (
                  <button
                    className={statusFilter === tab.value ? 'history-tab is-active' : 'history-tab'}
                    key={tab.value}
                    onClick={() => setStatusFilter(tab.value)}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <input
                className="history-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search activities..."
                type="search"
                value={query}
              />
            </div>

            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Activity Name</th>
                    <th>Organization</th>
                    <th>Date</th>
                    <th>Hours</th>
                    <th>Status</th>
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
                            <History className="history-activity-icon" />
                            <span>{record.activityName}</span>
                          </div>
                        </td>
                        <td>{record.organization}</td>
                        <td>{formatDateLabel(record.date)}</td>
                        <td>{formatHours(record.hours)}</td>
                        <td>
                          <span className={`history-status history-status-${record.status}`}>
                            {statusLabel(record.status)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="history-view-btn"
                            onClick={() => navigate(`/volunteer/activity/${record.id}`)}
                            type="button"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="history-pagination">
              <small>
                Showing {filteredRecords.length === 0 ? 0 : startIndex + 1} to{' '}
                {Math.min(startIndex + PAGE_SIZE, filteredRecords.length)} of {filteredRecords.length} results
              </small>

              <div className="history-pagination-actions">
                <button
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
