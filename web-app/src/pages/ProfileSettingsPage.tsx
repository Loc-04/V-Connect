import './ProfileUiPage.css';

import { CalendarDays, Heart, Save, Sparkles, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { ProfileSectionCard } from '../components/profile/ProfileSectionCard';
import { ProfileInterestsCard } from '../components/profile/ProfileInterestsCard';
import { ProfileSkillsCard } from '../components/profile/ProfileSkillsCard';
import { Button, Card } from '../components/ui';
import { VolunteerShell } from '../layouts/VolunteerShell';
import { getProfileMe, patchProfileMe } from '../lib/profile';
import type { UserRecord } from '../types/domain';
import type { VolunteerAvailability, VolunteerProfile } from '../types/profile';

const fallbackAvatar =
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80';
const availabilityDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type AvailabilityKey = keyof VolunteerAvailability;

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

function buildAvailabilityGridRows(availability: VolunteerAvailability) {
  const baseDayAvailability = availabilityDays.map((_, index) => (index < 5 ? availability.weekdays : availability.weekends));
  const eveningAvailability = baseDayAvailability.map((active, index) => {
    if (!availability.evenings) {
      return false;
    }

    if (active) {
      return true;
    }

    return !availability.weekdays && !availability.weekends && (index === 4 || index === 5);
  });

  return [
    {
      label: 'Morning',
      cells: baseDayAvailability,
    },
    {
      label: 'Afternoon',
      cells: baseDayAvailability,
    },
    {
      label: 'Evening',
      cells: eveningAvailability,
    },
  ];
}

function buildAvailabilitySummary(availability: VolunteerAvailability): string {
  if (availability.weekdays && availability.weekends && availability.evenings) {
    return 'You are available on weekdays, weekends, and evenings.';
  }

  if (availability.weekdays && availability.weekends) {
    return 'You are available across weekdays and weekends.';
  }

  if (availability.weekdays && availability.evenings) {
    return 'You prefer weekdays and evening shifts.';
  }

  if (availability.weekends && availability.evenings) {
    return 'You prefer weekend and evening shifts.';
  }

  if (availability.weekdays) {
    return 'You are available on weekdays.';
  }

  if (availability.weekends) {
    return 'You are available on weekends.';
  }

  if (availability.evenings) {
    return 'You are mainly available in the evenings.';
  }

  return 'Set your weekly schedule to help organizers assign suitable activities.';
}

function normalizeAvailability(availability: VolunteerAvailability | null | undefined): VolunteerAvailability {
  return {
    weekdays: availability?.weekdays ?? false,
    weekends: availability?.weekends ?? false,
    evenings: availability?.evenings ?? false,
  };
}

function getCompletionPercent(skillsCount: number, interestsCount: number, availability: VolunteerAvailability): number {
  const score =
    (skillsCount > 0 ? 35 : 0) +
    (interestsCount > 0 ? 35 : 0) +
    ((availability.weekdays || availability.weekends || availability.evenings) ? 30 : 0);

  return Math.max(10, score);
}

export function ProfileSettingsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserRecord | null>(null);
  const [volunteerProfile, setVolunteerProfile] = useState<VolunteerProfile | null>(null);
  const [availabilityForm, setAvailabilityForm] = useState<VolunteerAvailability>({
    weekdays: false,
    weekends: false,
    evenings: false,
  });

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
      setAvailabilityForm(normalizeAvailability(response.volunteerProfile?.availability));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load profile settings.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handlePersistSkills = async (nextSkills: string[]) => {
    if (!accessToken) {
      throw new Error('No active session token.');
    }

    const updated = await patchProfileMe({ skills: nextSkills }, accessToken);
    setVolunteerProfile(updated.volunteerProfile);
  };

  const handlePersistInterests = async (nextInterests: string[]) => {
    if (!accessToken) {
      throw new Error('No active session token.');
    }

    const updated = await patchProfileMe({ interests: nextInterests }, accessToken);
    setVolunteerProfile(updated.volunteerProfile);
  };

  const handleAvailabilityToggle = (key: AvailabilityKey) => {
    setAvailabilityForm((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleSaveAvailability = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setSaveError('No active session token.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveNotice(null);

    try {
      const updated = await patchProfileMe({ availability: availabilityForm }, accessToken);
      setVolunteerProfile(updated.volunteerProfile);
      setAvailabilityForm(normalizeAvailability(updated.volunteerProfile?.availability));
      setSaveNotice('Availability updated successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save availability.';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const resetAvailability = () => {
    setAvailabilityForm(normalizeAvailability(volunteerProfile?.availability));
    setSaveError(null);
    setSaveNotice(null);
  };

  const skills = volunteerProfile?.skills ?? [];
  const interests = volunteerProfile?.interests ?? [];
  const availabilityRows = useMemo(() => buildAvailabilityGridRows(availabilityForm), [availabilityForm]);

  const displayName = profile?.full_name?.trim() || session?.user?.email || 'Volunteer';
  const avatarUrl = profile?.avatar_url || fallbackAvatar;
  const memberSince = formatMonthYear(profile?.created_at);
  const completionPercent = getCompletionPercent(skills.length, interests.length, availabilityForm);

  return (
    <VolunteerShell
      activeNav="settings"
      pageEyebrow="Account Preferences"
      headerActions={
        <div className="vol-profile-page-actions">
          <Button onClick={() => navigate('/volunteer/profile-ui')} type="button" variant="secondary">
            <X size={14} />
            <span>Back to Profile</span>
          </Button>
        </div>
      }
      pageSubtitle="Edit your skills, interests, and weekly availability in one place."
      pageTitle="Skills & Availability Settings"
    >
      <section className="vol-profile-dashboard">
        {loading && (
          <Card as="article" className="vol-profile-card">
            <p className="muted">Loading settings...</p>
          </Card>
        )}

        {loadError && (
          <Card as="article" className="vol-profile-card vol-profile-feedback-card">
            <p className="form-error">{loadError}</p>
            <Button onClick={() => void loadProfile()} type="button" variant="secondary">
              Retry
            </Button>
          </Card>
        )}

        {!loading && !loadError && (
          <div className="vol-profile-content-grid">
            <div className="vol-profile-main-column">
              <Card as="article" className="vol-profile-card">
                <div className="vol-profile-section-head">
                  <div className="vol-profile-section-title">
                    <span className="vol-profile-section-icon" aria-hidden="true">
                      <UserRound size={16} />
                    </span>
                    <h3>Preferences Summary</h3>
                  </div>
                </div>

                <div className="vol-profile-section-content">
                  <div className="vol-profile-hero-grid">
                    <div className="vol-profile-avatar-wrap">
                      <img alt={displayName} className="vol-profile-avatar-lg" src={avatarUrl} />
                    </div>

                    <div className="vol-profile-hero-copy">
                      <div className="vol-profile-name-row">
                        <h2>{displayName}</h2>
                        <span className="vol-profile-badge vol-profile-badge-volunteer">Volunteer</span>
                      </div>

                      <p className="vol-profile-bio">{`Member since ${memberSince}. Keep your preferences updated to improve activity matching quality.`}</p>

                      <div className="vol-profile-metric-row">
                        <article className="vol-profile-metric-box">
                          <span className="vol-profile-metric-icon vol-profile-metric-icon-purple" aria-hidden="true">
                            <Sparkles size={18} />
                          </span>
                          <div>
                            <small>Skills</small>
                            <strong>{skills.length}</strong>
                          </div>
                        </article>

                        <article className="vol-profile-metric-box">
                          <span className="vol-profile-metric-icon vol-profile-metric-icon-green" aria-hidden="true">
                            <Heart size={18} />
                          </span>
                          <div>
                            <small>Interests</small>
                            <strong>{interests.length}</strong>
                          </div>
                        </article>

                        <article className="vol-profile-metric-box">
                          <span className="vol-profile-metric-icon vol-profile-metric-icon-blue" aria-hidden="true">
                            <CalendarDays size={18} />
                          </span>
                          <div>
                            <small>Profile Completion</small>
                            <strong>{`${completionPercent}%`}</strong>
                          </div>
                        </article>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <ProfileSkillsCard onPersist={handlePersistSkills} skills={skills} userId={profile?.id ?? null} />

              <ProfileInterestsCard interests={interests} onPersist={handlePersistInterests} />
            </div>

            <div className="vol-profile-side-column">
              <ProfileSectionCard icon={CalendarDays} title="Weekly Availability">
                {saveError && <p className="form-error">{saveError}</p>}
                {saveNotice && <p className="form-success">{saveNotice}</p>}

                <form className="vol-profile-edit-form" onSubmit={handleSaveAvailability}>
                  <div>
                    <p className="field-label">Availability</p>
                    <div className="vol-profile-toggle-row">
                      <label className="vol-profile-toggle">
                        <input
                          checked={availabilityForm.weekdays}
                          onChange={() => handleAvailabilityToggle('weekdays')}
                          type="checkbox"
                        />
                        <span>Weekdays</span>
                      </label>

                      <label className="vol-profile-toggle">
                        <input
                          checked={availabilityForm.weekends}
                          onChange={() => handleAvailabilityToggle('weekends')}
                          type="checkbox"
                        />
                        <span>Weekends</span>
                      </label>

                      <label className="vol-profile-toggle">
                        <input
                          checked={availabilityForm.evenings}
                          onChange={() => handleAvailabilityToggle('evenings')}
                          type="checkbox"
                        />
                        <span>Evenings</span>
                      </label>
                    </div>
                  </div>

                  <div className="vol-profile-slot-grid">
                    <div className="vol-profile-slot-grid-head">
                      <span />
                      {availabilityDays.map((day) => (
                        <span key={day}>{day}</span>
                      ))}
                    </div>

                    {availabilityRows.map((row) => (
                      <div className="vol-profile-slot-grid-row" key={row.label}>
                        <strong>{row.label}</strong>
                        {row.cells.map((active, index) => (
                          <span
                            className={active ? 'vol-profile-slot-chip is-active' : 'vol-profile-slot-chip'}
                            key={`${row.label}-${availabilityDays[index]}`}
                          >
                            {active ? 'Yes' : 'No'}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>

                  <p className="vol-profile-slot-note">
                    Detailed time slots are visual guidance only. Saved availability currently supports weekdays,
                    weekends, and evenings.
                  </p>
                  <p className="vol-profile-mini-note">{buildAvailabilitySummary(availabilityForm)}</p>

                  <div className="vol-profile-form-actions">
                    <Button disabled={saving} type="submit">
                      <Save size={14} />
                      <span>{saving ? 'Saving...' : 'Save Availability'}</span>
                    </Button>
                    <Button onClick={resetAvailability} type="button" variant="secondary">
                      Reset
                    </Button>
                  </div>
                </form>
              </ProfileSectionCard>
            </div>
          </div>
        )}
      </section>
    </VolunteerShell>
  );
}
