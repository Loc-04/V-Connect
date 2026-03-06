import type { HTMLAttributes, TableHTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react';

interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  wrapperClassName?: string;
}

export function Table({ wrapperClassName = '', className = '', children, ...props }: TableProps) {
  const wrapperClasses = `table-wrap ${wrapperClassName}`.trim();
  return (
    <div className={wrapperClasses}>
      <table className={className} {...props}>
        {children}
      </table>
    </div>
  );
}

export function Tr(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} />;
}

export function Th(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} />;
}

export function Td(props: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} />;
}
