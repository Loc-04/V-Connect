import { Star } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';

import { Card } from '../ui';
import { ReviewStatusTag, type ReviewStatus } from './ReviewStatusTag';
import './FeedbackShared.css';

interface FeedbackCardProps {
  name: string;
  avatarUrl?: string | null;
  rating: number;
  text: string;
  date?: string | null;
  tags?: ReactNode;
  activityLabel?: string;
  insight?: string;
  status?: ReviewStatus;
  onClick?: () => void;
  action?: ReactNode;
  className?: string;
}

function renderInitial(name: string) {
  const initial = name.trim().charAt(0).toUpperCase();
  return initial || 'F';
}

function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, onClick?: () => void) {
  if (!onClick) {
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onClick();
  }
}

export function FeedbackCard({
  name,
  avatarUrl,
  rating,
  text,
  date,
  tags,
  activityLabel,
  insight,
  status,
  onClick,
  action,
  className = '',
}: FeedbackCardProps) {
  const classes = `feedback-shared-card ${onClick ? 'is-clickable' : ''} ${className}`.trim();

  return (
    <Card
      as="article"
      aria-label={onClick ? `Open feedback from ${name}` : undefined}
      className={classes}
      onClick={onClick}
      onKeyDown={(event) => handleCardKeyDown(event, onClick)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="feedback-shared-head">
        <div className="feedback-shared-author">
          {avatarUrl ? (
            <img alt={name} className="feedback-shared-avatar-img" src={avatarUrl} />
          ) : (
            <span className="feedback-shared-avatar" aria-hidden="true">
              {renderInitial(name)}
            </span>
          )}

          <div className="feedback-shared-author-copy">
            <strong>{name}</strong>
            {activityLabel ? <span className="feedback-shared-activity">{activityLabel}</span> : null}
          </div>
        </div>

        {date ? <small className="feedback-shared-date">{date}</small> : null}
      </div>

      <div className="feedback-shared-meta">
        <div className="feedback-shared-rating" aria-label={`Rating ${rating} out of 5`}>
          {Array.from({ length: 5 }, (_, index) => {
            const active = index < Math.round(rating);
            return (
              <Star
                className={active ? 'feedback-shared-rating-star is-active' : 'feedback-shared-rating-star'}
                key={`${name}-${rating}-${index}`}
              />
            );
          })}
        </div>

        {tags}
      </div>

      <p className="feedback-shared-copy">{text}</p>

      {insight ? (
        <div className="feedback-shared-insight">
          <strong>Insight</strong>
          <p>{insight}</p>
        </div>
      ) : null}

      {(status || action) && (
        <div className="feedback-shared-foot">
          <div className="feedback-shared-foot-left">
            {status ? <ReviewStatusTag status={status} /> : null}
          </div>
          {action ? <div className="feedback-shared-foot-right">{action}</div> : null}
        </div>
      )}
    </Card>
  );
}
