import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  LineChart,
  PieChart,
  PlusCircle,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  UserCheck,
  UserRoundCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { Button, Card, Select } from '../components/ui';
import { listActivities } from '../lib/activities';
import { apiRequest } from '../lib/api';
import { listFeedbacks } from '../lib/feedback';
import { listParticipations } from '../lib/participations';
import type { ActivityRecord } from '../types/activity';
import type { UserRecord } from '../types/domain';
import type { FeedbackRecord } from '../types/feedback';
import type { ParticipationRecord } from '../types/participation';
import './AdminDashboardPage.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_COLORS = ['#8b5cf6', '#ff4d8d', '#22c55e', '#0ea5e9', '#f97316', '#6366f1'];
const DASHBOARD_ANCHORS = {
  activities: 'dashboard-activity-status',
  participations: 'dashboard-participation-status',
  insights: 'dashboard-insights',
} as const;

interface DashboardMetrics {
  totalUsers: number;
  activeUsers: number;
  totalActivities: number;
  publishedActivities: number;
  completedActivities: number;
  totalParticipations: number;
  checkedInParticipations: number;
  totalReports: number;
  usersByRole: Record<string, number>;
  activitiesByStatus: Record<string, number>;
  participationsByStatus: Record<string, number>;
}

interface AdminUsersResponse {
  users: UserRecord[];
}

type TimeRangeKey = 'today' | '7d' | '30d';
type InsightTone = 'warning' | 'success' | 'info';
type TrendDirection = 'up' | 'down' | 'flat';

interface TimeRangeOption {
  value: TimeRangeKey;
  label: string;
  shortLabel: string;
}

interface TimeWindow {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  label: string;
  shortLabel: string;
}

interface TrendSummary {
  current: number;
  previous: number;
  delta: number;
  percentChange: number | null;
  direction: TrendDirection;
}

interface DashboardSnapshot {
  summary: DashboardMetrics | null;
  users: UserRecord[];
  activities: ActivityRecord[];
  participations: ParticipationRecord[];
  feedbacks: FeedbackRecord[];
}

interface SeriesPoint {
  label: string;
  activities: number;
  participations: number;
}

interface DashboardCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  actionLabel?: string;
}

interface KpiCard {
  key: string;
  label: string;
  value: number;
  trend: TrendSummary;
  currentLabel: string;
  icon: LucideIcon;
  tone: 'users' | 'activity' | 'participation' | 'report';
  route?: string;
  anchorId?: string;
}

interface InsightItem {
  id: string;
  tone: InsightTone;
  title: string;
  description: string;
  actionLabel?: string;
  route?: string;
  anchorId?: string;
}

const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { value: 'today', label: 'Today', shortLabel: 'today' },
  { value: '7d', label: 'Last 7 days', shortLabel: 'last 7 days' },
  { value: '30d', label: 'Last 30 days', shortLabel: 'last 30 days' },
];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toTitleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatCompactDateLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatMetricValue(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatRelativeTimestamp(lastUpdatedAt: Date | null, nowTick: number) {
  if (!lastUpdatedAt) {
    return 'Waiting for first sync';
  }

  const diffSeconds = Math.max(0, Math.floor((nowTick - lastUpdatedAt.getTime()) / 1000));
  if (diffSeconds < 5) {
    return 'Last updated just now';
  }
  if (diffSeconds < 60) {
    return `Last updated ${diffSeconds}s ago`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `Last updated ${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  return `Last updated ${diffHours}h ago`;
}

function getWindow(range: TimeRangeKey, now = new Date()): TimeWindow {
  const option = TIME_RANGE_OPTIONS.find((entry) => entry.value === range) ?? TIME_RANGE_OPTIONS[1];

  let start = startOfDay(now);
  if (range === '7d') {
    start = startOfDay(new Date(now.getTime() - DAY_MS * 6));
  } else if (range === '30d') {
    start = startOfDay(new Date(now.getTime() - DAY_MS * 29));
  }

  const duration = now.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime());
  const previousStart = new Date(start.getTime() - duration);

  return {
    start,
    end: now,
    previousStart,
    previousEnd,
    label: option.label,
    shortLabel: option.shortLabel,
  };
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isInWindow(timestamp: number | null, start: Date, end: Date) {
  if (timestamp === null) {
    return false;
  }
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

function buildTrend<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  window: TimeWindow,
  predicate?: (row: T) => boolean
): TrendSummary {
  const filteredRows = predicate ? rows.filter(predicate) : rows;
  const current = filteredRows.filter((row) => isInWindow(parseTimestamp(getDate(row)), window.start, window.end)).length;
  const previous = filteredRows.filter((row) =>
    isInWindow(parseTimestamp(getDate(row)), window.previousStart, window.previousEnd)
  ).length;
  const delta = current - previous;

  let percentChange: number | null = null;
  if (previous > 0) {
    percentChange = Math.round((delta / previous) * 100);
  } else if (current > 0) {
    percentChange = 100;
  }

  return {
    current,
    previous,
    delta,
    percentChange,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
  };
}

function formatTrendLine(trend: TrendSummary, label: string) {
  const sign = trend.delta > 0 ? '+' : '';
  if (trend.direction === 'flat') {
    return `No change vs previous ${label}`;
  }

  if (trend.percentChange !== null) {
    return `${sign}${Math.abs(trend.percentChange)}% vs previous ${label}`;
  }

  return `${sign}${Math.abs(trend.delta)} vs previous ${label}`;
}

function countByLabel(values: string[]) {
  return values.reduce<Record<string, number>>((accumulator, value) => {
    const normalized = value.trim();
    if (!normalized) {
      return accumulator;
    }

    accumulator[normalized] = (accumulator[normalized] ?? 0) + 1;
    return accumulator;
  }, {});
}

function buildDailySeries(activities: ActivityRecord[], participations: ParticipationRecord[], window: TimeWindow): SeriesPoint[] {
  const dayLabels = new Map<string, SeriesPoint>();
  const dayCursor = startOfDay(window.start);
  const finalDay = startOfDay(window.end);

  while (dayCursor.getTime() <= finalDay.getTime()) {
    const key = dayCursor.toISOString().slice(0, 10);
    dayLabels.set(key, {
      label: formatCompactDateLabel(dayCursor),
      activities: 0,
      participations: 0,
    });
    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  activities.forEach((activity) => {
    const timestamp = parseTimestamp(activity.created_at);
    if (!isInWindow(timestamp, window.start, window.end) || timestamp === null) {
      return;
    }

    const key = new Date(timestamp).toISOString().slice(0, 10);
    const point = dayLabels.get(key);
    if (point) {
      point.activities += 1;
    }
  });

  participations.forEach((participation) => {
    const timestamp = parseTimestamp(participation.created_at ?? participation.date ?? null);
    if (!isInWindow(timestamp, window.start, window.end) || timestamp === null) {
      return;
    }

    const key = new Date(timestamp).toISOString().slice(0, 10);
    const point = dayLabels.get(key);
    if (point) {
      point.participations += 1;
    }
  });

  return Array.from(dayLabels.values());
}

function buildStatusBreakdown(values: string[]) {
  return Object.entries(countByLabel(values)).sort((left, right) => right[1] - left[1]);
}
function buildRoleBreakdown(users: UserRecord[], fallback: Record<string, number>) {
  if (users.length === 0) {
    return Object.entries(fallback).map(([label, value]) => ({ label: toTitleCase(label), value }));
  }

  return Object.entries(countByLabel(users.map((user) => String(user.role ?? 'unknown')))).map(([label, value]) => ({
    label: toTitleCase(label),
    value,
  }));
}

function buildInsights(
  activities: ActivityRecord[],
  participations: ParticipationRecord[],
  feedbacks: FeedbackRecord[],
  trends: Record<string, TrendSummary>
): InsightItem[] {
  const insights: InsightItem[] = [];
  const pendingApprovals = participations.filter((participation) => participation.status === 'pending').length;
  if (pendingApprovals > 0) {
    insights.push({
      id: 'pending-approvals',
      tone: 'warning',
      title: `${pendingApprovals} pending approvals need attention`,
      description: 'Volunteer requests are waiting for review. Clear the queue before new events go live.',
      actionLabel: 'Inspect status',
      anchorId: DASHBOARD_ANCHORS.participations,
    });
  }

  const participationTrend = trends.totalParticipations;
  if (participationTrend.direction === 'down' && participationTrend.previous > 0) {
    insights.push({
      id: 'low-participation',
      tone: 'warning',
      title: 'Participation dropped in the selected window',
      description: `${participationTrend.current} participations landed in the current range versus ${participationTrend.previous} in the previous one.`,
      actionLabel: 'Review activity mix',
      anchorId: DASHBOARD_ANCHORS.activities,
    });
  }

  const participationCountByActivity = participations.reduce<Record<string, number>>((accumulator, participation) => {
    const activityId = participation.activityId ?? participation.activity_id ?? '';
    if (!activityId) {
      return accumulator;
    }
    accumulator[activityId] = (accumulator[activityId] ?? 0) + 1;
    return accumulator;
  }, {});

  const volunteerGaps = activities.filter(
    (activity) => activity.status === 'published' && (participationCountByActivity[activity.id] ?? 0) === 0
  ).length;
  if (volunteerGaps > 0) {
    insights.push({
      id: 'volunteer-gaps',
      tone: 'info',
      title: `${volunteerGaps} published activities have no volunteers yet`,
      description: 'Those activities may need promotion, scheduling changes, or staff follow-up to avoid last-minute gaps.',
      actionLabel: 'Open browse view',
      route: '/browse',
    });
  }

  const reportTrend = trends.reports;
  if (reportTrend.direction === 'up' && feedbacks.length > 0) {
    insights.push({
      id: 'report-volume',
      tone: 'info',
      title: 'Feedback volume is increasing',
      description: `${reportTrend.current} feedback submissions arrived in the current range. Review the latest themes from volunteers.`,
      actionLabel: 'Open feedback',
      route: '/admin/feedback',
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'stable',
      tone: 'success',
      title: 'System looks stable',
      description: 'No urgent alerts were detected from the current activity, participation, and feedback data.',
    });
  }

  return insights;
}

function renderToneClass(tone: InsightTone) {
  if (tone === 'warning') {
    return 'warning';
  }
  if (tone === 'success') {
    return 'success';
  }
  return 'info';
}

function EmptyState({ message }: { message: string }) {
  return <div className="dashboard-empty-state">{message}</div>;
}

function DashboardCard({ title, description, children, actionLabel }: DashboardCardProps) {
  return (
    <Card as="section" className="dashboard-panel">
      <div className="dashboard-panel-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {actionLabel ? <span className="dashboard-panel-tag">{actionLabel}</span> : null}
      </div>
      {children}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton-layout" aria-hidden="true">
      <div className="dashboard-kpi-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="dashboard-skeleton-card" key={`metric-${index}`}>
            <div className="dashboard-skeleton-line dashboard-skeleton-line--short" />
            <div className="dashboard-skeleton-line dashboard-skeleton-line--large" />
            <div className="dashboard-skeleton-line dashboard-skeleton-line--medium" />
          </div>
        ))}
      </div>

      <div className="dashboard-chart-grid">
        <div className="dashboard-skeleton-card dashboard-skeleton-card--chart" />
        <div className="dashboard-skeleton-card dashboard-skeleton-card--chart" />
      </div>

      <div className="dashboard-secondary-grid">
        <div className="dashboard-skeleton-card dashboard-skeleton-card--bar" />
        <div className="dashboard-skeleton-card dashboard-skeleton-card--bar" />
      </div>
    </div>
  );
}

function DualLineChart({ data }: { data: SeriesPoint[] }) {
  if (data.length === 0) {
    return <EmptyState message="No activity trend data for the selected range." />;
  }

  const width = 640;
  const height = 250;
  const padding = { top: 18, right: 18, bottom: 36, left: 24 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.flatMap((point) => [point.activities, point.participations]));

  const createPath = (values: number[]) =>
    values
      .map((value, index) => {
        const x = padding.left + (data.length === 1 ? innerWidth / 2 : (innerWidth / (data.length - 1)) * index);
        const y = padding.top + innerHeight - (value / maxValue) * innerHeight;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');

  const labelIndexes = new Set<number>([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  return (
    <div className="dashboard-line-chart-wrap">
      <svg className="dashboard-line-chart" viewBox={`0 0 ${width} ${height}`} role="img">
        {[0, 1, 2, 3].map((tick) => {
          const y = padding.top + (innerHeight / 3) * tick;
          return <line className="dashboard-grid-line" key={`grid-${tick}`} x1={padding.left} x2={width - padding.right} y1={y} y2={y} />;
        })}

        <path className="dashboard-line dashboard-line--activities" d={createPath(data.map((point) => point.activities))} />
        <path className="dashboard-line dashboard-line--participations" d={createPath(data.map((point) => point.participations))} />

        {data.map((point, index) => {
          const x = padding.left + (data.length === 1 ? innerWidth / 2 : (innerWidth / (data.length - 1)) * index);
          const activityY = padding.top + innerHeight - (point.activities / maxValue) * innerHeight;
          const participationY = padding.top + innerHeight - (point.participations / maxValue) * innerHeight;

          return (
            <g key={point.label}>
              <circle className="dashboard-line-point dashboard-line-point--activities" cx={x} cy={activityY} r="4" />
              <circle className="dashboard-line-point dashboard-line-point--participations" cx={x} cy={participationY} r="4" />
              {labelIndexes.has(index) ? (
                <text className="dashboard-axis-label" textAnchor="middle" x={x} y={height - 10}>
                  {point.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="dashboard-chart-legend">
        <span>
          <i className="dashboard-legend-swatch dashboard-legend-swatch--activities" />
          Activities created
        </span>
        <span>
          <i className="dashboard-legend-swatch dashboard-legend-swatch--participations" />
          Participations created
        </span>
      </div>
    </div>
  );
}
function DonutChart({ items }: { items: Array<{ label: string; value: number }> }) {
  const filteredItems = items.filter((item) => item.value > 0);
  if (filteredItems.length === 0) {
    return <EmptyState message="No user role data available yet." />;
  }

  const total = filteredItems.reduce((sum, item) => sum + item.value, 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const segments = filteredItems.reduce<
    Array<{
      label: string;
      dashArray: string;
      dashOffset: number;
      stroke: string;
      value: number;
    }>
  >((accumulator, item, index) => {
    const used = accumulator.reduce((sum, segment) => sum + Number(segment.dashArray.split(' ')[0]), 0);
    const length = (item.value / total) * circumference;
    accumulator.push({
      label: item.label,
      dashArray: `${length} ${circumference - length}`,
      dashOffset: -used,
      stroke: CHART_COLORS[index % CHART_COLORS.length],
      value: item.value,
    });
    return accumulator;
  }, []);

  return (
    <div className="dashboard-donut-wrap">
      <div className="dashboard-donut-chart">
        <svg viewBox="0 0 160 160" role="img">
          <circle className="dashboard-donut-track" cx="80" cy="80" r={radius} />
          {segments.map((segment) => {
            return (
              <circle
                className="dashboard-donut-segment"
                cx="80"
                cy="80"
                key={segment.label}
                r={radius}
                stroke={segment.stroke}
                strokeDasharray={segment.dashArray}
                strokeDashoffset={segment.dashOffset}
              />
            );
          })}
        </svg>
        <div className="dashboard-donut-center">
          <strong>{formatMetricValue(total)}</strong>
          <span>users</span>
        </div>
      </div>

      <div className="dashboard-donut-legend">
        {filteredItems.map((item, index) => (
          <div className="dashboard-donut-legend-row" key={item.label}>
            <span className="dashboard-donut-legend-label">
              <i className="dashboard-donut-swatch" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
              {item.label}
            </span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBars({ items, emptyMessage }: { items: Array<[string, number]>; emptyMessage: string }) {
  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  const maxValue = Math.max(1, ...items.map(([, value]) => value));

  return (
    <div className="dashboard-status-bars">
      {items.map(([label, value], index) => (
        <div className="dashboard-status-row" key={label}>
          <div className="dashboard-status-meta">
            <span>{toTitleCase(label)}</span>
            <strong>{formatMetricValue(value)}</strong>
          </div>
          <div className="dashboard-status-track">
            <div
              className="dashboard-status-fill"
              style={{ width: `${Math.max(10, (value / maxValue) * 100)}%`, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('7d');
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>({
    summary: null,
    users: [],
    activities: [],
    participations: [],
    feedbacks: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const handleNavigate = useCallback(
    (route?: string, anchorId?: string) => {
      if (route) {
        navigate(route);
        return;
      }

      if (anchorId) {
        const target = document.getElementById(anchorId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    },
    [navigate]
  );

  const hasExistingData = useMemo(
    () =>
      snapshot.summary !== null ||
      snapshot.users.length > 0 ||
      snapshot.activities.length > 0 ||
      snapshot.participations.length > 0 ||
      snapshot.feedbacks.length > 0,
    [snapshot]
  );

  const loadDashboard = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    if (hasExistingData) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);
    setPartialWarning(null);

    const results = await Promise.allSettled([
      apiRequest<DashboardMetrics>('/admin/dashboard', {
        accessToken,
      }),
      apiRequest<AdminUsersResponse>('/admin/users', {
        accessToken,
      }),
      listActivities({
        accessToken,
        status: 'all',
        limit: 500,
      }),
      listParticipations({
        accessToken,
        status: 'all',
        limit: 800,
      }),
      listFeedbacks({
        accessToken,
        limit: 400,
      }),
    ]);

    const [summaryResult, usersResult, activitiesResult, participationsResult, feedbackResult] = results;

    const failedSources = results.reduce<string[]>((accumulator, result, index) => {
      if (result.status === 'fulfilled') {
        return accumulator;
      }

      const labels = ['summary', 'users', 'activities', 'participations', 'feedback'];
      accumulator.push(labels[index]);
      return accumulator;
    }, []);

    const hasSuccessfulSource = results.some((result) => result.status === 'fulfilled');

    if (!hasSuccessfulSource) {
      setError('Failed to load dashboard data.');
    } else {
      setSnapshot((current) => ({
        summary: summaryResult.status === 'fulfilled' ? summaryResult.value : current.summary,
        users: usersResult.status === 'fulfilled' ? usersResult.value.users : current.users,
        activities: activitiesResult.status === 'fulfilled' ? activitiesResult.value : current.activities,
        participations: participationsResult.status === 'fulfilled' ? participationsResult.value : current.participations,
        feedbacks: feedbackResult.status === 'fulfilled' ? feedbackResult.value : current.feedbacks,
      }));
      setLastUpdatedAt(new Date());
      if (failedSources.length > 0) {
        setPartialWarning(`Some widgets may be stale: ${failedSources.join(', ')}.`);
      }
    }

    setLoading(false);
    setRefreshing(false);
  }, [accessToken, hasExistingData]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const timeWindow = useMemo(() => getWindow(timeRange), [timeRange]);
  const usersByRole = useMemo(
    () => buildRoleBreakdown(snapshot.users, snapshot.summary?.usersByRole ?? {}),
    [snapshot.summary?.usersByRole, snapshot.users]
  );
  const activitiesByStatus = useMemo(() => {
    if (snapshot.activities.length > 0) {
      return buildStatusBreakdown(snapshot.activities.map((activity) => String(activity.status ?? 'unknown')));
    }
    return Object.entries(snapshot.summary?.activitiesByStatus ?? {});
  }, [snapshot.activities, snapshot.summary?.activitiesByStatus]);
  const participationsByStatus = useMemo(() => {
    if (snapshot.participations.length > 0) {
      return buildStatusBreakdown(snapshot.participations.map((participation) => String(participation.status ?? 'unknown')));
    }
    return Object.entries(snapshot.summary?.participationsByStatus ?? {});
  }, [snapshot.participations, snapshot.summary?.participationsByStatus]);

  const trends = useMemo(
    () => ({
      totalUsers: buildTrend(snapshot.users, (user) => user.created_at, timeWindow),
      activeUsers: buildTrend(
        snapshot.users,
        (user) => user.updated_at ?? user.created_at,
        timeWindow,
        (user) => String(user.status ?? '').toLowerCase() === 'active'
      ),
      totalActivities: buildTrend(snapshot.activities, (activity) => activity.created_at, timeWindow),
      totalParticipations: buildTrend(
        snapshot.participations,
        (participation) => participation.created_at ?? participation.date ?? null,
        timeWindow
      ),
      checkedIn: buildTrend(
        snapshot.participations,
        (participation) => participation.checked_in_at ?? participation.updated_at ?? null,
        timeWindow,
        (participation) => String(participation.status ?? '').toLowerCase() === 'checked_in'
      ),
      reports: buildTrend(snapshot.feedbacks, (feedback) => feedback.created_at, timeWindow),
    }),
    [snapshot.activities, snapshot.feedbacks, snapshot.participations, snapshot.users, timeWindow]
  );
  const kpiCards = useMemo<KpiCard[]>(() => {
    const totalUsers = snapshot.summary?.totalUsers ?? snapshot.users.length;
    const activeUsers =
      snapshot.summary?.activeUsers ??
      snapshot.users.filter((user) => String(user.status ?? '').toLowerCase() === 'active').length;
    const totalActivities = snapshot.summary?.totalActivities ?? snapshot.activities.length;
    const totalParticipations = snapshot.summary?.totalParticipations ?? snapshot.participations.length;
    const checkedInParticipations =
      snapshot.summary?.checkedInParticipations ??
      snapshot.participations.filter((participation) => String(participation.status ?? '').toLowerCase() === 'checked_in').length;
    const reports = snapshot.summary?.totalReports ?? snapshot.feedbacks.length;

    return [
      {
        key: 'total-users',
        label: 'Total Users',
        value: totalUsers,
        trend: trends.totalUsers,
        currentLabel: `${trends.totalUsers.current} new in ${timeWindow.shortLabel}`,
        icon: Users,
        tone: 'users',
        route: '/admin/users',
      },
      {
        key: 'active-users',
        label: 'Active Users',
        value: activeUsers,
        trend: trends.activeUsers,
        currentLabel: `${trends.activeUsers.current} active updates in ${timeWindow.shortLabel}`,
        icon: UserCheck,
        tone: 'users',
        route: '/admin/users',
      },
      {
        key: 'total-activities',
        label: 'Total Activities',
        value: totalActivities,
        trend: trends.totalActivities,
        currentLabel: `${trends.totalActivities.current} created in ${timeWindow.shortLabel}`,
        icon: CalendarDays,
        tone: 'activity',
        anchorId: DASHBOARD_ANCHORS.activities,
      },
      {
        key: 'participations',
        label: 'Participations',
        value: totalParticipations,
        trend: trends.totalParticipations,
        currentLabel: `${trends.totalParticipations.current} in ${timeWindow.shortLabel}`,
        icon: ClipboardList,
        tone: 'participation',
        anchorId: DASHBOARD_ANCHORS.participations,
      },
      {
        key: 'checked-in',
        label: 'Checked-in',
        value: checkedInParticipations,
        trend: trends.checkedIn,
        currentLabel: `${trends.checkedIn.current} check-ins in ${timeWindow.shortLabel}`,
        icon: CheckCircle2,
        tone: 'participation',
        anchorId: DASHBOARD_ANCHORS.participations,
      },
      {
        key: 'reports',
        label: 'Reports',
        value: reports,
        trend: trends.reports,
        currentLabel: `${trends.reports.current} reports in ${timeWindow.shortLabel}`,
        icon: FileText,
        tone: 'report',
        route: '/admin/feedback',
      },
    ];
  }, [snapshot.activities, snapshot.feedbacks, snapshot.participations, snapshot.summary, snapshot.users, trends, timeWindow.shortLabel]);

  const trendSeries = useMemo(
    () => buildDailySeries(snapshot.activities, snapshot.participations, timeWindow),
    [snapshot.activities, snapshot.participations, timeWindow]
  );

  const insights = useMemo(
    () => buildInsights(snapshot.activities, snapshot.participations, snapshot.feedbacks, trends),
    [snapshot.activities, snapshot.feedbacks, snapshot.participations, trends]
  );

  const isEmpty = !loading && !snapshot.summary && snapshot.users.length === 0 && snapshot.activities.length === 0;

  return (
    <section className="admin-dashboard-page">
      <div className="dashboard-page-head">
        <div className="dashboard-head-copy">
          <span className="dashboard-eyebrow">Operations overview</span>
          <h2>Admin Dashboard</h2>
          <p className="muted">Monitor growth, approvals, activity delivery, and volunteer momentum from one place.</p>
        </div>

        <div className="dashboard-toolbar">
          <div className="dashboard-filter-group">
            <label className="dashboard-control-label" htmlFor="admin-dashboard-range">
              Time range
            </label>
            <div className="dashboard-filter-controls">
              <Select
                className="dashboard-range-select"
                id="admin-dashboard-range"
                onChange={(event) => setTimeRange(event.target.value as TimeRangeKey)}
                value={timeRange}
              >
                {TIME_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Button className="dashboard-refresh-btn" disabled={loading || refreshing} onClick={() => void loadDashboard()} type="button" variant="secondary">
                <RefreshCw className={refreshing ? 'dashboard-icon-spin' : ''} size={16} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>

          <div className="dashboard-quick-actions" role="group" aria-label="Quick actions">
            <Button className="dashboard-action-btn" onClick={() => navigate('/activities/create')} type="button">
              <PlusCircle size={16} />
              Create Activity
            </Button>
            <Button className="dashboard-action-btn" onClick={() => handleNavigate(undefined, DASHBOARD_ANCHORS.participations)} type="button" variant="secondary">
              <Sparkles size={16} />
              View Approvals
            </Button>
            <Button className="dashboard-action-btn" onClick={() => navigate('/admin/users')} type="button" variant="secondary">
              <UserRoundCog size={16} />
              Manage Users
            </Button>
          </div>
        </div>
      </div>

      <div className="dashboard-meta-row">
        <p className="muted dashboard-last-sync">{formatRelativeTimestamp(lastUpdatedAt, nowTick)}</p>
        <span className="dashboard-live-badge">Range: {timeWindow.label}</span>
      </div>

      {partialWarning ? <p className="dashboard-warning-text">{partialWarning}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {loading ? (
        <DashboardSkeleton />
      ) : isEmpty ? (
        <Card as="section" className="dashboard-panel">
          <div className="dashboard-empty-state">No dashboard data is available yet. Refresh after records start syncing from Supabase.</div>
        </Card>
      ) : (
        <>
          <div className="dashboard-kpi-grid">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              const TrendIcon = card.trend.direction === 'down' ? ArrowDownRight : ArrowUpRight;
              const trendClass = card.trend.direction === 'down' ? 'down' : card.trend.direction === 'up' ? 'up' : 'flat';

              return (
                <button
                  className={`dashboard-kpi-card dashboard-kpi-card--${card.tone}`}
                  key={card.key}
                  onClick={() => handleNavigate(card.route, card.anchorId)}
                  type="button"
                >
                  <div className="dashboard-kpi-top">
                    <span className="dashboard-kpi-icon">
                      <Icon size={18} />
                    </span>
                    <span className="dashboard-kpi-link">Open</span>
                  </div>
                  <p>{card.label}</p>
                  <strong>{formatMetricValue(card.value)}</strong>
                  <div className={`dashboard-kpi-trend dashboard-kpi-trend--${trendClass}`}>
                    <TrendIcon size={14} />
                    <span>{formatTrendLine(card.trend, timeWindow.shortLabel)}</span>
                  </div>
                  <span className="dashboard-kpi-footnote">{card.currentLabel}</span>
                </button>
              );
            })}
          </div>
          <div className="dashboard-chart-grid">
            <div id="dashboard-activity-trend">
              <DashboardCard actionLabel={timeWindow.label} description="Track how activity creation and volunteer demand move over time." title="Activities vs participations">
                <DualLineChart data={trendSeries} />
              </DashboardCard>
            </div>

            <DashboardCard actionLabel={formatMetricValue(usersByRole.reduce((sum, item) => sum + item.value, 0))} description="Role balance helps show whether supply and staffing are healthy." title="Users by role">
              <DonutChart items={usersByRole} />
            </DashboardCard>
          </div>

          <div className="dashboard-secondary-grid">
            <div id={DASHBOARD_ANCHORS.activities}>
              <DashboardCard actionLabel={formatMetricValue(activitiesByStatus.reduce((sum, [, value]) => sum + value, 0))} description="Spot delivery bottlenecks across draft, live, and completed activities." title="Activities by status">
                <StatusBars emptyMessage="No activity status data available yet." items={activitiesByStatus} />
              </DashboardCard>
            </div>

            <div id={DASHBOARD_ANCHORS.participations}>
              <DashboardCard actionLabel={formatMetricValue(participationsByStatus.reduce((sum, [, value]) => sum + value, 0))} description="Use status mix to monitor approvals, rejections, and checked-in attendance." title="Participations by status">
                <StatusBars emptyMessage="No participation status data available yet." items={participationsByStatus} />
              </DashboardCard>
            </div>
          </div>

          <div className="dashboard-insights-grid" id={DASHBOARD_ANCHORS.insights}>
            <DashboardCard description="Simple rule-based alerts from live activity, participation, and feedback data." title="System insights">
              <div className="dashboard-insights-list">
                {insights.map((insight) => (
                  <article className={`dashboard-insight-item dashboard-insight-item--${renderToneClass(insight.tone)}`} key={insight.id}>
                    <div className="dashboard-insight-icon">
                      {insight.tone === 'warning' ? <TriangleAlert size={18} /> : insight.tone === 'success' ? <CheckCircle2 size={18} /> : <Activity size={18} />}
                    </div>
                    <div className="dashboard-insight-copy">
                      <h4>{insight.title}</h4>
                      <p>{insight.description}</p>
                    </div>
                    {insight.actionLabel ? (
                      <Button
                        className="dashboard-insight-btn"
                        onClick={() => handleNavigate(insight.route, insight.anchorId)}
                        type="button"
                        variant="secondary"
                      >
                        {insight.actionLabel}
                      </Button>
                    ) : null}
                  </article>
                ))}
              </div>
            </DashboardCard>

            <DashboardCard description="Use these widgets as a fast status check before diving into the detailed pages." title="Dashboard guide">
              <div className="dashboard-guide-grid">
                <div className="dashboard-guide-item">
                  <LineChart size={18} />
                  <div>
                    <strong>Trend view</strong>
                    <p>Compare current performance against the previous matching window.</p>
                  </div>
                </div>
                <div className="dashboard-guide-item">
                  <PieChart size={18} />
                  <div>
                    <strong>Role balance</strong>
                    <p>Check whether volunteers, organizers, and admins are growing evenly.</p>
                  </div>
                </div>
                <div className="dashboard-guide-item">
                  <BarChart3 size={18} />
                  <div>
                    <strong>Status mix</strong>
                    <p>Use status bars to find where approvals, completions, or check-ins are backing up.</p>
                  </div>
                </div>
              </div>
            </DashboardCard>
          </div>
        </>
      )}
    </section>
  );
}
