import { IssueBadge } from '../feedback';
import { Card } from '../ui';
import type { ReportIssueHighlight } from '../../lib/organizerReportSummary';
import { IssueHighlightItem } from './IssueHighlightItem';

interface IssueHighlightsCardProps {
  issues: ReportIssueHighlight[];
}

export function IssueHighlightsCard({ issues }: IssueHighlightsCardProps) {
  return (
    <Card as="section" className="org-report-lower-card org-report-issues-card">
      <div className="org-report-card-head">
        <h3>Issue Highlights</h3>
        <IssueBadge className="org-report-active-badge" label={`${issues.length} Active`} state="active" />
      </div>

      <div className="org-report-issue-list">
        {issues.map((item) => (
          <IssueHighlightItem item={item} key={item.id} />
        ))}
      </div>
    </Card>
  );
}
