import type { HTMLAttributes } from 'react';

export type BadgeTone = 'accent' | 'neutral' | 'success' | 'danger' | 'info';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClassByTone: Record<BadgeTone, string> = {
  accent: 'ui-badge-accent',
  neutral: 'ui-badge-neutral',
  success: 'ui-badge-success',
  danger: 'ui-badge-danger',
  info: 'ui-badge-info',
};

export function Badge({ tone = 'neutral', className = '', ...props }: BadgeProps) {
  const classes = `ui-badge ${toneClassByTone[tone]} ${className}`.trim();
  return <span className={classes} {...props} />;
}
