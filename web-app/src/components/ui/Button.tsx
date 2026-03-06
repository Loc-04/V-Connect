import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const classByVariant: Record<ButtonVariant, string> = {
  primary: 'primary-btn',
  secondary: 'secondary-btn',
  danger: 'danger-btn',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const classes = `${classByVariant[variant]} ${className}`.trim();
  return <button className={classes} {...props} />;
}
