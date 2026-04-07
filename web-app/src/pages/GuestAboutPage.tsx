import { ArrowRight, Bell, ClipboardCheck, LayoutDashboard, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';

import { GuestFooter } from '../components/guest';
import { Badge, Card } from '../components/ui';
import { GuestShell } from '../layouts/GuestShell';
import './GuestAboutPage.css';

const audienceCards = [
  {
    title: 'Volunteer',
    description:
      'Discover opportunities, manage your profile, review participation history, receive notifications, and get recommendation support.',
  },
  {
    title: 'Organizer',
    description:
      'Create activities, review registrations, track attendance, coordinate volunteers, and monitor reports from one workspace.',
  },
  {
    title: 'Admin',
    description:
      'Maintain platform oversight through user management, feedback review, notifications, and dashboard visibility.',
  },
];

const capabilityCards = [
  {
    icon: ClipboardCheck,
    title: 'Activity Management',
    description: 'Structured publishing, registration review, attendance handling, and organizer-side coordination.',
  },
  {
    icon: Sparkles,
    title: 'Recommendations',
    description: 'Recommendation flows help surface stronger volunteer-activity matches from real profile and activity signals.',
  },
  {
    icon: Bell,
    title: 'Notifications',
    description: 'Users receive updates for approvals, registrations, attendance changes, and other workspace events.',
  },
  {
    icon: LayoutDashboard,
    title: 'Dashboards & Reporting',
    description: 'Role-specific dashboards and reports provide a clearer operational view of participation and outcomes.',
  },
];

const workflowSteps = [
  'Browse or publish activities through a structured web workflow instead of fragmented manual coordination.',
  'Use profiles, registrations, recommendations, and notifications to move the right people into the right activities.',
  'Track participation, attendance, and post-activity reporting from the same connected platform.',
];

export function GuestAboutPage() {
  return (
    <GuestShell activeNav="about">
      <section className="guest-about-hero">
        <div className="guest-about-hero-copy">
          <Badge className="guest-about-hero-badge" tone="info">
            About V-Connect
          </Badge>
          <h1>Volunteer management with clearer structure and less friction.</h1>
          <p>
            V-Connect is a web-first volunteer management platform designed to reduce fragmented coordination, improve
            activity discovery, and give volunteers, organizers, and admins a more reliable operating flow.
          </p>
          <div className="guest-about-hero-actions">
            <Link className="primary-btn" to="/guest/browse">
              Browse Activities
            </Link>
            <Link className="secondary-btn" to="/register">
              Sign Up
            </Link>
          </div>
        </div>

        <Card as="article" className="guest-about-problem-card">
          <p className="guest-section-label">Why it exists</p>
          <h2>V-Connect addresses the coordination gap.</h2>
          <p>
            The current proposal frames V-Connect as a response to fragmented volunteer data, manual attendance handling,
            inconsistent activity discovery, and limited visibility into participation outcomes.
          </p>
          <div className="guest-about-problem-points">
            <span>
              <ShieldCheck size={16} />
              Centralized profile and activity flow
            </span>
            <span>
              <UsersRound size={16} />
              Better organizer-volunteer coordination
            </span>
          </div>
        </Card>
      </section>

      <section className="guest-about-section">
        <div className="guest-about-section-head">
          <div>
            <p className="guest-section-label">Platform scope</p>
            <h2>What the current web platform is built to support.</h2>
          </div>
        </div>

        <div className="guest-about-capability-grid">
          {capabilityCards.map(({ icon: Icon, title, description }) => (
            <Card as="article" className="guest-about-capability-card" key={title}>
              <span className="guest-about-capability-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <strong>{title}</strong>
              <p>{description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="guest-about-section">
        <div className="guest-about-section-head">
          <div>
            <p className="guest-section-label">Who uses it</p>
            <h2>Three roles, one shared operational backbone.</h2>
          </div>
        </div>

        <div className="guest-about-audience-grid">
          {audienceCards.map((card) => (
            <Card as="article" className="guest-about-audience-card" key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="guest-about-section">
        <Card as="article" className="guest-about-workflow-card">
          <div className="guest-about-workflow-copy">
            <p className="guest-section-label">How it works</p>
            <h2>A simple loop from discovery to follow-up.</h2>
          </div>

          <div className="guest-about-workflow-list">
            {workflowSteps.map((step, index) => (
              <div className="guest-about-workflow-item" key={step}>
                <span>{index + 1}</span>
                <p>{step}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card as="section" className="guest-about-cta-card">
        <div>
          <p className="guest-section-label">Get started</p>
          <h2>Browse first, then sign in when you are ready to act.</h2>
          <p>
            Guest users remain read-only on the public flow. Actions such as joining, saving, or AI-assisted matching
            are unlocked after authentication.
          </p>
        </div>

        <div className="guest-about-cta-actions">
          <Link className="primary-btn" to="/guest/browse">
            Browse Activities
          </Link>
          <Link className="secondary-btn" to="/login">
            Log In
          </Link>
          <Link className="guest-about-cta-link" to="/register">
            Sign Up <ArrowRight size={15} />
          </Link>
        </div>
      </Card>

      <GuestFooter />
    </GuestShell>
  );
}
