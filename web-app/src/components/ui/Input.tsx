import type { InputHTMLAttributes } from 'react';

type InputSize = 'normal' | 'small';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  sizeMode?: InputSize;
}

export function Input({ sizeMode = 'normal', className = '', ...props }: InputProps) {
  const sizeClass = sizeMode === 'small' ? 'small' : '';
  const classes = `text-input ${sizeClass} ${className}`.trim();
  return <input className={classes} {...props} />;
}
