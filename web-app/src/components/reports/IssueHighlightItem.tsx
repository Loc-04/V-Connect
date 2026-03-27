import { IssueBadge } from '../feedback';
import type { ReportIssueHighlight } from '../../lib/organizerReportSummary';

interface IssueHighlightItemProps {
  item: ReportIssueHighlight;
}

export function IssueHighlightItem({ item }: IssueHighlightItemProps) {
  return (
    <article className="org-report-issue-item">
      <div className="org-report-issue-head">
        <strong>{item.title}</strong>
        <IssueBadge className={`org-report-priority org-report-priority-${item.priority}`} priority={item.priority} />
      </div>
      <p>{item.description}</p>
    </article>
  );
}
