import type { ImgHTMLAttributes } from 'react';

import iconSrc from '../../assets/Icon.png';

interface BrandIconProps extends ImgHTMLAttributes<HTMLImageElement> {
  decorative?: boolean;
}

export function BrandIcon({ className = '', decorative = true, alt, ...props }: BrandIconProps) {
  const classes = `brand-logo-img ${className}`.trim();

  return <img alt={decorative ? '' : alt ?? 'V-Connect'} className={classes} src={iconSrc} {...props} />;
}
