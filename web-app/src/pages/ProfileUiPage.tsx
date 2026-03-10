import './ProfileUiPage.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { getProfileMe, patchProfileMe } from '../lib/profile';
import type { UserRecord } from '../types/domain';
import type { VolunteerAvailability, VolunteerProfile } from '../types/profile';

const fallbackAvatar =
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80';

const skillTones = ['green', 'blue', 'purple', 'orange'] as const;

const menuMain = [
  { label: 'Dashboard', icon: 'DB', to: '/volunteer/home' },
  { label: 'Browse', icon: 'AC', to: '/browse' },
  { label: 'My Profile', icon: 'PR', to: '/volunteer/profile-ui' },
];

const menuRecords = [
  { label: 'Participation History', icon: 'PH', to: '/volunteer/profile-ui#history' },
  { label: 'Certificates', icon: 'CT', to: '/volunteer/profile-ui#certificates' },
];

function parseCsv(input: string): string[] {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function formatMonthYear(value: string | null | undefined): string {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function buildAvailabilityNote(availability: VolunteerAvailability): string {
  const parts: string[] = [];
  if (availability.weekdays) {
    parts.push('weekdays');
  }
  if (availability.weekends) {
    parts.push('weekends');
  }
  if (availability.evenings) {
    parts.push('evenings');
  }

  if (parts.length === 0) {
    return 'No availability set yet.';
  }

  return `Preferred: ${parts.join(', ')}.`;
}

function computeWeekBars(availability: VolunteerAvailability) {
  const base = 20;
  const weekday = availability.weekdays ? 60 : base;
  const weekend = availability.weekends ? 75 : base;

  const heights = [weekday, weekday, weekday, weekday, weekday, weekend, weekend];
  const active = new Set<number>();

  if (availability.weekdays) {
    for (let i = 0; i < 5; i += 1) {
      active.add(i);
    }
  }

  if (availability.weekends) {
    active.add(5);
    active.add(6);
  }

  return heights.map((height, idx) => ({
    height,
    active: active.has(idx),
  }));
}

interface EditFormState {
  fullName: string;
  phone: string;
  avatarUrl: string;
  skillsCsv: string;
  interestsCsv: string;
  availability: VolunteerAvailability;
}

function toEditForm(profile: UserRecord | null, volunteerProfile: VolunteerProfile | null): EditFormState {
  return {
    fullName: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    avatarUrl: profile?.avatar_url ?? '',
    skillsCsv: (volunteerProfile?.skills ?? []).join(', '),
    interestsCsv: (volunteerProfile?.interests ?? []).join(', '),
    availability: volunteerProfile?.availability ?? { weekdays: false, weekends: false, evenings: false },
  };
}

export function ProfileUiPage() {
  const navigate = useNavigate();
  const { session, profile: authProfile, signOut, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserRecord | null>(authProfile);
  const [volunteerProfile, setVolunteerProfile] = useState<VolunteerProfile | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditFormState>(() => toEditForm(authProfile, null));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const accessToken = session?.access_token ?? '';

  const loadProfile = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      setLoadError('No active session token.');
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const response = await getProfileMe(accessToken);
      setProfile(response.profile);
      setVolunteerProfile(response.volunteerProfile);
      setForm(toEditForm(response.profile, response.volunteerProfile));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load profile.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    setProfile(authProfile);
  }, [authProfile]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const availability: VolunteerAvailability = volunteerProfile?.availability ?? {
    weekdays: false,
    weekends: false,
    evenings: false,
  };

  const weekBars = useMemo(
    () => computeWeekBars(availability),
    [availability.evenings, availability.weekdays, availability.weekends]
  );

  const skills = volunteerProfile?.skills ?? [];
  const skillChips = useMemo(
    () =>
      skills.map((name, idx) => ({
        name,
        tone: skillTones[idx % skillTones.length],
        level: 'SKILL',
      })),
    [skills]
  );

  const interests = volunteerProfile?.interests ?? [];

  const displayName = profile?.full_name ?? session?.user?.email ?? 'Volunteer';
  const roleLabel = String(profile?.role ?? 'volunteer');
  const avatarUrl = profile?.avatar_url || fallbackAvatar;

  const memberSince = formatMonthYear(profile?.created_at);
  const totalHours = volunteerProfile?.total_hours ?? 0;

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) {
      setSaveError('No active session token.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveNotice(null);

    try {
      const payload = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        avatarUrl: form.avatarUrl.trim() ? form.avatarUrl.trim() : null,
        skills: parseCsv(form.skillsCsv),
        interests: parseCsv(form.interestsCsv),
        availability: form.availability,
      };

      const updated = await patchProfileMe(payload, accessToken);
      setProfile(updated.profile);
      setVolunteerProfile(updated.volunteerProfile);
      setSaveNotice('Saved.');
      setEditing(false);

      // Keep AuthContext profile in sync (used by other pages + guards).
      await refreshProfile();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save profile.';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="vol-profile-page">
      <aside className="vol-profile-sidebar">
        <div className="vol-profile-brand">
          <span className="vol-profile-brand-mark" aria-hidden="true" />
          <span className="vol-profile-brand-text">V-Connect</span>
        </div>

        <p className="vol-profile-menu-title">MAIN MENU</p>
        <nav className="vol-profile-menu-list" aria-label="Main menu">
          {menuMain.map((item) => (
            <NavLink
              className={({ isActive }) => `vol-profile-menu-item ${isActive ? 'vol-profile-active' : ''}`}
              key={item.label}
              to={item.to}
            >
              <span className="vol-profile-menu-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <p className="vol-profile-menu-title vol-profile-menu-second">RECORDS</p>
        <nav className="vol-profile-menu-list" aria-label="Records">
          {menuRecords.map((item) => (
            <NavLink className="vol-profile-menu-item" key={item.label} to={item.to}>
              <span className="vol-profile-menu-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="vol-profile-sidebar-footer">
          <button className="vol-profile-menu-item" onClick={() => setEditing(true)} type="button">
            <span className="vol-profile-menu-icon" aria-hidden="true">
              ST
            </span>
            <span>Settings</span>
          </button>
          <button className="vol-profile-menu-item" onClick={() => void handleSignOut()} type="button">
            <span className="vol-profile-menu-icon" aria-hidden="true">
              LO
            </span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <section className="vol-profile-content">
        <header className="vol-profile-topbar">
          <input className="vol-profile-search-box" placeholder="Search opportunities..." />
          <div className="vol-profile-topbar-user">
            <button aria-label="Notifications" className="vol-profile-bell" type="button" />
            <div className="vol-profile-topbar-divider" />
            <div className="vol-profile-user-meta">
              <strong>{displayName}</strong>
              <span>{roleLabel}</span>
            </div>
            <img alt={displayName} className="vol-profile-avatar-mini" src={avatarUrl} />
          </div>
        </header>

        <main className="vol-profile-main-scroll">
          <div className="vol-profile-page-head">
            <div>
              <h1>Profile Overview</h1>
              <p>Manage your volunteer identity, skills, and schedule.</p>
            </div>
            <button className="vol-profile-ai-btn" type="button">
              Get AI Recommendations
            </button>
          </div>

          {loading && (
            <article className="vol-profile-card">
              <p className="muted">Loading profile...</p>
            </article>
          )}

          {loadError && (
            <article className="vol-profile-card">
              <p className="form-error">{loadError}</p>
              <button className="secondary-btn" onClick={() => void loadProfile()} type="button">
                Retry
              </button>
            </article>
          )}

          {!loading && !loadError && (
            <>
              <article className="vol-profile-card vol-profile-hero-card">
                <div className="vol-profile-hero-grid">
                  <div className="vol-profile-avatar-wrap">
                    <img alt={displayName} className="vol-profile-avatar-lg" src={avatarUrl} />
                    <button
                      className="vol-profile-camera-btn"
                      type="button"
                      aria-label="Change avatar"
                      onClick={() => setEditing(true)}
                    >
                      CM
                    </button>
                  </div>

                  <div>
                    <div className="vol-profile-name-row">
                      <h2>{displayName}</h2>
                      <span className="vol-profile-badge vol-profile-badge-volunteer">Volunteer</span>
                      <span className="vol-profile-badge vol-profile-badge-gold">Gold Level</span>
                    </div>
                    <p className="vol-profile-bio">
                      {profile?.phone ? `Phone: ${profile.phone}` : 'Add a phone number to complete your profile.'}
                    </p>

                    <div className="vol-profile-metric-row">
                      <div className="vol-profile-metric-box">
                        <span className="vol-profile-metric-icon vol-profile-metric-icon-green" aria-hidden="true" />
                        <div>
                          <small>Total Impact</small>
                          <strong>{totalHours}+ Hours</strong>
                        </div>
                      </div>
                      <div className="vol-profile-metric-box">
                        <span className="vol-profile-metric-icon vol-profile-metric-icon-blue" aria-hidden="true" />
                        <div>
                          <small>Member Since</small>
                          <strong>{memberSince}</strong>
                        </div>
                      </div>
                      <div className="vol-profile-metric-box">
                        <span className="vol-profile-metric-icon vol-profile-metric-icon-purple" aria-hidden="true" />
                        <div>
                          <small>Reputation</small>
                          <strong>98/100 Score</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="vol-profile-hero-action">
                    <button type="button" onClick={() => setEditing((value) => !value)}>
                      {editing ? 'Close' : 'Edit Profile'}
                    </button>
                  </div>
                </div>
              </article>

              {editing && (
                <article className="vol-profile-card">
                  <div className="vol-profile-card-head">
                    <h3>Edit Profile</h3>
                    <button type="button" aria-label="Close" onClick={() => setEditing(false)}>
                      X
                    </button>
                  </div>

                  {saveError && <p className="form-error">{saveError}</p>}
                  {saveNotice && <p className="form-success">{saveNotice}</p>}

                  <form onSubmit={handleSave}>
                    <label className="field-label" htmlFor="editFullName">
                      Full name
                    </label>
                    <input
                      className="text-input"
                      id="editFullName"
                      onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                      required
                      value={form.fullName}
                    />

                    <label className="field-label" htmlFor="editPhone">
                      Phone
                    </label>
                    <input
                      className="text-input"
                      id="editPhone"
                      onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                      required
                      value={form.phone}
                    />

                    <label className="field-label" htmlFor="editAvatarUrl">
                      Avatar URL (optional)
                    </label>
                    <input
                      className="text-input"
                      id="editAvatarUrl"
                      onChange={(event) => setForm((current) => ({ ...current, avatarUrl: event.target.value }))}
                      placeholder="https://..."
                      value={form.avatarUrl}
                    />

                    <label className="field-label" htmlFor="editSkills">
                      Skills (comma separated)
                    </label>
                    <input
                      className="text-input"
                      id="editSkills"
                      onChange={(event) => setForm((current) => ({ ...current, skillsCsv: event.target.value }))}
                      placeholder="Teaching, First Aid, Gardening"
                      value={form.skillsCsv}
                    />

                    <label className="field-label" htmlFor="editInterests">
                      Interests (comma separated)
                    </label>
                    <input
                      className="text-input"
                      id="editInterests"
                      onChange={(event) => setForm((current) => ({ ...current, interestsCsv: event.target.value }))}
                      placeholder="Disaster Relief, Community Arts"
                      value={form.interestsCsv}
                    />

                    <p className="field-label">Availability</p>
                    <div className="header-actions">
                      <label>
                        <input
                          checked={form.availability.weekdays}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              availability: { ...current.availability, weekdays: event.target.checked },
                            }))
                          }
                          type="checkbox"
                        />{' '}
                        Weekdays
                      </label>
                      <label>
                        <input
                          checked={form.availability.weekends}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              availability: { ...current.availability, weekends: event.target.checked },
                            }))
                          }
                          type="checkbox"
                        />{' '}
                        Weekends
                      </label>
                      <label>
                        <input
                          checked={form.availability.evenings}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              availability: { ...current.availability, evenings: event.target.checked },
                            }))
                          }
                          type="checkbox"
                        />{' '}
                        Evenings
                      </label>
                    </div>

                    <div className="header-actions" style={{ marginTop: '0.75rem' }}>
                      <button className="primary-btn" disabled={saving} type="submit">
                        {saving ? 'Saving...' : 'Save changes'}
                      </button>
                      <button
                        className="secondary-btn"
                        onClick={() => setForm(toEditForm(profile, volunteerProfile))}
                        type="button"
                      >
                        Reset
                      </button>
                    </div>
                  </form>
                </article>
              )}

              <div className="vol-profile-grid-two">
                <article className="vol-profile-card">
                  <div className="vol-profile-card-head">
                    <h3>Skills & Expertise</h3>
                    <button type="button" aria-label="Edit skills" onClick={() => setEditing(true)}>
                      +
                    </button>
                  </div>
                  <div className="vol-profile-chips">
                    {skillChips.length === 0 && <p className="muted">No skills yet.</p>}
                    {skillChips.map((skill) => (
                      <span className={`vol-profile-chip vol-profile-chip-${skill.tone}`} key={skill.name}>
                        <span className="vol-profile-chip-dot" aria-hidden="true" />
                        {skill.name}
                        <em>{skill.level}</em>
                      </span>
                    ))}
                  </div>
                </article>

                <article className="vol-profile-card vol-profile-availability-card">
                  <div className="vol-profile-card-head">
                    <h3>Availability</h3>
                    <button type="button" aria-label="Edit availability" onClick={() => setEditing(true)}>
                      ED
                    </button>
                  </div>
                  <div className="vol-profile-week-labels">
                    <span>M</span>
                    <span>T</span>
                    <span>W</span>
                    <span>T</span>
                    <span>F</span>
                    <span>S</span>
                    <span>S</span>
                  </div>
                  <div className="vol-profile-bars">
                    {weekBars.map((bar, idx) => (
                      <span className="vol-profile-bar-wrap" key={`${idx}-${bar.height}`}>
                        <span
                          className={`vol-profile-bar ${bar.active ? 'vol-profile-bar-active' : ''}`}
                          style={{ height: `${bar.height}%` }}
                        />
                      </span>
                    ))}
                  </div>
                  <p className="vol-profile-mini-note">{buildAvailabilityNote(availability)}</p>
                </article>
              </div>

              <div className="vol-profile-grid-two">
                <article className="vol-profile-card">
                  <div className="vol-profile-card-head">
                    <h3>Interests & Causes</h3>
                    <button type="button" className="vol-profile-text-link" onClick={() => setEditing(true)}>
                      Manage
                    </button>
                  </div>
                  <div className="vol-profile-chips">
                    {interests.length === 0 && <p className="muted">No interests set.</p>}
                    {interests.map((interest) => (
                      <span className="vol-profile-interest-chip" key={interest}>
                        {interest}
                      </span>
                    ))}
                    <button
                      className="vol-profile-interest-chip vol-profile-interest-add"
                      type="button"
                      onClick={() => setEditing(true)}
                    >
                      + Add Interest
                    </button>
                  </div>
                </article>

                <article className="vol-profile-card vol-profile-upcoming-card">
                  <h3>Upcoming Activity</h3>
                  <div className="vol-profile-upcoming-inner">
                    <span className="vol-profile-upcoming-icon" aria-hidden="true">
                      TR
                    </span>
                    <div>
                      <span className="vol-profile-tag">TOMORROW</span>
                      <h4>Tree Planting Initiative</h4>
                      <p>09:00 AM - 12:00 PM</p>
                    </div>
                  </div>
                </article>
              </div>

              <article className="vol-profile-card" id="history">
                <div className="vol-profile-card-head">
                  <h3>Participation History</h3>
                  <button className="vol-profile-text-link" type="button">
                    View All
                  </button>
                </div>
                <div className="vol-profile-history-item">
                  <div>
                    <h4>City Park Clean-up Drive</h4>
                    <p>Led a team of 5 volunteers for waste segregation and collection.</p>
                  </div>
                  <div className="vol-profile-history-meta">
                    <span>OCT 24, 2023</span>
                    <strong>+4 Hours</strong>
                  </div>
                </div>
              </article>

              <article className="vol-profile-card" id="certificates">
                <div className="vol-profile-card-head">
                  <h3>Certificates</h3>
                </div>
                <p className="muted">Coming soon.</p>
              </article>
            </>
          )}
        </main>
      </section>
    </div>
  );
}

