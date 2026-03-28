import { ChevronRight, Star } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { ReviewStatusTag } from '../feedback';
import { Card } from '../ui';
import type { ReportSentimentChip } from '../../lib/organizerReportSummary';

interface FeedbackOverviewCardProps {
  rating: number;
  quote: string;
  sentiments: ReportSentimentChip[];
  onClick?: () => void;
  ariaLabel?: string;
}

function mapChipStatus(label: string, tone: ReportSentimentChip['tone']) {
  const normalized = label.trim().toLowerCase();

  if (normalized === 'positive' || normalized === 'neutral' || normalized === 'negative') {
    return normalized;
  }

  if (tone === 'success') {
    return 'positive';
  }
  if (tone === 'danger') {
    return 'negative';
  }
  if (tone === 'accent' || tone === 'info') {
    return 'reviewed';
  }
  return 'neutral';
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

export function FeedbackOverviewCard({ rating, quote, sentiments, onClick, ariaLabel }: FeedbackOverviewCardProps) {
  const interactive = Boolean(onClick);

  return (
    <Card
      as="section"
      aria-label={interactive ? ariaLabel ?? 'Open feedback review' : undefined}
      className={interactive ? 'org-report-lower-card org-report-feedback-card is-interactive' : 'org-report-lower-card org-report-feedback-card'}
      onClick={onClick}
      onKeyDown={(event) => handleKeyDown(event, onClick)}
      role={interactive ? 'link' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div className="org-report-card-head">
        <h3>Feedback Overview</h3>
        {interactive ? <ChevronRight className="org-report-feedback-link-icon" size={16} /> : null}
      </div>

      <div className="org-report-feedback-top">
        <div className="org-report-rating-box">
          <strong>{rating.toFixed(1)}</strong>
          <span>Rating</span>
        </div>

        <div className="org-report-feedback-copy">
          <div className="org-report-stars" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
            {Array.from({ length: 5 }).map((_, index) => (
              <Star className="org-report-star" fill="currentColor" key={index} size={16} />
            ))}
          </div>
          <blockquote>{`"${quote}"`}</blockquote>
        </div>
      </div>

      <div className="org-report-sentiment-block">
        <h4>Audience Sentiment</h4>
        <div className="org-report-sentiment-list">
          {sentiments.map((chip) => (
            <ReviewStatusTag
              className="org-report-sentiment-chip"
              key={chip.label}
              label={chip.label}
              status={mapChipStatus(chip.label, chip.tone)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
