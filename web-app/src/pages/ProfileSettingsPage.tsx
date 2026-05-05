import './ProfileShared.css';

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
import {
  buildAvailabilityRows,
  fallbackAvailabilityDays,
  fallbackAvailabilityRows,
  isQuickAvailabilitySelected,
  normalizeAvailableChoices,
  quickAvailabilityOptions,
  toAvailabilityChoice,
  toggleQuickAvailabilitySelection,
} from '../lib/availability';
import { getAvailabilitySlots, getProfileMe, getSkillsAvailability, putSkillsAvailability } from '../lib/profile';
import type { UserRecord } from '../types/domain';
import type {
  AvailabilityGridDay,
  AvailabilityGridRow,
  SkillsAvailabilityRecord,
  VolunteerProfile,
} from '../types/profile';

const fallbackAvatar =
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80';

function buildVolunteerProfileFromSkillsAvailability(
  userId: string,
  current: VolunteerProfile | null,
  next: SkillsAvailabilityRecord
): VolunteerProfile {
  return {
    user_id: next.userId || current?.user_id || userId,
    skills: next.skills,
    interests: next.interests,
    availableChoices: normalizeAvailableChoices(next.availableChoices),
    total_hours: current?.total_hours ?? null,
    updated_at: next.updatedAt,
  };
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

function getAvailabilityHint(key: string): string {
  if (key === 'mor') {
    return '8 AM - 12 PM';
  }
  if (key === 'aft') {
    return '12 PM - 5 PM';
  }
  if (key === 'eve') {
    return '5 PM - 9 PM';
  }
  return 'Recurring window';
}

function isWeekendDay(dayKey: string): boolean {
  return dayKey === 'sat' || dayKey === 'sun';
}

function getCompletionPercent(skillsCount: number, interestsCount: number, availableChoices: string[]): number {
  const score =
    (skillsCount > 0 ? 35 : 0) +
    (interestsCount > 0 ? 35 : 0) +
    (availableChoices.length > 0 ? 30 : 0);

  return Math.max(10, score);
}

export function ProfileSettingsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserRecord | null>(null);
  const [volunteerProfile, setVolunteerProfile] = useState<VolunteerProfile | null>(null);
  const [availabilityDays, setAvailabilityDays] = useState<AvailabilityGridDay[]>(fallbackAvailabilityDays);
  const [availabilityRowsMeta, setAvailabilityRowsMeta] = useState<AvailabilityGridRow[]>(fallbackAvailabilityRows);
  const [availableChoicesForm, setAvailableChoicesForm] = useState<string[]>([]);

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
      const [profileResponse, skillsAvailabilityResponse, availabilitySlotsResponse] = await Promise.all([
        getProfileMe(accessToken),
        getSkillsAvailability(accessToken).catch(() => null),
        getAvailabilitySlots(accessToken).catch(() => null),
      ]);

      setProfile(profileResponse.profile);

      const nextVolunteerProfile = skillsAvailabilityResponse?.skillsAvailability
        ? buildVolunteerProfileFromSkillsAvailability(
            profileResponse.profile?.id ?? session?.user?.id ?? '',
            profileResponse.volunteerProfile,
            skillsAvailabilityResponse.skillsAvailability
          )
        : profileResponse.volunteerProfile;

      setVolunteerProfile(nextVolunteerProfile);
      setAvailableChoicesForm(
        normalizeAvailableChoices(
          skillsAvailabilityResponse?.skillsAvailability.availableChoices ?? nextVolunteerProfile?.availableChoices
        )
      );

      if (availabilitySlotsResponse?.availabilityGrid?.days?.length) {
        setAvailabilityDays(availabilitySlotsResponse.availabilityGrid.days);
      } else {
        setAvailabilityDays(fallbackAvailabilityDays);
      }

      if (availabilitySlotsResponse?.availabilityGrid?.rows?.length) {
        setAvailabilityRowsMeta(availabilitySlotsResponse.availabilityGrid.rows);
      } else {
        setAvailabilityRowsMeta(fallbackAvailabilityRows);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load profile settings.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, session?.user?.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handlePersistSkills = async (nextSkills: string[]) => {
    if (!accessToken) {
      throw new Error('No active session token.');
    }

    const updated = await putSkillsAvailability({ skills: nextSkills }, accessToken);
    setVolunteerProfile((current) =>
      buildVolunteerProfileFromSkillsAvailability(profile?.id ?? session?.user?.id ?? '', current, updated.skillsAvailability)
    );
  };

  const handlePersistInterests = async (nextInterests: string[]) => {
    if (!accessToken) {
      throw new Error('No active session token.');
    }

    const updated = await putSkillsAvailability({ interests: nextInterests }, accessToken);
    setVolunteerProfile((current) =>
      buildVolunteerProfileFromSkillsAvailability(profile?.id ?? session?.user?.id ?? '', current, updated.skillsAvailability)
    );
  };

  const handleAvailabilityToggle = (dayKey: string, rowKey: string) => {
    const choice = toAvailabilityChoice(dayKey, rowKey);
    setAvailableChoicesForm((current) => {
      const normalized = normalizeAvailableChoices(current);
      if (normalized.includes(choice)) {
        return normalized.filter((item) => item !== choice);
      }
      return normalizeAvailableChoices([...normalized, choice]);
    });
  };

  const handleQuickAvailabilityToggle = (quickChoice: 'weekdays' | 'weekends' | 'evenings') => {
    setAvailableChoicesForm((current) => toggleQuickAvailabilitySelection(current, quickChoice, availabilityDays));
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
      const updated = await putSkillsAvailability({ availableChoices: availableChoicesForm }, accessToken);
      setVolunteerProfile((current) =>
        buildVolunteerProfileFromSkillsAvailability(profile?.id ?? session?.user?.id ?? '', current, updated.skillsAvailability)
      );
      setAvailableChoicesForm(normalizeAvailableChoices(updated.skillsAvailability.availableChoices));
      setSaveNotice(updated.message ?? 'Availability updated successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save availability.';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const resetAvailability = () => {
    setAvailableChoicesForm(normalizeAvailableChoices(volunteerProfile?.availableChoices));
    setSaveError(null);
    setSaveNotice(null);
  };

  const skills = volunteerProfile?.skills ?? [];
  const interests = volunteerProfile?.interests ?? [];
  const availabilityRows = useMemo(
    () =>
      buildAvailabilityRows(availableChoicesForm, availabilityDays, availabilityRowsMeta).map((row) => ({
        ...row,
        hint: getAvailabilityHint(row.key),
      })),
    [availabilityDays, availabilityRowsMeta, availableChoicesForm]
  );
  const quickAvailabilityState = useMemo(
    () =>
      quickAvailabilityOptions.map((option) => ({
        ...option,
        selected: isQuickAvailabilitySelected(availableChoicesForm, option.key, availabilityDays),
      })),
    [availabilityDays, availableChoicesForm]
  );

  const displayName = profile?.full_name?.trim() || session?.user?.email || 'Volunteer';
  const avatarUrl = profile?.avatar_url || fallbackAvatar;
  const memberSince = formatMonthYear(profile?.created_at);
  const completionPercent = getCompletionPercent(skills.length, interests.length, availableChoicesForm);

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
          <div className="vol-profile-content-grid vol-profile-settings-layout">
            <div className="vol-profile-main-column vol-profile-settings-summary-column">
              <Card as="article" className="vol-profile-card vol-profile-settings-summary-card">
                <div className="vol-profile-section-head">
                  <div className="vol-profile-section-title">
                    <span className="vol-profile-section-icon" aria-hidden="true">
                      <UserRound size={16} />
                    </span>
                    <div className="vol-profile-section-title-block">
                      <h3>Preferences Summary</h3>
                      <p className="vol-profile-section-subtitle">
                        Review how your profile is presented before editing your volunteer preferences.
                      </p>
                    </div>
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

            </div>

            <div className="vol-profile-side-column vol-profile-settings-editor-column">
              <ProfileSkillsCard onPersist={handlePersistSkills} skills={skills} userId={profile?.id ?? null} />

              <ProfileInterestsCard interests={interests} onPersist={handlePersistInterests} />

              <ProfileSectionCard
                className="vol-profile-settings-availability-card"
                icon={CalendarDays}
                subtitle="Choose the recurring windows you can usually commit to. The weekly guide below visualizes those saved preferences."
                title="Weekly Availability"
              >
                {saveError && <p className="form-error">{saveError}</p>}
                {saveNotice && <p className="form-success">{saveNotice}</p>}

                <form className="vol-profile-edit-form vol-profile-settings-availability-form" onSubmit={handleSaveAvailability}>
                  <div className="vol-profile-settings-toggle-grid">
                    {quickAvailabilityState.map((option) => (
                      <button
                        className={[
                          'vol-profile-settings-toggle-card',
                          option.selected ? 'is-selected' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        key={option.key}
                        onClick={() => handleQuickAvailabilityToggle(option.key)}
                        type="button"
                      >
                        <strong>{option.label}</strong>
                        <p>{option.description}</p>
                      </button>
                    ))}
                  </div>

                  <div className="vol-profile-settings-grid-shell">
                    <div className="vol-profile-slot-grid vol-profile-settings-slot-grid">
                      <div className="vol-profile-slot-grid-head">
                        <span />
                        {availabilityDays.map((day) => (
                          <span className={isWeekendDay(day.key) ? 'is-weekend' : ''} key={day.key}>
                            {day.label}
                          </span>
                        ))}
                      </div>

                      {availabilityRows.map((row) => (
                        <div className="vol-profile-slot-grid-row" key={row.label}>
                          <div className="vol-profile-slot-row-label">
                            <strong>{row.label}</strong>
                            <small>{row.hint}</small>
                          </div>
                          {row.cells.map((active, index) => (
                            <button
                              aria-label={`${row.label} on ${availabilityDays[index].label} ${active ? 'available' : 'unavailable'}`}
                              className={[
                                'vol-profile-slot-chip',
                                active ? 'is-active' : '',
                                isWeekendDay(availabilityDays[index].key) ? 'is-weekend' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              key={`${row.label}-${availabilityDays[index].key}`}
                              onClick={() => handleAvailabilityToggle(availabilityDays[index].key, row.key)}
                              title={`${availabilityDays[index].label} ${row.label}: ${active ? 'Available' : 'Unavailable'}`}
                              type="button"
                            >
                              {active ? '✓' : ''}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="vol-profile-settings-availability-note">
                    <strong>Availability matching guide</strong>
                    <p>
                      Quick choices add common slot groups in one click. You can still fine-tune any single day and
                      session below. Each saved slot is stored as a `day_session` value such as `mon_mor` or `fri_eve`.
                    </p>
                  </div>

                  <div className="vol-profile-form-actions vol-profile-settings-form-actions">
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
