import { Download, RefreshCw, Search, Star } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { EmptyLoadingErrorState, FeedbackCard, IssueBadge, ReviewStatusTag } from '../components/feedback';
import { Badge, Button, Card, Input, Select } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { listFeedbackReview } from '../lib/feedback';
import { listParticipations } from '../lib/participations';
import type { FeedbackRecord } from '../types/feedback';
import type { ParticipationRecord } from '../types/participation';
import './AdminFeedbackPage.css';

type PeriodFilter = '30' | '90' | 'all';
type RatingFilter = 'all' | '1' | '2' | '3' | '4' | '5';
type FeedbackSentiment = 'positive' | 'neutral' | 'negative';

interface FeedbackViewModel {
  id: string;
  participationId: string;
  activityTitle: string;
  volunteerName: string;
  volunteerRole: string;
  avatarUrl: string | null;
  rating: number;
  comment: string;
  submittedAt: string | null;
  categoryLabel: string;
  sentiment: FeedbackSentiment;
  flaggedIssue: boolean;
  reviewStatus: string;
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

function formatRoleLabel(role: string | null | undefined): string {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase() : '';
  if (normalized === 'admin') {
    return 'Admin';
  }
  if (normalized === 'organizer') {
    return 'Organizer';
  }
  return 'Volunteer';
}

function toCategoryLabel(activityTitle: string) {
  const lower = activityTitle.toLowerCase();
  if (lower.includes('garden') || lower.includes('environment')) {
    return 'Community Garden';
  }
  if (lower.includes('youth') || lower.includes('mentor') || lower.includes('student')) {
    return 'Youth Mentorship';
  }
  if (lower.includes('outreach') || lower.includes('senior')) {
    return 'Senior Outreach';
  }
  return 'Community Program';
}

function toSentiment(rating: number): FeedbackSentiment {
  if (rating >= 4) {
    return 'positive';
  }
  if (rating <= 2) {
    return 'negative';
  }
  return 'neutral';
}

function toFlaggedIssue(rating: number, comment: string, explicitFlag?: boolean | null) {
  if (typeof explicitFlag === 'boolean') {
    return explicitFlag;
  }

  if (rating <= 2) {
    return true;
  }

  const text = comment.toLowerCase();
  return (
    text.includes('issue') ||
    text.includes('problem') ||
    text.includes('delay') ||
    text.includes('late') ||
    text.includes('error') ||
    text.includes('bottleneck')
  );
}

function buildFeedbackItems(feedbacks: FeedbackRecord[], participations: ParticipationRecord[]): FeedbackViewModel[] {
  const participationById = new Map(
    participations.map((participation) => [participation.participationId || participation.id, participation])
  );

  return feedbacks.map((feedback) => {
    const participation = participationById.get(feedback.participation_id);
    const rating = Number(feedback.rating || 0);
    const comment = feedback.comment?.trim() || 'No written feedback provided.';
    const activityTitle = participation?.activityName ?? `Participation ${feedback.participation_id.slice(0, 8)}`;

    return {
      id: feedback.id,
      participationId: feedback.participation_id,
      activityTitle,
      volunteerName: participation?.volunteer?.full_name?.trim() || 'Volunteer',
      volunteerRole: formatRoleLabel(participation?.volunteer?.role),
      avatarUrl: participation?.volunteer?.avatar_url ?? null,
      rating,
      comment,
      submittedAt: feedback.created_at ?? null,
      categoryLabel: toCategoryLabel(activityTitle),
      sentiment: toSentiment(rating),
      flaggedIssue: toFlaggedIssue(rating, comment, feedback.is_flagged),
      reviewStatus: String(feedback.review_status ?? 'pending'),
    };
  });
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="feedback-review-stars" aria-label={`Rating ${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => {
        const active = index < Math.round(rating);
        return <Star className={active ? 'feedback-review-star is-active' : 'feedback-review-star'} key={`${rating}-${index}`} />;
      })}
    </div>
  );
}

function buildExportCsv(items: FeedbackViewModel[]) {
  const header = ['activity', 'volunteer', 'role', 'rating', 'sentiment', 'flagged_issue', 'submitted_at', 'comment'];
  const rows = items.map((item) => [
    item.activityTitle,
    item.volunteerName,
    item.volunteerRole,
    String(item.rating),
    item.sentiment,
    String(item.flaggedIssue),
    item.submittedAt ?? '',
    item.comment.replace(/\r?\n/g, ' '),
  ]);

  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function withinPeriod(dateString: string | null, periodFilter: PeriodFilter) {
  if (periodFilter === 'all') {
    return true;
  }

  if (!dateString) {
    return false;
  }

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const now = Date.now();
  const days = periodFilter === '30' ? 30 : 90;
  return now - parsed.getTime() <= days * 24 * 60 * 60 * 1000;
}

export function AdminFeedbackPage() {
  const { session, profile } = useAuth();
  const role = typeof profile?.role === 'string' ? profile.role.trim().toLowerCase() : '';
  const isAdmin = role === 'admin';
  const isOrganizer = role === 'organizer';

  const [items, setItems] = useState<FeedbackViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);

  const loadFeedback = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const numericRating = ratingFilter === 'all' ? undefined : Number(ratingFilter);
      const [feedbacks, participations] = await Promise.all([
        listFeedbackReview({ accessToken: session.access_token, limit: 240, rating: numericRating }),
        listParticipations({ accessToken: session.access_token, limit: 500 }),
      ]);

      setItems(buildFeedbackItems(feedbacks, participations));
      setLastSync(new Date().toLocaleString());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load feedback.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [ratingFilter, session?.access_token]);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  const activityOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.activityTitle))).sort((left, right) => left.localeCompare(right)),
    [items]
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return items.filter((item) => {
      if (activityFilter !== 'all' && item.activityTitle !== activityFilter) {
        return false;
      }

      if (!withinPeriod(item.submittedAt, periodFilter)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return (
        item.activityTitle.toLowerCase().includes(normalizedSearch) ||
        item.volunteerName.toLowerCase().includes(normalizedSearch) ||
        item.comment.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [activityFilter, items, periodFilter, searchTerm]);

  const metrics = useMemo(() => {
    const total = filteredItems.length;
    const averageRating = total === 0 ? 0 : filteredItems.reduce((sum, item) => sum + item.rating, 0) / total;
    const positive = filteredItems.filter((item) => item.sentiment === 'positive').length;
    const neutral = filteredItems.filter((item) => item.sentiment === 'neutral').length;
    const negative = filteredItems.filter((item) => item.sentiment === 'negative').length;

    return {
      total,
      averageRating,
      positive,
      neutral,
      negative,
    };
  }, [filteredItems]);

  const selectedFeedback = useMemo(
    () => filteredItems.find((item) => item.id === selectedFeedbackId) ?? null,
    [filteredItems, selectedFeedbackId]
  );

  const handleExportCsv = () => {
    const csvContent = buildExportCsv(filteredItems);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'feedback-review-export.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const reviewBody = (
    <section className="feedback-review-page">
      <Card as="section" className="feedback-review-filter-shell">
        <div className="feedback-review-filter-row">
          <label className="feedback-review-search" htmlFor="feedback-review-search">
            <Search size={14} />
            <Input
              id="feedback-review-search"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search feedback records..."
              value={searchTerm}
            />
          </label>

          <Select onChange={(event) => setActivityFilter(event.target.value)} sizeMode="small" value={activityFilter}>
            <option value="all">All Activities</option>
            {activityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>

          <Select onChange={(event) => setRatingFilter(event.target.value as RatingFilter)} sizeMode="small" value={ratingFilter}>
            <option value="all">All Ratings</option>
            <option value="5">5 Stars</option>
            <option value="4">4 Stars</option>
            <option value="3">3 Stars</option>
            <option value="2">2 Stars</option>
            <option value="1">1 Star</option>
          </Select>

          <Select onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)} sizeMode="small" value={periodFilter}>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="all">All Time</option>
          </Select>

          <Button onClick={() => void loadFeedback()} type="button" variant="secondary">
            <RefreshCw size={14} />
            <span>Refresh</span>
          </Button>

          <Button disabled={filteredItems.length === 0} onClick={handleExportCsv} type="button">
            <Download size={14} />
            <span>Export CSV</span>
          </Button>
        </div>
      </Card>

      <div className="feedback-review-metrics">
        <Card as="article" className="feedback-review-metric-card">
          <p>Average Satisfaction</p>
          <strong>{metrics.averageRating.toFixed(1)}</strong>
          <RatingStars rating={metrics.averageRating} />
        </Card>

        <Card as="article" className="feedback-review-metric-card">
          <p>Total Submissions</p>
          <strong>{metrics.total}</strong>
          <small>Filtered feedback entries</small>
        </Card>

        <Card as="article" className="feedback-review-metric-card">
          <p>Sentiment Distribution</p>
          <div className="feedback-review-sentiment-bars">
            <div className="feedback-review-sentiment-row">
              <span>Positive</span>
              <strong>{metrics.positive}</strong>
            </div>
            <div className="feedback-review-sentiment-row">
              <span>Neutral</span>
              <strong>{metrics.neutral}</strong>
            </div>
            <div className="feedback-review-sentiment-row">
              <span>Negative</span>
              <strong>{metrics.negative}</strong>
            </div>
          </div>
        </Card>
      </div>

      <Card as="section" className="feedback-review-list-shell">
        {error && items.length > 0 && <p className="form-error">{error}</p>}
        {lastSync && <p className="muted feedback-review-sync">Last sync: {lastSync}</p>}

        {loading ? (
          <EmptyLoadingErrorState
            description="Pulling the latest volunteer feedback records and participation context."
            state="loading"
            title="Loading feedback"
          />
        ) : error && items.length === 0 ? (
          <EmptyLoadingErrorState
            action={
              <Button onClick={() => void loadFeedback()} type="button" variant="secondary">
                Retry
              </Button>
            }
            description={error}
            state="error"
            title="Unable to load feedback"
          />
        ) : filteredItems.length === 0 ? (
          <EmptyLoadingErrorState
            description="Try broadening the current filters or search term to review more feedback records."
            state="empty"
            title="No feedback records found"
          />
        ) : (
          <div className="feedback-review-list">
            {filteredItems.map((item) => (
              <article className="feedback-review-item" key={item.id}>
                <div className="feedback-review-item-head">
                  <div className="feedback-review-volunteer">
                    <span className="feedback-review-avatar">{item.volunteerName.charAt(0).toUpperCase()}</span>
                    <div>
                      <strong>{item.volunteerName}</strong>
                      <p>{item.activityTitle}</p>
                    </div>
                  </div>
                  <small>{formatDateLabel(item.submittedAt)}</small>
                </div>

                <div className="feedback-review-item-meta">
                  <Badge tone="info">{item.categoryLabel}</Badge>
                  <RatingStars rating={item.rating} />
                  {item.flaggedIssue && (
                    <Badge tone="danger">
                      <AlertTriangle size={12} />
                      <span>Needs Attention</span>
                    </Badge>
                  )}
                </div>

                <p className="feedback-review-comment">{item.comment}</p>

                <div className="feedback-review-item-actions">
                  <Badge tone={item.sentiment === 'positive' ? 'success' : item.sentiment === 'neutral' ? 'info' : 'danger'}>
                    {item.sentiment}
                  </Badge>
                  <Badge tone="info">{item.reviewStatus.replace('_', ' ')}</Badge>
              <FeedbackCard
                action={
                  <Button onClick={() => setSelectedFeedbackId(item.id)} type="button" variant="secondary">
                    View Detail
                  </Button>
                }
                activityLabel={item.activityTitle}
                avatarUrl={item.avatarUrl}
                className="feedback-review-card"
                date={formatDateLabel(item.submittedAt)}
                insight={item.flaggedIssue ? 'Automatically flagged from rating and comment keyword analysis.' : undefined}
                key={item.id}
                name={item.volunteerName}
                rating={item.rating}
                status={item.sentiment}
                tags={
                  <>
                    <Badge tone="info">{item.categoryLabel}</Badge>
                    {item.flaggedIssue ? <IssueBadge label="Needs Attention" state="warning" /> : null}
                  </>
                }
                text={item.comment}
              />
            ))}
          </div>
        )}
      </Card>

      {selectedFeedback && (
        <div className="feedback-review-modal-backdrop" role="presentation" onClick={() => setSelectedFeedbackId(null)}>
          <Card
            as="section"
            className="feedback-review-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="feedback-review-modal-head">
              <h3>Feedback Detail</h3>
              <Button onClick={() => setSelectedFeedbackId(null)} type="button" variant="secondary">
                Close
              </Button>
            </div>

            <div className="feedback-review-modal-grid">
              <div>
                <small>Volunteer</small>
                <p>{selectedFeedback.volunteerName}</p>
              </div>
              <div>
                <small>Role</small>
                <p>{selectedFeedback.volunteerRole}</p>
              </div>
              <div>
                <small>Activity</small>
                <p>{selectedFeedback.activityTitle}</p>
              </div>
              <div>
                <small>Submitted</small>
                <p>{formatDateLabel(selectedFeedback.submittedAt)}</p>
              </div>
            </div>

            <div className="feedback-review-modal-rating">
              <RatingStars rating={selectedFeedback.rating} />
              <strong>{selectedFeedback.rating.toFixed(1)} / 5.0</strong>
            </div>

            <p className="feedback-review-modal-comment">{selectedFeedback.comment}</p>

            <div className="feedback-review-modal-foot">
              <Badge tone="info">{selectedFeedback.categoryLabel}</Badge>
              <ReviewStatusTag status={selectedFeedback.sentiment} />
              {selectedFeedback.flaggedIssue && <IssueBadge label="Flagged from current data" state="warning" />}
            </div>
          </Card>
        </div>
      )}
    </section>
  );

  if (isOrganizer) {
    return (
      <OrganizerShell
        activeNav="reports"
        pageContext={<span className="feedback-review-context">Performance Insights</span>}
        pageSubtitle="Review volunteer feedback and activity ratings to optimize impact."
        pageTitle="Feedback Review"
        searchPlaceholder="Search feedback..."
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
      >
        {reviewBody}
      </OrganizerShell>
    );
  }

  return (
    <section className="admin-feedback-page">
      <p className="users-caption">{isAdmin ? 'Admin feedback oversight' : 'Feedback overview'}</p>
      <div className="users-page-head">
        <div>
          <h2>Feedback Review</h2>
          <p className="muted">Review volunteer feedback and activity ratings to optimize impact.</p>
        </div>
      </div>
      {reviewBody}
    </section>
  );
}
