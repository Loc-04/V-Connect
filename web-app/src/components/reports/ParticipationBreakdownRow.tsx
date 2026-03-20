import type { ReportParticipationBreakdownItem } from '../../lib/organizerReportSummary';

interface ParticipationBreakdownRowProps {
  item: ReportParticipationBreakdownItem;
}

export function ParticipationBreakdownRow({ item }: ParticipationBreakdownRowProps) {
  return (
    <div className="org-report-breakdown-row">
      <div className="org-report-breakdown-meta">
        <span>{item.label}</span>
        <strong>{item.value}</strong>
      </div>

      <div className="org-report-breakdown-track" role="presentation">
        <div
          className={`org-report-breakdown-fill is-${item.tone}`}
          style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }}
        />
      </div>
    </div>
  );
}
