import { Badge } from '../ui';
import type { ReportIssueHighlight } from '../../lib/organizerReportSummary';

interface IssueHighlightItemProps {
  item: ReportIssueHighlight;
}

function getPriorityLabel(priority: ReportIssueHighlight['priority']) {
  if (priority === 'high') {
    return 'High Priority';
  }
  if (priority === 'medium') {
    return 'Medium Priority';
  }
  return 'Low Priority';
}

export function IssueHighlightItem({ item }: IssueHighlightItemProps) {
  return (
    <article className="org-report-issue-item">
      <div className="org-report-issue-head">
        <strong>{item.title}</strong>
        <Badge className={`org-report-priority org-report-priority-${item.priority}`} tone="neutral">
          {getPriorityLabel(item.priority)}
        </Badge>
      </div>
      <p>{item.description}</p>
    </article>
  );
}
