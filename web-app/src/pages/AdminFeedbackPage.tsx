import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, MessageSquare, RefreshCw, Star } from 'lucide-react';

import { useAuth } from '../auth/useAuth';
import { listFeedbacks } from '../lib/feedback';
import { listParticipations } from '../lib/participations';
import type { FeedbackRecord } from '../types/feedback';
import type { ParticipationRecord } from '../types/participation';
import './AdminFeedbackPage.css';

interface AdminFeedbackItem {
  id: string;
  participationId: string;
  activityTitle: string;
  organization: string;
  volunteerName: string;
  rating: number;
  comment: string;
  submittedAt: string | null;
}

function formatDateLabel(value: string | null): string {
  if (!value) {
    return 'Recently';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Recently';
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildFeedbackItems(
  feedbacks: FeedbackRecord[],
  participations: ParticipationRecord[]
): AdminFeedbackItem[] {
  const participationById = new Map(
    participations.map((participation) => [participation.participationId || participation.id, participation])
  );

  return feedbacks.map((feedback) => {
    const participation = participationById.get(feedback.participation_id);

    return {
      id: feedback.id,
      participationId: feedback.participation_id,
      activityTitle: participation?.activityName ?? `Participation ${feedback.participation_id.slice(0, 8)}`,
      organization: participation?.organization ?? 'Organizer',
      volunteerName: participation?.volunteer?.full_name?.trim() || 'Volunteer',
      rating: Number(feedback.rating || 0),
      comment: feedback.comment?.trim() || 'No written feedback provided.',
      submittedAt: feedback.created_at ?? null,
    };
  });
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="admin-feedback-stars" aria-label={`Rating ${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => {
        const active = index < Math.round(rating);
        return <Star className={active ? 'admin-feedback-star is-active' : 'admin-feedback-star'} key={`${rating}-${index}`} />;
      })}
    </div>
  );
}

export function AdminFeedbackPage() {
  const { session, profile } = useAuth();
  const [items, setItems] = useState<AdminFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const isAdmin = String(profile?.role ?? '') === 'admin';

  const loadFeedback = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [feedbacks, participations] = await Promise.all([
        listFeedbacks({ accessToken: session.access_token, limit: 50 }),
        listParticipations({ accessToken: session.access_token, limit: 100 }),
      ]);

      setItems(buildFeedbackItems(feedbacks, participations));
      setLastSync(new Date().toLocaleString());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load feedback.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  const metrics = useMemo(() => {
    const total = items.length;
    const averageRating = total === 0 ? 0 : items.reduce((sum, item) => sum + item.rating, 0) / total;
    const positiveCount = items.filter((item) => item.rating >= 4).length;

    return {
      total,
      averageRating,
      positiveCount,
    };
  }, [items]);

  return (
    <section className="admin-feedback-page">
      <p className="users-caption">{isAdmin ? 'Admin feedback oversight' : 'Organizer feedback overview'}</p>

      <div className="users-page-head admin-feedback-head">
        <div>
          <h2>{isAdmin ? 'Feedback' : 'Activity Feedback'}</h2>
          <p className="muted">
            {isAdmin
              ? 'Review volunteer feedback submissions without leaving the admin workspace.'
              : 'Review volunteer feedback for activities you organize.'}
          </p>
        </div>
        <button className="secondary-btn dashboard-refresh-btn" onClick={() => void loadFeedback()} type="button">
          <RefreshCw className="admin-feedback-refresh-icon" />
          Refresh
        </button>
      </div>

      {lastSync && <p className="muted dashboard-last-sync">Last sync: {lastSync}</p>}

      <div className="dashboard-metric-grid admin-feedback-metric-grid">
        <article className="metric-card dashboard-metric-card admin-feedback-metric-card">
          <span className="admin-feedback-metric-icon">
            <MessageSquare className="admin-feedback-metric-icon-svg" />
          </span>
          <p>Total Feedback</p>
          <strong>{metrics.total}</strong>
        </article>
        <article className="metric-card dashboard-metric-card admin-feedback-metric-card">
          <span className="admin-feedback-metric-icon is-highlight">
            <Star className="admin-feedback-metric-icon-svg" />
          </span>
          <p>Average Rating</p>
          <strong>{metrics.averageRating.toFixed(1)}</strong>
        </article>
        <article className="metric-card dashboard-metric-card admin-feedback-metric-card">
          <span className="admin-feedback-metric-icon is-soft">
            <ClipboardList className="admin-feedback-metric-icon-svg" />
          </span>
          <p>Positive Reviews</p>
          <strong>{metrics.positiveCount}</strong>
        </article>
      </div>

      <section className="users-table-card admin-feedback-panel">
        {error && <p className="form-error">{error}</p>}

        {loading ? (
          <p className="muted">Loading feedback...</p>
        ) : items.length === 0 ? (
          <div className="admin-feedback-empty">
            <ClipboardList className="admin-feedback-empty-icon" />
            <div>
              <h3>No feedback available</h3>
              <p className="muted">Volunteer feedback will appear here after submissions are created.</p>
            </div>
          </div>
        ) : (
          <div className="admin-feedback-list">
            {items.map((item) => (
              <article className="admin-feedback-item" key={item.id}>
                <div className="admin-feedback-item-head">
                  <div>
                    <h3>{item.activityTitle}</h3>
                    <p className="muted">
                      {item.volunteerName} - {item.organization}
                    </p>
                  </div>
                  <span className="admin-feedback-date">{formatDateLabel(item.submittedAt)}</span>
                </div>

                <div className="admin-feedback-item-meta">
                  <span className="admin-feedback-rating-pill">
                    <RatingStars rating={item.rating} />
                    <strong>{item.rating.toFixed(1)}</strong>
                  </span>
                  <span className="admin-feedback-participation">Participation {item.participationId.slice(0, 8)}</span>
                </div>

                <p className="admin-feedback-comment">{item.comment}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
