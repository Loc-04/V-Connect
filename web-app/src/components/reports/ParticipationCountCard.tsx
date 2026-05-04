import { Card } from '../ui';
import type { ReportParticipationBreakdownItem } from '../../lib/organizerReportSummary';
import { ParticipationBreakdownRow } from './ParticipationBreakdownRow';

interface ParticipationCountCardProps {
  title?: string;
  subtitle?: string;
  rows: ReportParticipationBreakdownItem[];
}

export function ParticipationCountCard({ title = 'Participation Breakdown', subtitle, rows }: ParticipationCountCardProps) {
  return (
    <Card as="section" className="org-report-side-card org-report-participation-card">
      <div className="org-report-card-head">
        <h3>{title}</h3>
      </div>
      {subtitle ? <p className="muted">{subtitle}</p> : null}

      <div className="org-report-breakdown-list">
        {rows.map((item) => (
          <ParticipationBreakdownRow item={item} key={item.label} />
        ))}
      </div>
    </Card>
  );
}
