import type { SelectHTMLAttributes } from 'react';

type SelectSize = 'normal' | 'small';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  sizeMode?: SelectSize;
}

export function Select({ sizeMode = 'normal', className = '', children, ...props }: SelectProps) {
  const sizeClass = sizeMode === 'small' ? 'small' : '';
  const classes = `text-input ${sizeClass} ${className}`.trim();
  return (
    <select className={classes} {...props}>
      {children}
    </select>
  );
}
