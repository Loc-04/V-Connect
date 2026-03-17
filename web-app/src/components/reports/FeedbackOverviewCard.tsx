import { Star } from 'lucide-react';

import { Badge, Card } from '../ui';
import type { ReportSentimentChip } from '../../lib/organizerReportSummary';

interface FeedbackOverviewCardProps {
  rating: number;
  quote: string;
  sentiments: ReportSentimentChip[];
}

export function FeedbackOverviewCard({ rating, quote, sentiments }: FeedbackOverviewCardProps) {
  return (
    <Card as="section" className="org-report-lower-card org-report-feedback-card">
      <div className="org-report-card-head">
        <h3>Feedback Overview</h3>
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
            <Badge className="org-report-sentiment-chip" key={chip.label} tone={chip.tone}>
              {chip.label}
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  );
}
