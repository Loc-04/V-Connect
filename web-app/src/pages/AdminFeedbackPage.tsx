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
  organizerName: string;
  volunteerName: string;
  volunteerEmail: string | null;
  volunteerRole: string;
  rating: number;
  comment: string;
  submittedAt: string | null;
  categoryLabel: string;
  sentiment: FeedbackSentiment;
  flaggedIssue: boolean;
  reviewStatus: string;
  aiLabel: SpamLabel;
  aiSpamReasons: string[];
  isSpam: boolean;
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

interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

function normalizeReviewStatus(value: string | null | undefined): string {
  return String(value ?? 'pending')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function formatReviewStatusLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatRatingFilterLabel(value: RatingFilter) {
  if (value === 'all') {
    return 'All Ratings';
  }
  return `${value} Stars`;
}

function formatPeriodFilterLabel(value: PeriodFilter) {
  if (value === '30') {
    return 'Last 30 Days';
  }
  if (value === '90') {
    return 'Last 90 Days';
  }
  return 'All Time';
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
      organizerName: participation?.organization?.trim() || 'Unknown Organizer',
      volunteerName: participation?.volunteer?.full_name?.trim() || 'Volunteer',
      volunteerEmail: participation?.volunteer?.email?.trim() || null,
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
      reviewStatus: normalizeReviewStatus(feedback.review_status),
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
  exceljs: typeof import('exceljs'),
  items: FeedbackViewModel[],
  filters: { ratingFilter: RatingFilter; periodFilter: PeriodFilter }
) {
  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
  };
  const spamBrown = 'FF5C3A21';

  const workbook = new exceljs.Workbook();
  workbook.creator = 'V-Connect';
  workbook.created = new Date();

  const generatedAt = new Date();
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Field', key: 'field', width: 24 },
    { header: 'Value', key: 'value', width: 46 },
  ];
  summarySheet.mergeCells('A1:B1');
  summarySheet.getCell('A1').value = 'Feedback Review Export Summary';
  summarySheet.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  summarySheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  summarySheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };
  summarySheet.getCell('A1').border = thinBorder;
  summarySheet.getRow(1).height = 24;

  const summaryRows = [
    { field: 'Generated At', value: generatedAt.toLocaleString() },
    { field: 'Total Rows', value: String(items.length) },
    { field: 'Rating Filter', value: filters.ratingFilter },
    { field: 'Period Filter', value: filters.periodFilter },
  ];
  summaryRows.forEach((row) => summarySheet.addRow(row));
  for (let rowIndex = 2; rowIndex <= summarySheet.rowCount; rowIndex += 1) {
    const labelCell = summarySheet.getCell(`A${rowIndex}`);
    const valueCell = summarySheet.getCell(`B${rowIndex}`);
    labelCell.font = { bold: true, color: { argb: 'FF0F172A' } };
    labelCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
    labelCell.border = thinBorder;
    valueCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' },
    };
    valueCell.alignment = { vertical: 'middle', wrapText: true };
    valueCell.border = thinBorder;
  }

  const detailsSheet = workbook.addWorksheet('Feedback Review', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  detailsSheet.columns = [
    { header: 'Activity', key: 'activity', width: 34 },
    { header: 'Volunteer', key: 'volunteer', width: 26 },
    { header: 'Role', key: 'role', width: 14 },
    { header: 'Rating', key: 'rating', width: 10 },
    { header: 'Sentiment', key: 'sentiment', width: 14 },
    { header: 'AI Label', key: 'aiLabel', width: 14 },
    { header: 'Is Spam', key: 'isSpam', width: 11 },
    { header: 'Spam Signals', key: 'spamSignals', width: 32 },
    { header: 'Needs Attention', key: 'needsAttention', width: 18 },
    { header: 'Submitted At', key: 'submittedAt', width: 24 },
    { header: 'Comment', key: 'comment', width: 72 },
  ];
  detailsSheet.autoFilter = 'A1:K1';

  const headerColor = 'FF1E3A5F';
  detailsSheet.getRow(1).eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: headerColor },
    };
    cell.border = thinBorder;
  });

  items.forEach((item) => {
    const row = detailsSheet.addRow({
      activity: item.activityTitle,
      volunteer: item.volunteerName,
      role: item.volunteerRole,
      rating: item.rating,
      sentiment: item.sentiment,
      aiLabel: item.aiLabel,
      isSpam: item.isSpam ? 'Yes' : 'No',
      spamSignals: item.aiSpamReasons.join(', '),
      needsAttention: item.flaggedIssue ? 'Yes' : 'No',
      submittedAt: formatExcelDate(item.submittedAt),
      comment: item.comment,
    });
    row.height = 22;
    row.alignment = { vertical: 'middle' };

    row.eachCell((cell: any) => {
      cell.border = thinBorder;
    });

    row.getCell('D').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF7E6' },
    };
    row.getCell('F').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: item.aiLabel === 'spam' ? 'FFFFE4E6' : 'FFECFDF5' },
    };
    row.getCell('G').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: item.isSpam ? 'FFFFE4E6' : 'FFECFDF5' },
    };
    row.getCell('I').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: item.flaggedIssue ? 'FFFFF1F2' : 'FFF8FAFC' },
    };
    row.getCell('H').alignment = { vertical: 'top', wrapText: true };
    row.getCell('K').alignment = { vertical: 'top', wrapText: true };

    if (item.isSpam) {
      row.getCell('F').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: spamBrown },
      };
      row.getCell('G').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: spamBrown },
      };
      row.getCell('F').font = { color: { argb: 'FFFFFFFF' }, bold: true };
      row.getCell('G').font = { color: { argb: 'FFFFFFFF' }, bold: true };
      row.getCell('H').font = { color: { argb: spamBrown }, bold: true };
    }
    if (item.flaggedIssue) {
      row.getCell('I').font = { color: { argb: 'FFB45309' }, bold: true };
    }
  });

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
  const [reviewStatusFilter, setReviewStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [volunteerFilterQuery, setVolunteerFilterQuery] = useState('');
  const [organizerFilterQuery, setOrganizerFilterQuery] = useState('');
  const [activityFilterQuery, setActivityFilterQuery] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<'all' | FeedbackSentiment>('all');
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [manualLabel, setManualLabel] = useState<ManualSpamLabel>('auto');
  const [updatingLabel, setUpdatingLabel] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [labelWritable, setLabelWritable] = useState(true);
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
      const [{ feedbacks, pagination: paginationMeta, moderation }, participations] = await Promise.all([
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
      setLabelWritable(Boolean(moderation.labelWritable));
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

  const organizerOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.organizerName))).sort((left, right) => left.localeCompare(right)),
    [items]
  );

  const volunteerOptions = useMemo(
    () =>
      Array.from(
        new Set(
          items.flatMap((item) => {
            const options = [item.volunteerName];
            if (item.volunteerEmail) {
              options.push(item.volunteerEmail);
            }
            return options;
          })
        )
      ).sort((left, right) => left.localeCompare(right)),
    [items]
  );

  const normalizedVolunteerFilter = volunteerFilterQuery.trim().toLowerCase();
  const normalizedOrganizerFilter = organizerFilterQuery.trim().toLowerCase();
  const normalizedActivityFilter = activityFilterQuery.trim().toLowerCase();

  const activityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .filter(
              (item) => !normalizedOrganizerFilter || item.organizerName.toLowerCase().includes(normalizedOrganizerFilter)
            )
            .map((item) => item.activityTitle)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [items, normalizedOrganizerFilter]
  );

  const reviewStatusOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.reviewStatus))).sort((left, right) => left.localeCompare(right)),
    [items]
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return items.filter((item) => {
      if (reviewStatusFilter !== 'all' && item.reviewStatus !== reviewStatusFilter) {
        return false;
      }

      if (ratingFilter !== 'all' && Math.round(item.rating) !== Number(ratingFilter)) {
        return false;
      }

      if (normalizedOrganizerFilter && !item.organizerName.toLowerCase().includes(normalizedOrganizerFilter)) {
        return false;
      }

      if (normalizedVolunteerFilter) {
        const email = item.volunteerEmail?.toLowerCase() ?? '';
        if (
          !item.volunteerName.toLowerCase().includes(normalizedVolunteerFilter) &&
          !email.includes(normalizedVolunteerFilter)
        ) {
          return false;
        }
      }

      if (normalizedActivityFilter && !item.activityTitle.toLowerCase().includes(normalizedActivityFilter)) {
        return false;
      }

      if (sentimentFilter !== 'all' && item.sentiment !== sentimentFilter) {
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
        item.organizerName.toLowerCase().includes(normalizedSearch) ||
        item.volunteerName.toLowerCase().includes(normalizedSearch) ||
        (item.volunteerEmail?.toLowerCase().includes(normalizedSearch) ?? false) ||
        formatReviewStatusLabel(item.reviewStatus).toLowerCase().includes(normalizedSearch) ||
        item.comment.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [
    items,
    normalizedActivityFilter,
    normalizedOrganizerFilter,
    normalizedVolunteerFilter,
    periodFilter,
    ratingFilter,
    reviewStatusFilter,
    searchTerm,
    sentimentFilter,
  ]);

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
      const exceljs = await import('exceljs');
      const workbook = createFeedbackExportWorkbook(exceljs, filteredItems, { ratingFilter, periodFilter });
      const stamp = new Date().toISOString().slice(0, 10);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `feedback-review-${stamp}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
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
    if (!labelWritable) {
      setLabelError("Manual AI label is unavailable because column 'ai_label' is missing in the current schema.");
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
      let message = updateError instanceof Error ? updateError.message : 'Failed to update AI label.';
      if (message.toLowerCase().includes('ai_label column is not available')) {
        message =
          "Manual AI label is unavailable because column 'ai_label' is missing. Run the feedback ai_label migration SQL and retry.";
      }
      setLabelError(message);
    } finally {
      setUpdatingLabel(false);
    }
  }, [isAdmin, labelWritable, manualLabel, selectedFeedback, session?.access_token]);

  const advancedFilterCount =
    Number(Boolean(volunteerFilterQuery.trim())) +
    Number(Boolean(organizerFilterQuery.trim())) +
    Number(Boolean(activityFilterQuery.trim())) +
    Number(sentimentFilter !== 'all');

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setReviewStatusFilter('all');
    setRatingFilter('all');
    setPeriodFilter('30');
    setVolunteerFilterQuery('');
    setOrganizerFilterQuery('');
    setActivityFilterQuery('');
    setSentimentFilter('all');
    setShowMoreFilters(false);
  };

  const appliedFilterChips: FilterChip[] = [];

  if (searchTerm.trim()) {
    appliedFilterChips.push({
      key: 'search',
      label: `Search: ${searchTerm.trim()}`,
      onRemove: () => setSearchTerm(''),
    });
  }
  if (reviewStatusFilter !== 'all') {
    appliedFilterChips.push({
      key: 'state',
      label: `State: ${formatReviewStatusLabel(reviewStatusFilter)}`,
      onRemove: () => setReviewStatusFilter('all'),
    });
  }
  if (ratingFilter !== 'all') {
    appliedFilterChips.push({
      key: 'rating',
      label: `Rating: ${formatRatingFilterLabel(ratingFilter)}`,
      onRemove: () => setRatingFilter('all'),
    });
  }
  if (periodFilter !== '30') {
    appliedFilterChips.push({
      key: 'period',
      label: `Date: ${formatPeriodFilterLabel(periodFilter)}`,
      onRemove: () => setPeriodFilter('30'),
    });
  }
  if (volunteerFilterQuery.trim()) {
    appliedFilterChips.push({
      key: 'volunteer',
      label: `Volunteer: ${volunteerFilterQuery.trim()}`,
      onRemove: () => setVolunteerFilterQuery(''),
    });
  }
  if (organizerFilterQuery.trim()) {
    appliedFilterChips.push({
      key: 'organizer',
      label: `Organizer: ${organizerFilterQuery.trim()}`,
      onRemove: () => setOrganizerFilterQuery(''),
    });
  }
  if (activityFilterQuery.trim()) {
    appliedFilterChips.push({
      key: 'activity',
      label: `Activity: ${activityFilterQuery.trim()}`,
      onRemove: () => setActivityFilterQuery(''),
    });
  }
  if (sentimentFilter !== 'all') {
    appliedFilterChips.push({
      key: 'sentiment',
      label: `Sentiment: ${sentimentFilter.charAt(0).toUpperCase()}${sentimentFilter.slice(1)}`,
      onRemove: () => setSentimentFilter('all'),
    });
  }

  const reviewBody = (
    <section className="feedback-review-page">
      <Card as="section" className="feedback-review-filter-shell">
        <div className="feedback-review-filter-row feedback-review-filter-row-primary">
          <label className="feedback-review-search" htmlFor="feedback-review-search">
            <Search size={14} />
            <Input
              id="feedback-review-search"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by volunteer, email, activity, organizer, or feedback..."
              value={searchTerm}
            />
          </label>

          <Select
            className="feedback-review-filter-select"
            onChange={(event) => setReviewStatusFilter(event.target.value)}
            sizeMode="small"
            value={reviewStatusFilter}
          >
            <option value="all">All Review States</option>
            {reviewStatusOptions.map((status) => (
              <option key={status} value={status}>
                {formatReviewStatusLabel(status)}
              </option>
            ))}
          </Select>

          <Select className="feedback-review-filter-select" onChange={(event) => setRatingFilter(event.target.value as RatingFilter)} sizeMode="small" value={ratingFilter}>
            <option value="all">All Ratings</option>
            <option value="5">5 Stars</option>
            <option value="4">4 Stars</option>
            <option value="3">3 Stars</option>
            <option value="2">2 Stars</option>
            <option value="1">1 Star</option>
          </Select>

          <Select className="feedback-review-filter-select" onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)} sizeMode="small" value={periodFilter}>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="all">All Time</option>
          </Select>
        </div>

        <div className="feedback-review-filter-row feedback-review-filter-row-tools">
          <Button
            aria-controls="feedback-review-more-filters"
            aria-expanded={showMoreFilters}
            onClick={() => setShowMoreFilters((current) => !current)}
            type="button"
            variant="secondary"
          >
            <span>{showMoreFilters ? 'Hide More Filters' : 'More Filters'}</span>
            {advancedFilterCount > 0 && <span className="feedback-review-filter-count">{advancedFilterCount}</span>}
          </Button>

          <Button
            disabled={appliedFilterChips.length === 0}
            onClick={handleClearAllFilters}
            type="button"
            variant="secondary"
          >
            <span>Clear all</span>
          </Button>

          <Button onClick={() => void loadFeedback()} type="button" variant="secondary">
            <RefreshCw size={14} />
            <span>Refresh</span>
          </Button>

          <Button disabled={filteredItems.length === 0 || exporting} onClick={() => void handleExportExcel()} type="button">
            <Download size={14} />
            <span>{exporting ? 'Exporting...' : 'Export Excel'}</span>
          </Button>
        </div>

        {showMoreFilters && (
          <div className="feedback-review-more-filters" id="feedback-review-more-filters">
            <Input
              className="feedback-review-filter-select"
              list="feedback-review-volunteer-options"
              onChange={(event) => setVolunteerFilterQuery(event.target.value)}
              placeholder="Volunteer name or email"
              sizeMode="small"
              type="search"
              value={volunteerFilterQuery}
            />
            <datalist id="feedback-review-volunteer-options">
              {volunteerOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>

            <Input
              className="feedback-review-filter-select"
              list="feedback-review-organizer-options"
              onChange={(event) => setOrganizerFilterQuery(event.target.value)}
              placeholder="Organizer"
              sizeMode="small"
              type="search"
              value={organizerFilterQuery}
            />
            <datalist id="feedback-review-organizer-options">
              {organizerOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>

            <Input
              className="feedback-review-filter-select"
              list="feedback-review-activity-options"
              onChange={(event) => setActivityFilterQuery(event.target.value)}
              placeholder="Activity"
              sizeMode="small"
              type="search"
              value={activityFilterQuery}
            />
            <datalist id="feedback-review-activity-options">
              {activityOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>

            <Select
              className="feedback-review-filter-select"
              onChange={(event) => setSentimentFilter(event.target.value as 'all' | FeedbackSentiment)}
              sizeMode="small"
              value={sentimentFilter}
            >
              <option value="all">All Sentiments</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </Select>
          </div>
        )}

        {appliedFilterChips.length > 0 && (
          <div className="feedback-review-applied-filters">
            {appliedFilterChips.map((chip) => (
              <button className="feedback-review-chip" key={chip.key} onClick={chip.onRemove} type="button">
                <span>{chip.label}</span>
                <span aria-hidden="true">x</span>
              </button>
            ))}
          </div>
        )}
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
                <small>Organizer</small>
                <p>{selectedFeedback.organizerName}</p>
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

              {isAdmin && labelWritable && (
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
              {isAdmin && !labelWritable && (
                <p className="feedback-review-ai-reasons">
                  Manual label update is disabled because `ai_label` column is missing in current database schema.
                </p>
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
