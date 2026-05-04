import { ArrowUpRight } from 'lucide-react';

import { Card } from '../ui';
import type { ReportParticipationBreakdownItem } from '../../lib/organizerReportSummary';
import { ParticipationBreakdownRow } from './ParticipationBreakdownRow';

interface ParticipationCountCardProps {
  total: string;
  trend: string;
  trendLabel: string;
  rows: ReportParticipationBreakdownItem[];
}

export function ParticipationCountCard({ total, trend, trendLabel, rows }: ParticipationCountCardProps) {
  return (
    <Card as="section" className="org-report-side-card org-report-participation-card">
      <div className="org-report-card-head">
        <h3>Participation Count</h3>
      </div>

      <div className="org-report-total-wrap">
        <strong>{total}</strong>
        <div className="org-report-trend org-report-trend-positive">
          <span>
            <ArrowUpRight size={14} />
            {trend}
          </span>
          <small>{trendLabel}</small>
        </div>
      </div>

      <div className="org-report-breakdown-list">
        {rows.map((item) => (
          <ParticipationBreakdownRow item={item} key={item.label} />
        ))}
      </div>
    </Card>
  );
}
