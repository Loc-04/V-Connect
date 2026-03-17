import { Card } from '../ui';

interface ReportMiniMetricCardProps {
  label: string;
  value: string;
}

export function ReportMiniMetricCard({ label, value }: ReportMiniMetricCardProps) {
  return (
    <Card as="article" className="org-report-mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  );
}
