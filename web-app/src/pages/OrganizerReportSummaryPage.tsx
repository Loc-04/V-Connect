import { Download, Share2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { EmptyLoadingErrorState } from '../components/feedback';
import { Badge, Button, Card } from '../components/ui';
import { FeedbackOverviewCard } from '../components/reports/FeedbackOverviewCard';
import { IssueHighlightsCard } from '../components/reports/IssueHighlightsCard';
import { ParticipationCountCard } from '../components/reports/ParticipationCountCard';
import { ReportSummaryHeroCard } from '../components/reports/ReportSummaryHeroCard';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { getOrganizerReportSummary } from '../lib/reports';
import type { OrganizerReportSummaryData } from '../lib/organizerReportSummary';
import './OrganizerReportSummaryPage.css';

function matchesSearch(searchTerm: string, value: string) {
  return value.toLowerCase().includes(searchTerm.toLowerCase());
}

export function OrganizerReportSummaryPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<OrganizerReportSummaryData | null>(null);

  const loadReport = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      setReport(null);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getOrganizerReportSummary(session.access_token);
      setReport(response.report);
    } catch (loadError) {
      setReport(null);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load report analytics.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('org-report-printing');
    };

    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('org-report-printing');
    };
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const filteredIssues = useMemo(() => {
    if (!report) {
      return [];
    }

    const normalized = searchTerm.trim();
    if (!normalized) {
      return report.issues;
    }

    return report.issues.filter(
      (item) => matchesSearch(normalized, item.title) || matchesSearch(normalized, item.description)
    );
  }, [report, searchTerm]);

  const analyticsFacts = report?.analyticsFacts ?? [];
  const strengths = report?.strengths ?? [];
  const weaknesses = report?.weaknesses ?? [];
  const issueHighlights = report?.issueHighlights ?? [];

  const handleExportPdf = () => {
    setError(null);
    document.body.classList.add('org-report-printing');
    window.print();
  };

  const handleShareReport = async () => {
    const sharePayload = {
      title: 'V-Connect Report Summary',
      text: `Report Summary - ${report?.activityTitle ?? 'Organizer activity'}`,
      url: window.location.href,
    };

    try {
      setError(null);

      if (navigator.share) {
        await navigator.share(sharePayload);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sharePayload.url);
      } else {
        throw new Error('Sharing is not supported in this browser.');
      }

      setMessage('Report link is ready to share.');
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === 'AbortError') {
        return;
      }
      setMessage(null);
      setError(shareError instanceof Error ? shareError.message : 'Unable to share the report right now.');
    }
  };

  return (
    <OrganizerShell
      activeNav="reports"
      headerActions={
        <>
          <Button onClick={handleExportPdf} type="button" variant="secondary">
            <Download size={15} />
            <span>Export PDF</span>
          </Button>
          <Button onClick={() => void handleShareReport()} type="button">
            <Share2 size={15} />
            <span>Share Report</span>
          </Button>
        </>
      }
      onSearchChange={setSearchTerm}
      pageContext={
        <div className="org-report-breadcrumb" aria-label="Breadcrumb">
          <span>Dashboard</span>
          <span>/</span>
          <span>Activity Reports</span>
          <span>/</span>
          <span>Current</span>
        </div>
      }
      pageSubtitle="Current activity performance snapshot for organizers."
      pageTitle="Report Summary"
      searchPlaceholder="Search report issues..."
      searchValue={searchTerm}
    >
      <section className="org-report-page org-report-export-root">
        <header className="org-report-print-header">
          <div>
            <p>V-Connect Management</p>
            <h1>Report Summary</h1>
          </div>
          <div className="org-report-print-meta">
            <span>{report?.activityTitle ?? '--'}</span>
            <strong>{report?.durationValue ?? '--'}</strong>
          </div>
        </header>

        {message && <p className="form-success">{message}</p>}
        {report && error && <p className="form-error">{error}</p>}

        {loading ? (
          <section className="card org-report-lower-card org-report-empty-card">
            <EmptyLoadingErrorState
              description="Pulling the latest participation and feedback insights for this activity report."
              state="loading"
              title="Loading report analytics"
            />
          </section>
        ) : report ? (
          <>
            <div className="org-report-top-grid">
              <ReportSummaryHeroCard
                durationLabel={report.durationLabel}
                durationValue={report.durationValue}
                liveLabel={report.liveLabel}
                metrics={report.miniMetrics}
                summary={report.summary}
                title={report.activityTitle}
              />

              <ParticipationCountCard
                rows={report.participationBreakdown}
                total={report.participationTotal}
                trend={report.participationTrend}
                trendLabel={report.participationTrendLabel}
              />
            </div>

            <div className="org-report-lower-grid">
              <Card as="section" className="org-report-lower-card org-report-facts-card">
                <div className="org-report-card-head">
                  <h3>Analytics Facts</h3>
                  {report.modelVersion ? <small>{report.modelVersion}</small> : null}
                </div>
                {analyticsFacts.length === 0 ? (
                  <p className="muted">No analytics facts available.</p>
                ) : (
                  <div className="org-report-facts-grid">
                    {analyticsFacts.map((fact) => (
                      <div className="org-report-fact-item" key={fact.key}>
                        <span>{fact.label}</span>
                        <strong>{fact.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {issueHighlights.length > 0 && (
                  <div className="org-report-inline-tags">
                    {issueHighlights.map((item) => (
                      <Badge key={item.id} tone={item.priority === 'high' ? 'danger' : 'info'}>
                        {item.label} ({item.count})
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>

              <FeedbackOverviewCard
                ariaLabel="Open feedback review"
                onClick={() => navigate('/feedback')}
                quote={report.feedbackQuote}
                rating={report.feedbackRating}
                sentiments={report.sentimentChips}
              />

              <Card as="section" className="org-report-lower-card org-report-facts-card">
                <div className="org-report-card-head">
                  <h3>Strengths and Weaknesses</h3>
                </div>
                <div className="org-report-strength-grid">
                  <div>
                    <h4>Strengths</h4>
                    {strengths.length > 0 ? (
                      <ul className="org-report-list">
                        {strengths.map((item) => (
                          <li key={`strength-${item}`}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No explicit strengths detected yet.</p>
                    )}
                  </div>
                  <div>
                    <h4>Weaknesses</h4>
                    {weaknesses.length > 0 ? (
                      <ul className="org-report-list">
                        {weaknesses.map((item) => (
                          <li key={`weakness-${item}`}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No explicit weaknesses detected yet.</p>
                    )}
                  </div>
                </div>
              </Card>

              {filteredIssues.length > 0 ? (
                <IssueHighlightsCard issues={filteredIssues} />
              ) : (
                <section className="card org-report-lower-card org-report-empty-card">
                  <div className="org-report-card-head">
                    <h3>Issue Highlights</h3>
                  </div>
                  <EmptyLoadingErrorState
                    description="Try a broader search to see the issue highlights for this report."
                    state="empty"
                    title="No matching issues"
                  />
                </section>
              )}
            </div>
          </>
        ) : (
          <section className="card org-report-lower-card org-report-empty-card">
            <EmptyLoadingErrorState
              action={
                error ? (
                  <Button onClick={() => void loadReport()} type="button" variant="secondary">
                    Retry
                  </Button>
                ) : undefined
              }
              description={error ?? 'No report data is available right now.'}
              state={error ? 'error' : 'empty'}
              title={error ? 'Unable to load report summary' : 'No report data available'}
            />
          </section>
        )}
      </section>
    </OrganizerShell>
  );
}
