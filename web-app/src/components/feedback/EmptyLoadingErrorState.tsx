import { AlertTriangle, Inbox, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import './FeedbackShared.css';

type StateKind = 'loading' | 'empty' | 'error';

interface EmptyLoadingErrorStateProps {
  state: StateKind;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

function getIcon(state: StateKind) {
  if (state === 'loading') {
    return <LoaderCircle size={18} className="spin" />;
  }
  if (state === 'error') {
    return <AlertTriangle size={18} />;
  }
  return <Inbox size={18} />;
}

export function EmptyLoadingErrorState({
  state,
  title,
  description,
  action,
  className = '',
}: EmptyLoadingErrorStateProps) {
  const classes = `feedback-shared-state is-${state} ${className}`.trim();

  return (
    <div className={classes}>
      <span className="feedback-shared-state-icon" aria-hidden="true">
        {getIcon(state)}
      </span>
      <strong className="feedback-shared-state-title">{title}</strong>
      <p className="feedback-shared-state-copy">{description}</p>
      {action ? <div className="feedback-shared-state-action">{action}</div> : null}
    </div>
  );
}
