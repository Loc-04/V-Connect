import { ChevronRight, Star } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { Card } from '../ui';
import { ReviewStatusTag } from '../feedback';

interface FeedbackSentimentItem {
  label: 'Positive' | 'Neutral' | 'Negative';
  count: number;
}

interface FeedbackOverviewModel {
  mode: 'no-feedback' | 'no-valid-feedback' | 'has-valid-feedback';
  title: string;
  description: string;
  validFeedbackCount: number;
  spamFeedbackCount: number;
  averageRating: number | null;
  quote?: string;
  sentiments: FeedbackSentimentItem[];
  showSpamNote: boolean;
}

interface FeedbackOverviewCardProps {
  overview: FeedbackOverviewModel;
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

export function FeedbackOverviewCard({ overview, onClick, ariaLabel }: FeedbackOverviewCardProps) {
  const interactive = Boolean(onClick);
  const hasValidFeedback = overview.mode === 'has-valid-feedback' && overview.averageRating !== null;
  const safeRating = overview.averageRating ?? 0;

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

      {hasValidFeedback ? (
        <>
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
              {overview.quote ? <blockquote>{`"${overview.quote}"`}</blockquote> : null}
            </div>
          </div>

          <div className="org-report-feedback-stats-row" aria-label="Feedback counts">
            <div className="org-report-feedback-stat">
              <span>Valid feedback</span>
              <strong>{overview.validFeedbackCount}</strong>
            </div>
            {overview.spamFeedbackCount > 0 ? (
              <div className="org-report-feedback-stat">
                <span>Spam</span>
                <strong>{overview.spamFeedbackCount}</strong>
              </div>
            ) : null}
          </div>

          <div className="org-report-sentiment-block">
            <h4>Sentiment Mix</h4>
            <div className="org-report-sentiment-list">
              {overview.sentiments.map((chip) => (
                <div className="org-report-sentiment-item" key={chip.label}>
                  <ReviewStatusTag className="org-report-sentiment-chip" status={chip.label} />
                  <span>{chip.count}</span>
                </div>
              ))}
            </div>
          </div>

          {overview.showSpamNote ? (
            <p className="org-report-feedback-note">Spam feedback is excluded from rating and sentiment insights.</p>
          ) : null}
        </>
      ) : (
        <>
          <div className="org-report-feedback-state">
            <strong>{overview.title}</strong>
            <p className="muted">{overview.description}</p>
          </div>
          <div className="org-report-feedback-stats-row is-compact" aria-label="Feedback counts">
            <div className="org-report-feedback-stat">
              <span>Valid feedback</span>
              <strong>{overview.validFeedbackCount}</strong>
            </div>
            <div className="org-report-feedback-stat">
              <span>Spam</span>
              <strong>{overview.spamFeedbackCount}</strong>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
