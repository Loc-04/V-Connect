import { IssueBadge } from '../feedback';
import { Button, Card } from '../ui';
import type { ReportIssueHighlight } from '../../lib/organizerReportSummary';
import { IssueHighlightItem } from './IssueHighlightItem';

interface ReportActionItem extends ReportIssueHighlight {
  actionLabel?: string;
  onAction?: () => void;
}

interface IssueHighlightsCardProps {
  title?: string;
  issues: ReportActionItem[];
  emptyTitle?: string;
  emptyMessage?: string;
}

export function IssueHighlightsCard({
  title = 'Action Needed',
  issues,
  emptyTitle = 'No urgent action needed',
  emptyMessage = 'All key metrics look good. No action needed right now.',
}: IssueHighlightsCardProps) {
  const isSingleIssue = issues.length === 1;

  return (
    <Card
      as="section"
      className={isSingleIssue ? 'org-report-lower-card org-report-issues-card is-compact' : 'org-report-lower-card org-report-issues-card'}
    >
      <div className="org-report-card-head">
        <h3>{title}</h3>
        <IssueBadge
          className="org-report-active-badge"
          label={`${issues.length} action${issues.length === 1 ? '' : 's'}`}
          state={issues.length > 0 ? 'active' : 'warning'}
        />
      </div>

      {issues.length === 0 ? (
        <div className="org-report-action-empty">
          <strong>{emptyTitle}</strong>
          <p className="muted">{emptyMessage}</p>
        </div>
      ) : (
        <div className="org-report-issue-list">
          {issues.map((item) => (
            <article className="org-report-issue-item" key={item.id}>
              <IssueHighlightItem item={item} />
              {item.actionLabel && item.onAction ? (
                <div className="org-report-issue-action">
                  <Button className="small" onClick={item.onAction} type="button" variant="secondary">
                    {item.actionLabel}
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}
