import { ArrowRight, Info, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import {
  getCompletedActivitiesForUser,
  getFeedbackForUser,
  submitFeedbackForUser,
  type CompletedActivityOption,
  type FeedbackEntry,
} from '../lib/engagement';
import { VolunteerShell } from '../layouts/VolunteerShell';
import './FeedbackPage.css';

const categoryOptions = ['Organization', 'Activity Quality', 'Venue', 'Management', 'Staff Support'];

const ratingLabels: Record<number, string> = {
  1: 'Needs major improvement',
  2: 'Could be better',
  3: 'Good experience',
  4: 'Great experience',
  5: 'Excellent impact',
};

function formatDateLabel(value: string): string {
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

function buildPreview(details: string): string {
  const normalized = details.trim();
  if (normalized.length <= 110) {
    return normalized;
  }
  return `${normalized.slice(0, 107)}...`;
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="feedback-star-row" aria-label={`Rating ${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => {
        const isFilled = index < rating;
        return <Star className={isFilled ? 'feedback-star filled' : 'feedback-star'} key={`${rating}-${index}`} />;
      })}
    </div>
  );
}

export function FeedbackPage() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activities, setActivities] = useState<CompletedActivityOption[]>([]);
  const [historyItems, setHistoryItems] = useState<FeedbackEntry[]>([]);

  const [activityId, setActivityId] = useState('');
  const [rating, setRating] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const [completedActivities, feedbackHistory] = await Promise.all([
          getCompletedActivitiesForUser(userId),
          getFeedbackForUser(userId),
        ]);

        if (cancelled) {
          return;
        }

        setActivities(completedActivities);
        setHistoryItems(feedbackHistory);
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Failed to load feedback data.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const selectedActivity = useMemo(
    () => activities.find((item) => item.id === activityId) ?? null,
    [activities, activityId]
  );

  const ratingHint = rating === 0 ? 'Select your experience rating.' : ratingLabels[rating] ?? 'Thanks for rating.';

  const canSubmit = Boolean(selectedActivity && rating > 0 && details.trim().length >= 10 && !submitting);

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category]
    );
  };

  const handleSubmit = async () => {
    if (!userId || !selectedActivity || rating <= 0 || details.trim().length < 10) {
      setError('Please choose an activity, rating, and at least 10 characters of detailed feedback.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const entry = await submitFeedbackForUser(userId, {
        activityId: selectedActivity.id,
        activityTitle: selectedActivity.title,
        rating,
        categories: selectedCategories,
        details: details.trim(),
      });

      setHistoryItems((current) => [entry, ...current]);
      setRating(0);
      setSelectedCategories([]);
      setDetails('');
      setSuccess('Feedback submitted successfully. Thank you for helping us improve.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <VolunteerShell
      activeNav="feedback"
      pageSubtitle="Help us improve the volunteer experience by sharing your thoughts."
      pageTitle="Submit Feedback"
    >
      <div className="feedback-grid">
        <section className="feedback-card feedback-form-card">
          <div className="feedback-form-fields">
            <label className="feedback-label" htmlFor="feedback-activity-select">
              Select Recently Completed Activity
            </label>
            <select
              className="feedback-select"
              id="feedback-activity-select"
              onChange={(event) => setActivityId(event.target.value)}
              value={activityId}
            >
              <option value="">Choose a completed activity</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.title} • {formatDateLabel(activity.completedAt)}
                </option>
              ))}
            </select>

            <div>
              <p className="feedback-label">Overall Experience Rating</p>
              <div className="feedback-rating-picker" role="radiogroup" aria-label="Overall experience rating">
                {Array.from({ length: 5 }, (_, index) => {
                  const value = index + 1;
                  const active = value <= rating;
                  return (
                    <button
                      aria-label={`Rate ${value} star${value > 1 ? 's' : ''}`}
                      className={active ? 'feedback-rate-btn is-active' : 'feedback-rate-btn'}
                      key={value}
                      onClick={() => setRating(value)}
                      type="button"
                    >
                      <Star />
                    </button>
                  );
                })}
              </div>
              <p className="feedback-rating-hint">{ratingHint}</p>
            </div>

            <div>
              <p className="feedback-label">Highlight Categories</p>
              <div className="feedback-category-wrap">
                {categoryOptions.map((category) => {
                  const isSelected = selectedCategories.includes(category);
                  return (
                    <button
                      className={isSelected ? 'feedback-category-pill is-selected' : 'feedback-category-pill'}
                      key={category}
                      onClick={() => toggleCategory(category)}
                      type="button"
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="feedback-label" htmlFor="feedback-details">
              Detailed Feedback
            </label>
            <textarea
              className="feedback-textarea"
              id="feedback-details"
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Tell us more about your experience, what went well, and what could be improved."
              rows={6}
              value={details}
            />
          </div>

          {error && <p className="form-error">{error}</p>}
          {success && <p className="form-success">{success}</p>}

          <button className="feedback-submit-btn" disabled={!canSubmit} onClick={() => void handleSubmit()} type="button">
            {submitting ? 'Submitting...' : 'Submit Feedback'}
            <ArrowRight className="feedback-btn-icon" />
          </button>

          {loading && <p className="feedback-inline-note">Loading feedback data...</p>}
        </section>

        <aside className="feedback-side-column">
          <section className="feedback-card feedback-history-card">
            <div className="feedback-history-head">
              <h2>Previous Feedback</h2>
            </div>

            <div className="feedback-history-list">
              {!loading && historyItems.length === 0 && <p className="muted">No feedback submitted yet.</p>}
              {historyItems.map((item) => (
                <article className="feedback-history-item" key={item.id}>
                  <div className="feedback-history-top">
                    <h3>{item.activityTitle}</h3>
                    <span>{formatDateLabel(item.submittedAt)}</span>
                  </div>
                  <StarRow rating={item.rating} />
                  <p>{buildPreview(item.details)}</p>
                  <button className="feedback-inline-link" type="button">
                    View Full Details
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="feedback-card feedback-impact-card">
            <div className="feedback-impact-icon">
              <Info size={16} />
            </div>
            <h2>Impact Tracker</h2>
            <p>
              Your feedback helps us allocate resources and improve the safety standards for all student volunteers.
            </p>
          </section>
        </aside>
      </div>
    </VolunteerShell>
  );
}
