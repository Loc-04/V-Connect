import { ChevronRight, Star } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { EmptyLoadingErrorState, ReviewStatusTag } from '../feedback';
import { Card } from '../ui';

interface FeedbackOverviewCardProps {
  rating: number | null;
  totalFeedbackCount: number;
  validFeedbackCount: number;
  spamFeedbackCount: number;
  quote?: string;
  sentiments: Array<{ label: 'Pos' | 'Neu' | 'Neg' | 'Spam'; count: number }>;
  onClick?: () => void;
  ariaLabel?: string;
}

function handleKeyDown(event: KeyboardEvent<HTMLElement>, onClick?: () => void) {
  if (!onClick) {
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onClick();
  }
}

export function FeedbackOverviewCard({
  rating,
  totalFeedbackCount,
  validFeedbackCount,
  spamFeedbackCount,
  quote,
  sentiments,
  onClick,
  ariaLabel,
}: FeedbackOverviewCardProps) {
  const interactive = Boolean(onClick);
  const hasAnyFeedback = totalFeedbackCount > 0;
  const hasRatedFeedback = validFeedbackCount > 0 && rating !== null;
  const isSpamOnly = hasAnyFeedback && validFeedbackCount === 0 && spamFeedbackCount > 0;
  const safeRating = rating ?? 0;

  return (
    <Card
      as="section"
      aria-label={interactive ? ariaLabel ?? 'Open feedback review' : undefined}
      className={
        interactive ? 'org-report-lower-card org-report-feedback-card is-interactive' : 'org-report-lower-card org-report-feedback-card'
      }
      onClick={onClick}
      onKeyDown={(event) => handleKeyDown(event, onClick)}
      role={interactive ? 'link' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div className="org-report-card-head">
        <h3>Feedback Overview</h3>
        {interactive ? <ChevronRight className="org-report-feedback-link-icon" size={16} /> : null}
      </div>

      {!hasAnyFeedback ? (
        <EmptyLoadingErrorState description="Feedback metrics appear after first submission." state="empty" title="No feedback yet" />
      ) : (
        <>
          {hasRatedFeedback ? (
            <div className="org-report-feedback-top">
              <div className="org-report-rating-box">
                <strong>{safeRating.toFixed(1)}</strong>
                <span>Rating</span>
              </div>

              <div className="org-report-feedback-copy">
                <div className="org-report-stars" aria-label={`${safeRating.toFixed(1)} out of 5 stars`}>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star className="org-report-star" fill="currentColor" key={index} size={16} />
                  ))}
                </div>
                {quote ? <blockquote>{`"${quote}"`}</blockquote> : null}
              </div>
            </div>
          ) : (
            <div className="org-report-feedback-empty-rating">
              <div className="org-report-rating-box">
                <strong>—</strong>
                <span>No Valid Rating</span>
              </div>
              <p className="muted">
                {isSpamOnly
                  ? `${spamFeedbackCount} submission${spamFeedbackCount === 1 ? '' : 's'} flagged as spam.`
                  : 'No valid rating yet.'}
              </p>
            </div>
          )}

          <div
            className={isSpamOnly ? 'org-report-feedback-stats-row is-compact' : 'org-report-feedback-stats-row'}
            aria-label="Feedback counts"
          >
            {!isSpamOnly ? (
              <div className="org-report-feedback-stat">
                <span>Total</span>
                <strong>{totalFeedbackCount}</strong>
              </div>
            ) : null}
            <div className="org-report-feedback-stat">
              <span>Valid</span>
              <strong>{validFeedbackCount}</strong>
            </div>
            <div className="org-report-feedback-stat">
              <span>Spam</span>
              <strong>{spamFeedbackCount}</strong>
            </div>
          </div>

          <div className="org-report-sentiment-block">
            <h4>Sentiment Mix</h4>
            <div className="org-report-sentiment-list">
              {sentiments.map((chip) => (
                <div className="org-report-sentiment-item" key={chip.label}>
                  <ReviewStatusTag className="org-report-sentiment-chip" status={chip.label} />
                  <span>{chip.count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
