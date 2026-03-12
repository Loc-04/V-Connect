import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from '../ui/Card';

interface ProfileSectionCardProps {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

interface ProfileEmptyStateProps {
  title?: string;
  message: string;
  action?: ReactNode;
}

export function ProfileSectionCard({
  title,
  icon: Icon,
  action,
  className = '',
  children,
}: ProfileSectionCardProps) {
  const classes = `vol-profile-card vol-profile-section-card ${className}`.trim();

  return (
    <Card as="article" className={classes}>
      <div className="vol-profile-section-head">
        <div className="vol-profile-section-title">
          <span className="vol-profile-section-icon" aria-hidden="true">
            <Icon size={16} />
          </span>
          <h3>{title}</h3>
        </div>

        {action ? <div className="vol-profile-section-action">{action}</div> : null}
      </div>

      <div className="vol-profile-section-content">{children}</div>
    </Card>
  );
}

export function ProfileEmptyState({ title, message, action }: ProfileEmptyStateProps) {
  return (
    <div className="vol-profile-empty-state">
      {title ? <strong className="vol-profile-empty-title">{title}</strong> : null}
      <p className="vol-profile-empty-copy">{message}</p>
      {action ? <div className="vol-profile-empty-action">{action}</div> : null}
    </div>
  );
}
