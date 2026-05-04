import { Badge, Card } from '../ui';
import type { ReportMiniMetric } from '../../lib/organizerReportSummary';
import { ReportMiniMetricCard } from './ReportMiniMetricCard';

interface ReportSummaryHeroCardProps {
  liveLabel: string;
  title: string;
  durationLabel: string;
  durationValue: string;
  summary: string;
  metrics: ReportMiniMetric[];
}

export function ReportSummaryHeroCard({
  liveLabel,
  title,
  durationLabel,
  durationValue,
  summary,
  metrics,
}: ReportSummaryHeroCardProps) {
  return (
    <Card as="section" className="org-report-hero-card">
      <div className="org-report-hero-head">
        <Badge className="org-report-live-badge" tone="success">
          {liveLabel}
        </Badge>

        <div className="org-report-duration">
          <span>{durationLabel}</span>
          <strong>{durationValue}</strong>
        </div>
      </div>

      <h2>{title}</h2>
      <p>{summary}</p>

      {metrics.length > 0 ? (
        <div className="org-report-mini-metric-grid">
          {metrics.map((metric) => (
            <ReportMiniMetricCard key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
