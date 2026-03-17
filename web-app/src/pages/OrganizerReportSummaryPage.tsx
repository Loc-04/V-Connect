import { Download, Share2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '../components/ui';
import { FeedbackOverviewCard } from '../components/reports/FeedbackOverviewCard';
import { IssueHighlightsCard } from '../components/reports/IssueHighlightsCard';
import { ParticipationCountCard } from '../components/reports/ParticipationCountCard';
import { ReportSummaryHeroCard } from '../components/reports/ReportSummaryHeroCard';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { organizerReportSummaryMock } from '../lib/organizerReportSummary';
import './OrganizerReportSummaryPage.css';

function matchesSearch(searchTerm: string, value: string) {
  return value.toLowerCase().includes(searchTerm.toLowerCase());
}

export function OrganizerReportSummaryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const filteredIssues = useMemo(() => {
    const normalized = searchTerm.trim();
    if (!normalized) {
      return organizerReportSummaryMock.issues;
    }

    return organizerReportSummaryMock.issues.filter(
      (item) => matchesSearch(normalized, item.title) || matchesSearch(normalized, item.description)
    );
  }, [searchTerm]);

  const handleExportPdf = () => {
    setError(null);
    document.body.classList.add('org-report-printing');
    window.print();
  };

  const handleShareReport = async () => {
    const sharePayload = {
      title: 'V-Connect Report Summary',
      text: `Report Summary - ${organizerReportSummaryMock.activityTitle}`,
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
            <span>{organizerReportSummaryMock.activityTitle}</span>
            <strong>{organizerReportSummaryMock.durationValue}</strong>
          </div>
        </header>

        {message && <p className="form-success">{message}</p>}
        {error && <p className="form-error">{error}</p>}

        <div className="org-report-top-grid">
          <ReportSummaryHeroCard
            durationLabel={organizerReportSummaryMock.durationLabel}
            durationValue={organizerReportSummaryMock.durationValue}
            liveLabel={organizerReportSummaryMock.liveLabel}
            metrics={organizerReportSummaryMock.miniMetrics}
            summary={organizerReportSummaryMock.summary}
            title={organizerReportSummaryMock.activityTitle}
          />

          <ParticipationCountCard
            rows={organizerReportSummaryMock.participationBreakdown}
            total={organizerReportSummaryMock.participationTotal}
            trend={organizerReportSummaryMock.participationTrend}
            trendLabel={organizerReportSummaryMock.participationTrendLabel}
          />
        </div>

        <div className="org-report-lower-grid">
          <FeedbackOverviewCard
            quote={organizerReportSummaryMock.feedbackQuote}
            rating={organizerReportSummaryMock.feedbackRating}
            sentiments={organizerReportSummaryMock.sentimentChips}
          />

          {filteredIssues.length > 0 ? (
            <IssueHighlightsCard issues={filteredIssues} />
          ) : (
            <section className="card org-report-lower-card org-report-empty-card">
              <div className="org-report-card-head">
                <h3>Issue Highlights</h3>
              </div>
              <p className="muted">No issue highlights match the current search.</p>
            </section>
          )}
        </div>
      </section>
    </OrganizerShell>
  );
}
