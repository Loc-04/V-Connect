import { Link } from 'react-router-dom';
import { Compass, Lock, ShieldCheck } from 'lucide-react';

import { Card } from '../components/ui';
import { GuestShell } from '../layouts/GuestShell';
import { listGuestActivities } from '../lib/guestActivities';
import './GuestHomePage.css';

export function GuestHomePage() {
  const activities = listGuestActivities();
  const publishedCount = activities.filter((activity) => activity.status === 'published').length;

  return (
    <GuestShell
      activeNav="home"
      pageSubtitle="Start exploring opportunities that match your interests."
      pageTitle="Discover meaningful volunteer opportunities"
    >
      <section className="guest-home-grid">
        <Card as="section" className="guest-home-hero">
          <p className="guest-home-eyebrow">Continue as Guest</p>
          <h2>Explore Volunteer Activities</h2>
          <p>Browse activity details in read-only mode now, then sign in when you are ready to join.</p>
          <div className="header-actions">
            <Link className="primary-btn" to="/guest/browse">
              Explore Volunteer Activities
            </Link>
            <Link className="secondary-btn" to="/login">
              Sign In
            </Link>
            <Link className="secondary-btn" to="/register">
              Sign Up
            </Link>
          </div>
        </Card>

        <div className="guest-home-metric-grid">
          <Card as="article" className="guest-home-metric-card">
            <Compass size={18} />
            <strong>{publishedCount}</strong>
            <p>Published activities to explore</p>
          </Card>
          <Card as="article" className="guest-home-metric-card">
            <ShieldCheck size={18} />
            <strong>Read-only</strong>
            <p>You can browse details before creating an account</p>
          </Card>
          <Card as="article" className="guest-home-metric-card">
            <Lock size={18} />
            <strong>Account required</strong>
            <p>Private actions prompt Sign In or Sign Up</p>
          </Card>
        </div>
      </section>
    </GuestShell>
  );
}
