import { Card } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';

export function OrganizerDashboardPage() {
  return (
    <OrganizerShell
      activeNav="dashboard"
      pageSubtitle="Organizer dashboard design is not finalized yet."
      pageTitle="Organizer Dashboard"
    >
      <Card as="section" className="org-dashboard-placeholder">
        <p className="muted">Dashboard placeholder. Activity and registration modules are available from the sidebar.</p>
      </Card>
    </OrganizerShell>
  );
}
