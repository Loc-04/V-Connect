import type { ReportParticipationBreakdownItem } from '../../lib/organizerReportSummary';

interface ParticipationBreakdownRowProps {
  item: ReportParticipationBreakdownItem;
}

export function ParticipationBreakdownRow({ item }: ParticipationBreakdownRowProps) {
  const valueText = typeof item.value === 'number' ? String(item.value) : item.value;

  return (
    <div className="org-report-breakdown-row">
      <div className="org-report-breakdown-meta">
        <span>{item.label}</span>
        <strong>{valueText}</strong>
      </div>
      {item.helper ? <small className="org-report-breakdown-helper">{item.helper}</small> : null}

      <div className="org-report-breakdown-track" role="presentation">
        <div
          className={`org-report-breakdown-fill is-${item.tone}`}
          style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }}
        />
      </div>
    </div>
  );
}
