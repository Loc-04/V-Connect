import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'article' | 'div';
  children: ReactNode;
}

export function Card({ as = 'div', className = '', children, ...props }: CardProps) {
  const Component = as;
  const classes = `card ${className}`.trim();
  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
}
