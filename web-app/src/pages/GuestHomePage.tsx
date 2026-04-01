import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BrainCircuit, Compass, HeartHandshake, Sparkles } from 'lucide-react';

import { AuthRequiredModal } from '../components/auth/AuthRequiredModal';
import { GuestActivityCard, GuestFooter } from '../components/guest';
import { Badge, Card } from '../components/ui';
import { buildGuestActivityIntentPath, type GuestProtectedAction } from '../lib/guestAuth';
import {
  getGuestDomains,
  getGuestAvailabilityMeta,
  listFeaturedGuestActivities,
  listGuestActivities,
  type GuestActivityRecord,
} from '../lib/guestActivities';
import { GuestShell } from '../layouts/GuestShell';
import './GuestHomePage.css';

const metrics = [
  { value: '250k+', label: 'Volunteers' },
  { value: '15k+', label: 'Opportunities' },
  { value: '1.2M', label: 'Hours Donated' },
  { value: '$45M', label: 'Social Value' },
];

const journey = [
  {
    title: 'Discover Purpose',
    description: 'Browse public opportunities curated around real community needs.',
  },
  {
    title: 'Smart Connection',
    description: 'Create an account only when you are ready to unlock private actions.',
  },
  {
    title: 'Track Impact',
    description: 'After you join, we help surface meaningful progress and stronger fit over time.',
  },
];

const whyCards = [
  { title: 'Verified Signals', description: 'Opportunities are structured for clear expectations and reliable context.' },
  { title: 'Cleaner Search', description: 'Search public opportunities quickly by skill, location, and community domain.' },
  { title: 'Community First', description: 'The platform is built around meaningful contributions, not noisy browsing.' },
  { title: 'Easy Routing', description: 'Guest visitors can explore first and sign in only when they are ready.' },
];

export function GuestHomePage() {
  const navigate = useNavigate();
  const [authPrompt, setAuthPrompt] = useState<{ action: GuestProtectedAction; activity: GuestActivityRecord } | null>(null);
  const featuredActivities = listFeaturedGuestActivities(3);
  const allPublished = listGuestActivities();
  const heroActivity = featuredActivities[0] ?? allPublished[0];
  const domains = getGuestDomains();
  const heroAvailability = heroActivity ? getGuestAvailabilityMeta(heroActivity) : null;

  return (
    <GuestShell activeNav="home">
      <section className="guest-landing-hero">
        <div className="guest-landing-copy">
          <Badge className="guest-landing-pill" tone="info">
            Discover opportunities with confidence
          </Badge>
          <h1>Impact starts with meaningful connections.</h1>
          <p>
            The community needs strong participation right where your unique skills can create value. V-Connect helps you
            explore public opportunities before choosing when to sign in.
          </p>
          <div className="guest-landing-actions">
            <Link className="primary-btn guest-landing-primary" to="/guest/browse">
              Get Started
            </Link>
            <Link className="secondary-btn guest-landing-secondary" to="/guest/browse#featured-opportunities">
              Browse Activities
            </Link>
          </div>
        </div>

        {heroActivity ? (
          <Card as="article" className="guest-landing-spotlight">
            <img alt={heroActivity.title} className="guest-landing-spotlight-image" src={heroActivity.imageUrl} />
            <div className="guest-landing-spotlight-badge">
              <Sparkles size={14} />
              <span>Featured opportunity</span>
            </div>
            <div className="guest-landing-spotlight-copy">
              <strong>{heroActivity.title}</strong>
              <p>
                {heroAvailability?.label ?? 'Published'} - {heroActivity.organization}
              </p>
            </div>
          </Card>
        ) : null}
      </section>

      <section className="guest-landing-metrics" aria-label="Public platform metrics">
        {metrics.map((metric) => (
          <div className="guest-landing-metric" key={metric.label}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </section>

      <Card as="section" className="guest-landing-intelligence">
        <div className="guest-landing-intelligence-copy">
          <p className="guest-section-label">Curation by Intelligence</p>
          <h2>Explore activities with clearer public context.</h2>
          <p>
            Our guest flow helps you discover opportunities through structured public details before you unlock private
            actions like joining, saving, or AI-assisted matching.
          </p>
          <div className="guest-landing-intelligence-points">
            <span>
              <Compass size={15} />
              Skill-aligned discovery
            </span>
            <span>
              <BrainCircuit size={15} />
              Matching signals after sign-in
            </span>
          </div>
        </div>
        <div className="guest-landing-intelligence-visual" aria-hidden="true">
          <div className="guest-landing-intelligence-ring" />
        </div>
      </Card>

      <section className="guest-domain-section" id="domains">
        <div className="guest-section-head">
          <div>
            <p className="guest-section-label">Explore the Domains</p>
            <h2>Find the causes that match your energy.</h2>
          </div>
        </div>
        <div className="guest-domain-grid">
          {domains.map((domain) => (
            <Card as="article" className={`guest-domain-card ${domain.accentClass}`} key={domain.title}>
              <strong>{domain.title}</strong>
              <p>{domain.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="guest-featured-section" id="featured-opportunities">
        <div className="guest-section-head">
          <div>
            <p className="guest-section-label">Featured opportunities</p>
            <h2>Public opportunities you can inspect right now.</h2>
          </div>
          <Link className="guest-section-link" to="/guest/browse">
            View all <ArrowRight size={14} />
          </Link>
        </div>

        <div className="guest-featured-grid">
          {featuredActivities.map((activity) => (
            <GuestActivityCard
              activity={activity}
              key={activity.id}
              onProtectedAction={(action, targetActivity) => {
                setAuthPrompt({ action, activity: targetActivity });
              }}
              onViewDetails={(activityId) => navigate(`/guest/activity/${activityId}`)}
              variant="featured"
            />
          ))}
        </div>
      </section>

      <section className="guest-journey-section" id="journey">
        <div className="guest-journey-flow">
          <div>
            <p className="guest-section-label">The Curation Journey</p>
            <h2>How V-Connect guides public exploration.</h2>
          </div>
          <div className="guest-journey-list">
            {journey.map((item, index) => (
              <Card as="article" className="guest-journey-item" key={item.title}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <Card as="section" className="guest-journey-side-card">
          <div className="guest-journey-side-head">
            <HeartHandshake size={18} />
            <h3>Why V-Connect?</h3>
          </div>
          <div className="guest-journey-side-grid">
            {whyCards.map((item) => (
              <div className="guest-journey-why-card" key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
          <Link className="secondary-btn guest-journey-link" to="/guest/browse">
            Learn about the ecosystem
          </Link>
        </Card>
      </section>

      <GuestFooter />

      <AuthRequiredModal
        action={authPrompt?.action}
        nextPath={authPrompt ? buildGuestActivityIntentPath(authPrompt.activity.id, authPrompt.action) : undefined}
        onClose={() => setAuthPrompt(null)}
        open={Boolean(authPrompt)}
      />
    </GuestShell>
  );
}
