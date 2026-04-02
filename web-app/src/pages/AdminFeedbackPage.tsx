import { AlertTriangle, Download, MessageSquare, RefreshCw, Search, Star } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { Badge, Button, Card, Input, Select } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { listFeedbackReview, updateFeedbackAiLabel } from '../lib/feedback';
import { listParticipations } from '../lib/participations';
import type { FeedbackRecord } from '../types/feedback';
import type { ParticipationRecord } from '../types/participation';
import './AdminFeedbackPage.css';

type PeriodFilter = '30' | '90' | 'all';
type RatingFilter = 'all' | '1' | '2' | '3' | '4' | '5';
type FeedbackSentiment = 'positive' | 'neutral' | 'negative';
type SpamLabel = 'spam' | 'not_spam';
type ManualSpamLabel = 'spam' | 'not_spam' | 'auto';

interface FeedbackViewModel {
  id: string;
  participationId: string;
  activityTitle: string;
  volunteerName: string;
  volunteerRole: string;
  rating: number;
  comment: string;
  submittedAt: string | null;
  categoryLabel: string;
  sentiment: FeedbackSentiment;
  flaggedIssue: boolean;
  aiLabel: SpamLabel;
  aiSpamReasons: string[];
  isSpam: boolean;
  reviewStatus: string;
}

interface FeedbackPaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
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

function normalizeAiLabel(rawValue: string | null | undefined): SpamLabel {
  const normalized = typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : '';
  if (normalized === 'not_spam' || normalized === 'not spam' || normalized === 'ham') {
    return 'not_spam';
  }
  if (normalized === 'spam' || normalized.startsWith('spam') || normalized === 'is_spam') {
    return 'spam';
  }
  return 'not_spam';
}

function normalizeAiReasons(rawValue: string[] | null | undefined) {
  if (!Array.isArray(rawValue)) {
    return [];
  }
  return rawValue.filter((value) => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim());
}

function toAiBadgeTone(label: SpamLabel): 'danger' | 'success' {
  return label === 'spam' ? 'danger' : 'success';
}

function toAiBadgeLabel(label: SpamLabel): string {
  return label === 'spam' ? 'AI: Spam' : 'AI: Not Spam';
}

function toManualLabelValue(rawValue: string): ManualSpamLabel {
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === 'spam') {
    return 'spam';
  }
  if (normalized === 'not_spam') {
    return 'not_spam';
  }
  return 'auto';
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
    const aiLabel = normalizeAiLabel(feedback.ai_label);
    const aiSpamReasons = normalizeAiReasons(feedback.ai_spam_reasons);

    return {
      id: feedback.id,
      participationId: feedback.participation_id,
      activityTitle,
      volunteerName: participation?.volunteer?.full_name?.trim() || 'Volunteer',
      volunteerRole: formatRoleLabel(participation?.volunteer?.role),
      rating,
      comment,
      submittedAt: feedback.created_at ?? null,
      categoryLabel: toCategoryLabel(activityTitle),
      sentiment: toSentiment(rating),
      flaggedIssue: toFlaggedIssue(rating, comment, feedback.is_flagged),
      aiLabel,
      aiSpamReasons,
      isSpam: typeof feedback.is_spam === 'boolean' ? feedback.is_spam : aiLabel === 'spam',
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

function formatExcelDate(value: string | null): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString();
}

function createFeedbackExportWorkbook(
  xlsx: typeof import('xlsx'),
  items: FeedbackViewModel[],
  filters: { ratingFilter: RatingFilter; periodFilter: PeriodFilter }
) {
  const generatedAt = new Date();
  const rows = items.map((item) => ({
    Activity: item.activityTitle,
    Volunteer: item.volunteerName,
    Role: item.volunteerRole,
    Rating: item.rating,
    Sentiment: item.sentiment,
    'AI Label': item.aiLabel,
    'Is Spam': item.isSpam ? 'Yes' : 'No',
    'Spam Signals': item.aiSpamReasons.join(', '),
    'Needs Attention': item.flaggedIssue ? 'Yes' : 'No',
    'Review Status': item.reviewStatus,
    'Submitted At': formatExcelDate(item.submittedAt),
    Comment: item.comment,
  }));

  const summaryRows = [
    { Field: 'Generated At', Value: generatedAt.toLocaleString() },
    { Field: 'Total Rows', Value: String(items.length) },
    { Field: 'Rating Filter', Value: filters.ratingFilter },
    { Field: 'Period Filter', Value: filters.periodFilter },
  ];

  const detailsSheet = xlsx.utils.json_to_sheet(rows);
  detailsSheet['!cols'] = [
    { wch: 30 },
    { wch: 24 },
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 28 },
    { wch: 16 },
    { wch: 14 },
    { wch: 22 },
    { wch: 65 },
  ];
  detailsSheet['!autofilter'] = { ref: 'A1:L1' };
  detailsSheet['!freeze'] = { xSplit: 0, ySplit: 1 };

  const summarySheet = xlsx.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 22 }, { wch: 42 }];

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  xlsx.utils.book_append_sheet(workbook, detailsSheet, 'Feedback Review');
  return workbook;
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
  const reviewPageSize = 20;

  const [items, setItems] = useState<FeedbackViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [manualLabel, setManualLabel] = useState<ManualSpamLabel>('auto');
  const [updatingLabel, setUpdatingLabel] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<FeedbackPaginationState>({
    page: 1,
    limit: reviewPageSize,
    total: 0,
    totalPages: 1,
    hasPrev: false,
    hasNext: false,
  });

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
      const [{ feedbacks, pagination: paginationMeta }, participations] = await Promise.all([
        listFeedbackReview({
          accessToken: session.access_token,
          limit: reviewPageSize,
          page: currentPage,
          rating: numericRating,
        }),
        listParticipations({
          accessToken: session.access_token,
          limit: 500,
          mine: role === 'admin' ? undefined : true,
        }),
      ]);

      setItems(buildFeedbackItems(feedbacks, participations));
      setPagination({
        page: paginationMeta.page,
        limit: paginationMeta.limit,
        total: paginationMeta.total,
        totalPages: paginationMeta.totalPages,
        hasPrev: paginationMeta.hasPrev,
        hasNext: paginationMeta.hasNext,
      });
      setLastSync(new Date().toLocaleString());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load feedback.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [currentPage, ratingFilter, reviewPageSize, role, session?.access_token]);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  useEffect(() => {
    setCurrentPage(1);
  }, [ratingFilter]);

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

  useEffect(() => {
    if (!selectedFeedback) {
      setManualLabel('auto');
      setLabelError(null);
      return;
    }
    setManualLabel(selectedFeedback.aiLabel === 'spam' ? 'spam' : 'not_spam');
    setLabelError(null);
  }, [selectedFeedback]);

  const handleExportExcel = useCallback(async () => {
    try {
      setExporting(true);
      const xlsx = await import('xlsx');
      const workbook = createFeedbackExportWorkbook(xlsx, filteredItems, { ratingFilter, periodFilter });
      const stamp = new Date().toISOString().slice(0, 10);
      xlsx.writeFile(workbook, `feedback-review-${stamp}.xlsx`, { compression: true });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to export Excel file.');
    } finally {
      setExporting(false);
    }
  }, [filteredItems, periodFilter, ratingFilter]);

  const handleApplyManualLabel = useCallback(async () => {
    if (!isAdmin) {
      return;
    }
    if (!session?.access_token || !selectedFeedback) {
      setLabelError('No active session token.');
      return;
    }

    setUpdatingLabel(true);
    setLabelError(null);

    try {
      const updated = await updateFeedbackAiLabel(selectedFeedback.id, manualLabel, session.access_token);
      const nextLabel = normalizeAiLabel(updated.ai_label);
      const nextReasons = normalizeAiReasons(updated.ai_spam_reasons);
      const nextIsSpam = typeof updated.is_spam === 'boolean' ? updated.is_spam : nextLabel === 'spam';

      setItems((previous) =>
        previous.map((item) =>
          item.id === selectedFeedback.id
            ? {
                ...item,
                aiLabel: nextLabel,
                aiSpamReasons: nextReasons,
                isSpam: nextIsSpam,
              }
            : item
        )
      );
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'Failed to update AI label.';
      setLabelError(message);
    } finally {
      setUpdatingLabel(false);
    }
  }, [isAdmin, manualLabel, selectedFeedback, session?.access_token]);

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

          <Button disabled={filteredItems.length === 0 || exporting} onClick={() => void handleExportExcel()} type="button">
            <Download size={14} />
            <span>{exporting ? 'Exporting...' : 'Export Excel'}</span>
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
        {error && <p className="form-error">{error}</p>}
        {lastSync && <p className="muted feedback-review-sync">Last sync: {lastSync}</p>}

        {loading ? (
          <p className="muted">Loading feedback...</p>
        ) : filteredItems.length === 0 ? (
          <div className="feedback-review-empty">
            <MessageSquare size={18} />
            <p>No feedback records match the current filters.</p>
          </div>
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
                  <Badge tone={toAiBadgeTone(item.aiLabel)}>{toAiBadgeLabel(item.aiLabel)}</Badge>
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
                  <Button onClick={() => setSelectedFeedbackId(item.id)} type="button" variant="secondary">
                    View Detail
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && pagination.total > 0 && (
          <div className="feedback-review-pagination">
            <p className="muted">
              Page {pagination.page} / {pagination.totalPages} · {pagination.total} total feedbacks
            </p>
            <div className="feedback-review-pagination-actions">
              <Button
                disabled={!pagination.hasPrev}
                onClick={() => setCurrentPage((previous) => Math.max(1, previous - 1))}
                type="button"
                variant="secondary"
              >
                Previous
              </Button>
              <Button
                disabled={!pagination.hasNext}
                onClick={() => setCurrentPage((previous) => previous + 1)}
                type="button"
                variant="secondary"
              >
                Next
              </Button>
            </div>
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

            <section className="feedback-review-ai-panel">
              <div className="feedback-review-ai-head">
                <small>AI Moderation Label</small>
                <Badge tone={toAiBadgeTone(selectedFeedback.aiLabel)}>{toAiBadgeLabel(selectedFeedback.aiLabel)}</Badge>
              </div>
              {selectedFeedback.aiSpamReasons.length > 0 ? (
                <p className="feedback-review-ai-reasons">
                  Signals: {selectedFeedback.aiSpamReasons.join(', ')}
                </p>
              ) : (
                <p className="feedback-review-ai-reasons">No spam signals detected by backend classifier.</p>
              )}

              {isAdmin && (
                <div className="feedback-review-ai-actions">
                  <Select
                    sizeMode="small"
                    value={manualLabel}
                    onChange={(event) => setManualLabel(toManualLabelValue(event.target.value))}
                  >
                    <option value="spam">Mark as Spam</option>
                    <option value="not_spam">Mark as Not Spam</option>
                    <option value="auto">Use Auto Detection</option>
                  </Select>
                  <Button disabled={updatingLabel} onClick={() => void handleApplyManualLabel()} type="button">
                    {updatingLabel ? 'Applying...' : 'Apply Label'}
                  </Button>
                </div>
              )}
              {labelError && <p className="form-error">{labelError}</p>}
            </section>

            <div className="feedback-review-modal-foot">
              <Badge tone="info">{selectedFeedback.categoryLabel}</Badge>
              <Badge
                tone={
                  selectedFeedback.sentiment === 'positive'
                    ? 'success'
                    : selectedFeedback.sentiment === 'neutral'
                      ? 'info'
                      : 'danger'
                }
              >
                {selectedFeedback.sentiment}
              </Badge>
              {selectedFeedback.flaggedIssue && <Badge tone="danger">Flagged from current data</Badge>}
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
