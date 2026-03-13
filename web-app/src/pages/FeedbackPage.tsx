import { ArrowRight, Info, Star } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { Button, Card, Select } from '../components/ui';
import { createFeedback, listFeedbacks } from '../lib/feedback';
import { listParticipations } from '../lib/participations';
import { VolunteerShell } from '../layouts/VolunteerShell';
import type { FeedbackRecord } from '../types/feedback';
import type { ParticipationRecord } from '../types/participation';
import './FeedbackPage.css';

const categoryOptions = ['Organization', 'Activity Quality', 'Venue', 'Management', 'Staff Support'];

const ratingLabels: Record<number, string> = {
  1: 'Needs major improvement',
  2: 'Could be better',
  3: 'Good experience',
  4: 'Great experience',
  5: 'Excellent impact',
};

interface CompletedActivityOption {
  id: string;
  title: string;
  completedAt: string;
  activityId: string | null;
  organization: string;
}

interface FeedbackHistoryItem {
  id: string;
  participationId: string;
  activityId: string | null;
  activityTitle: string;
  submittedAt: string;
  rating: number;
  details: string;
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) {
    return '--';
  }

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

function buildCompletedActivities(records: ParticipationRecord[]): CompletedActivityOption[] {
  return records
    .filter((record) => String(record.status).toLowerCase() === 'completed')
    .map((record) => ({
      id: record.participationId,
      title: record.activityName,
      completedAt: record.date ?? record.created_at ?? new Date().toISOString(),
      activityId: record.activityId ?? null,
      organization: record.organization,
    }));
}

function buildFeedbackHistory(
  feedbacks: FeedbackRecord[],
  participations: ParticipationRecord[]
): FeedbackHistoryItem[] {
  const participationsById = new Map(participations.map((record) => [record.participationId, record]));

  return feedbacks.map((feedback) => {
    const participation = participationsById.get(feedback.participation_id);

    return {
      id: feedback.id,
      participationId: feedback.participation_id,
      activityId: participation?.activityId ?? null,
      activityTitle: participation?.activityName ?? `Participation ${feedback.participation_id.slice(0, 8)}`,
      submittedAt: feedback.created_at ?? new Date().toISOString(),
      rating: Number(feedback.rating || 0),
      details: feedback.comment?.trim() || 'No detailed feedback provided.',
    };
  });
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
  const navigate = useNavigate();
  const { session } = useAuth();
  const accessToken = session?.access_token ?? '';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activities, setActivities] = useState<CompletedActivityOption[]>([]);
  const [historyItems, setHistoryItems] = useState<FeedbackHistoryItem[]>([]);

  const [activityId, setActivityId] = useState('');
  const [rating, setRating] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [details, setDetails] = useState('');

  const loadData = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [participations, feedbacks] = await Promise.all([
        listParticipations(accessToken, 100),
        listFeedbacks({ accessToken, mine: true, limit: 50 }),
      ]);

      setActivities(buildCompletedActivities(participations));
      setHistoryItems(buildFeedbackHistory(feedbacks, participations));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load feedback data.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
    if (!accessToken || !selectedActivity || rating <= 0 || details.trim().length < 10) {
      setError('Please choose an activity, rating, and at least 10 characters of detailed feedback.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await createFeedback(
        {
          participationId: selectedActivity.id,
          rating,
          comment: details.trim(),
        },
        accessToken
      );

      setRating(0);
      setSelectedCategories([]);
      setDetails('');
      setSuccess('Feedback submitted successfully. Thank you for helping us improve.');
      await loadData();
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
        <Card as="section" className="feedback-card feedback-form-card">
          <div className="feedback-form-fields">
            <label className="feedback-label" htmlFor="feedback-activity-select">
              Select Recently Completed Activity
            </label>
            <Select
              className="feedback-select"
              disabled={loading || activities.length === 0}
              id="feedback-activity-select"
              onChange={(event) => setActivityId(event.target.value)}
              value={activityId}
            >
              <option value="">
                {activities.length === 0 ? 'No completed activities available' : 'Choose a completed activity'}
              </option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {`${activity.title} - ${formatDateLabel(activity.completedAt)}`}
                </option>
              ))}
            </Select>

            <div>
              <p className="feedback-label">Overall Experience Rating</p>
              <div className="feedback-rating-picker" role="radiogroup" aria-label="Overall experience rating">
                {Array.from({ length: 5 }, (_, index) => {
                  const value = index + 1;
                  const active = value <= rating;
                  return (
                    <Button
                      aria-label={`Rate ${value} star${value > 1 ? 's' : ''}`}
                      className={active ? 'feedback-rate-btn is-active' : 'feedback-rate-btn'}
                      key={value}
                      onClick={() => setRating(value)}
                      type="button"
                      variant="secondary"
                    >
                      <Star />
                    </Button>
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
                    <Button
                      className={isSelected ? 'feedback-category-pill is-selected' : 'feedback-category-pill'}
                      key={category}
                      onClick={() => toggleCategory(category)}
                      type="button"
                      variant="secondary"
                    >
                      {category}
                    </Button>
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

          <Button className="feedback-submit-btn" disabled={!canSubmit} onClick={() => void handleSubmit()} type="button">
            {submitting ? 'Submitting...' : 'Submit Feedback'}
            <ArrowRight className="feedback-btn-icon" />
          </Button>

          {loading && <p className="feedback-inline-note">Loading feedback data...</p>}
        </Card>

        <aside className="feedback-side-column">
          <Card as="section" className="feedback-card feedback-history-card">
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
                  <Button
                    className="feedback-inline-link"
                    onClick={() =>
                      navigate(item.activityId ? `/volunteer/activity/${item.activityId}` : '/volunteer/participation-history')
                    }
                    type="button"
                    variant="secondary"
                  >
                    View Full Details
                  </Button>
                </article>
              ))}
            </div>
          </Card>

          <Card as="section" className="feedback-card feedback-impact-card">
            <div className="feedback-impact-icon">
              <Info size={16} />
            </div>
            <h2>Impact Tracker</h2>
            <p>
              Your feedback helps us allocate resources and improve the safety standards for all student volunteers.
            </p>
          </Card>
        </aside>
      </div>
    </VolunteerShell>
  );
}
