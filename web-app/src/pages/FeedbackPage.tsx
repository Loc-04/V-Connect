import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { createFeedback, listFeedbacks } from '../lib/feedback';
import type { FeedbackRecord } from '../types/feedback';
import './FeedbackPage.css';

const categoryOptions = ['general', 'bug', 'feature', 'ui', 'other'];
const ratingOptions = [5, 4, 3, 2, 1];

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return date.toLocaleString();
}

export function FeedbackPage() {
  const navigate = useNavigate();
  const { profile, session, signOut } = useAuth();
  const role = String(profile?.role ?? '');
  const isAdmin = role === 'admin';

  const [feedbacks, setFeedbacks] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [rating, setRating] = useState<number>(5);
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');

  const [showMineOnly, setShowMineOnly] = useState(true);
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    if (isAdmin) {
      setShowMineOnly(false);
    }
  }, [isAdmin]);

  const loadFeedbacks = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rows = await listFeedbacks({
        accessToken: session.access_token,
        mine: isAdmin ? showMineOnly : true,
        limit: 100,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        rating: ratingFilter !== 'all' ? ratingFilter : undefined,
      });
      setFeedbacks(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load feedback.');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, isAdmin, ratingFilter, session?.access_token, showMineOnly]);

  useEffect(() => {
    void loadFeedbacks();
  }, [loadFeedbacks]);

  const averageRating = useMemo(() => {
    if (feedbacks.length === 0) {
      return '0.0';
    }

    const total = feedbacks.reduce((sum, row) => sum + Number(row.rating || 0), 0);
    return (total / feedbacks.length).toFixed(1);
  }, [feedbacks]);

  const highRatingCount = useMemo(
    () => feedbacks.filter((row) => Number(row.rating || 0) >= 4).length,
    [feedbacks]
  );

  const categoryBreakdown = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const row of feedbacks) {
      const key = String(row.category ?? 'general').toLowerCase();
      acc[key] = (acc[key] ?? 0) + 1;
    }
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [feedbacks]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.access_token) {
      setError('No active session token.');
      return;
    }

    const normalizedMessage = message.trim();
    if (!normalizedMessage) {
      setError('Message is required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await createFeedback(
        {
          rating,
          category,
          message: normalizedMessage,
        },
        session.access_token
      );

      setMessage('');
      setNotice('Feedback submitted.');
      await loadFeedbacks();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <main className="app-shell feedback-page">
      <section className="card feedback-hero">
        <div className="section-head">
          <div>
            <p className="badge">V-Connect Insight Hub</p>
            <h2>Feedback Center</h2>
            <p className="muted">
              Share product feedback and review signals from {isAdmin && !showMineOnly ? 'all users' : 'your account'}.
            </p>
          </div>
          <div className="header-actions">
            <button className="secondary-btn" onClick={() => navigate('/')} type="button">
              Home
            </button>
            <button className="secondary-btn" onClick={() => navigate('/browse')} type="button">
              Browse
            </button>
            <button className="secondary-btn" onClick={() => void loadFeedbacks()} type="button">
              Refresh
            </button>
            <button className="danger-btn" onClick={handleSignOut} type="button">
              Logout
            </button>
          </div>
        </div>

        <div className="feedback-metric-grid">
          <article className="feedback-metric-card">
            <p>Total Feedback</p>
            <strong>{feedbacks.length}</strong>
          </article>
          <article className="feedback-metric-card">
            <p>Average Rating</p>
            <strong>{averageRating}</strong>
          </article>
          <article className="feedback-metric-card">
            <p>Positive (4-5)</p>
            <strong>{highRatingCount}</strong>
          </article>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-success">{notice}</p>}

      <section className="feedback-content-grid">
        <article className="card feedback-compose-card">
          <h3>Submit Feedback</h3>
          <p className="muted">Use clear, specific notes so organizers and admins can act quickly.</p>

          <form className="feedback-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="field-label">Rating</label>
            <div className="feedback-rating-row" role="radiogroup" aria-label="Feedback rating">
              {ratingOptions.map((option) => (
                <button
                  aria-checked={rating === option}
                  className={rating === option ? 'feedback-rating-btn active' : 'feedback-rating-btn'}
                  key={option}
                  onClick={() => setRating(option)}
                  role="radio"
                  type="button"
                >
                  {option} / 5
                </button>
              ))}
            </div>

            <label className="field-label" htmlFor="feedback-category">
              Category
            </label>
            <select
              className="text-input"
              id="feedback-category"
              onChange={(event) => setCategory(event.target.value)}
              value={category}
            >
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label className="field-label" htmlFor="feedback-message">
              Message
            </label>
            <textarea
              className="text-input feedback-textarea"
              id="feedback-message"
              maxLength={2000}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us what works well and what should improve."
              value={message}
            />
            <p className="muted feedback-char-count">{message.trim().length}/2000</p>

            <button className="primary-btn" disabled={submitting} type="submit">
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        </article>

        <article className="card feedback-feed-card">
          <div className="feedback-feed-head">
            <h3>Feedback Stream</h3>
            <button className="secondary-btn" onClick={() => void loadFeedbacks()} type="button">
              Refresh
            </button>
          </div>

          {isAdmin && (
            <label className="feedback-toggle">
              <input
                checked={showMineOnly}
                onChange={(event) => setShowMineOnly(event.target.checked)}
                type="checkbox"
              />
              Show only my feedback
            </label>
          )}

          <div className="feedback-filter-row">
            <select
              className="text-input"
              onChange={(event) => setCategoryFilter(event.target.value)}
              value={categoryFilter}
            >
              <option value="all">All categories</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              className="text-input"
              onChange={(event) =>
                setRatingFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
              }
              value={ratingFilter}
            >
              <option value="all">All ratings</option>
              {ratingOptions.map((option) => (
                <option key={option} value={option}>
                  {option} / 5
                </option>
              ))}
            </select>
            <p className="muted feedback-user-tag">{profile?.full_name ?? profile?.id ?? 'User'}</p>
          </div>

          {categoryBreakdown.length > 0 && (
            <div className="feedback-breakdown-row">
              {categoryBreakdown.map(([name, count]) => (
                <span className="feedback-breakdown-chip" key={name}>
                  {name}: {count}
                </span>
              ))}
            </div>
          )}

          {loading ? (
            <p className="muted">Loading feedback...</p>
          ) : (
            <div className="feedback-list">
              {feedbacks.map((feedback) => (
                <article className="feedback-item" key={feedback.id}>
                  <div className="feedback-item-top">
                    <p className="feedback-item-user mono">{feedback.user_id}</p>
                    <span className="feedback-item-rating">{feedback.rating} / 5</span>
                  </div>
                  <p className="feedback-item-message">{feedback.message}</p>
                  <div className="feedback-item-bottom">
                    <span className="feedback-item-category">{feedback.category}</span>
                    <span className="muted">{formatTimestamp(feedback.created_at)}</span>
                  </div>
                </article>
              ))}
              {feedbacks.length === 0 && <p className="muted">No feedback found.</p>}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}

