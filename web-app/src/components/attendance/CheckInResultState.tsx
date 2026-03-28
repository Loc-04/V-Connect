import { AlertCircle, CheckCircle2, CircleDashed } from 'lucide-react';
import type { HTMLAttributes } from 'react';

import './AttendanceShared.css';

export type CheckInResultTone = 'success' | 'error' | 'info';

interface CheckInResultStateProps extends HTMLAttributes<HTMLDivElement> {
  tone: CheckInResultTone;
  title: string;
  description?: string;
}

function getIcon(tone: CheckInResultTone) {
  if (tone === 'success') {
    return <CheckCircle2 size={16} />;
  }
  if (tone === 'error') {
    return <AlertCircle size={16} />;
  }
  return <CircleDashed size={16} />;
}

export function CheckInResultState({
  tone,
  title,
  description,
  className = '',
  ...props
}: CheckInResultStateProps) {
  const classes = `checkin-result-state is-${tone} ${className}`.trim();

  return (
    <div className={classes} role={tone === 'error' ? 'alert' : 'status'} {...props}>
      <span aria-hidden="true" className="checkin-result-state-icon">
        {getIcon(tone)}
      </span>
      <div className="checkin-result-state-copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}
