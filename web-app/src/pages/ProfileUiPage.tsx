import './ProfileUiPage.css';

import {
  CalendarDays,
  Camera,
  Clock3,
  Leaf,
  Medal,
  Pencil,
  Sparkles,
  Trees,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { ProfileEmptyState, ProfileSectionCard } from '../components/profile/ProfileSectionCard';
import { ProfileInterestsCard } from '../components/profile/ProfileInterestsCard';
import { ProfileSkillsCard } from '../components/profile/ProfileSkillsCard';
import { Button, Card, Input } from '../components/ui';
import { VolunteerShell } from '../layouts/VolunteerShell';
import { listParticipations } from '../lib/participations';
import { getProfileMe, patchProfileMe } from '../lib/profile';
import type { UserRecord } from '../types/domain';
import type { ParticipationRecord } from '../types/participation';
import type { VolunteerAvailability, VolunteerProfile } from '../types/profile';

const fallbackAvatar =
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80';

const availabilityLabels = ['Weekdays', 'Weekends', 'Evenings'] as const;

type EditorPanel = 'profile' | 'availability';

interface AvatarFeedback {
  tone: 'error' | 'success';
  message: string;
}

interface EditFormState {
  fullName: string;
  phone: string;
  avatarUrl: string;
  availability: VolunteerAvailability;
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

function formatShortDate(value: string | null | undefined): string {
  if (!value) {
    return 'Date TBD';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date TBD';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function buildActivityBadge(value: string | null | undefined): string {
  if (!value) {
    return 'UPCOMING';
  }

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) {
    return 'UPCOMING';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays <= 0) {
    return 'TODAY';
  }
  if (diffDays === 1) {
    return 'TOMORROW';
  }
  if (diffDays <= 7) {
    return 'THIS WEEK';
  }

  return formatShortDate(value).toUpperCase();
}

function buildAvailabilityNote(availability: VolunteerAvailability): string {
  if (availability.weekends && !availability.weekdays) {
    return 'Your preferred schedule is mainly weekends.';
  }
  if (availability.weekdays && !availability.weekends) {
    return availability.evenings
      ? 'You are most available on weekdays and evenings.'
      : 'Your availability is strongest during weekdays.';
  }
  if (availability.weekdays && availability.weekends) {
    return availability.evenings
      ? 'You are available across weekdays, weekends, and evenings.'
      : 'You are available across weekdays and weekends.';
  }
  if (availability.evenings) {
    return 'Evenings are currently your preferred volunteering window.';
  }
  return 'Set your availability to help coordinators match the right opportunities.';
}

function computeWeekBars(availability: VolunteerAvailability) {
  const baseHeights = [34, 48, 18, 40, 66, 74, 20];

  return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => {
    let height = baseHeights[index];
    let active = false;

    if (availability.weekdays && index < 5) {
      active = true;
      height = [42, 58, 24, 50, 80][index];
    }

    if (availability.weekends && index >= 5) {
      active = true;
      height = index === 5 ? 82 : 84;
    }

    if (availability.evenings && index >= 3 && index <= 5) {
      height = Math.min(88, height + 8);
      active = active || index === 4 || index === 5;
    }

    const label = active && (index === 4 || index === 5) ? (index === 4 ? 'Fri' : 'Sat') : null;

    return {
      day,
      height,
      active,
      label,
    };
  });
}

function toEditForm(profile: UserRecord | null, volunteerProfile: VolunteerProfile | null): EditFormState {
  return {
    fullName: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    avatarUrl: profile?.avatar_url ?? '',
    availability: volunteerProfile?.availability ?? { weekdays: false, weekends: false, evenings: false },
  };
}

function buildProfileSummary(profile: UserRecord | null, volunteerProfile: VolunteerProfile | null): string {
  const skills = volunteerProfile?.skills ?? [];
  const interests = volunteerProfile?.interests ?? [];

  if (skills.length >= 2 && interests.length >= 1) {
    return `Focused on ${interests[0].toLowerCase()} initiatives with strengths in ${skills
      .slice(0, 2)
      .join(' and ')}.`;
  }

  if (interests.length >= 2) {
    return `Passionate about ${interests[0].toLowerCase()} and ${interests[1].toLowerCase()}, always looking for meaningful community impact.`;
  }

  if (skills.length >= 2) {
    return `Community volunteer bringing strong ${skills[0].toLowerCase()} and ${skills[1].toLowerCase()} support to local initiatives.`;
  }

  if (profile?.phone) {
    return `Volunteer profile connected and ready to collaborate. Phone contact: ${profile.phone}.`;
  }

  return 'Dedicated volunteer ready to contribute skills, time, and care to local community initiatives.';
}

function buildReputationScore(totalHours: number, skillCount: number, completedCount: number): number {
  return Math.max(72, Math.min(100, Math.round(76 + totalHours / 5 + skillCount * 2 + completedCount * 1.5)));
}

function getEditorPanelMeta(panel: EditorPanel | null) {
  switch (panel) {
    case 'availability':
      return {
        title: 'Edit Availability',
        description: 'Adjust your weekly schedule so organizers know when you can help.',
      };
    case 'profile':
    default:
      return {
        title: 'Edit Profile',
        description: 'Update the core details shown on your volunteer overview.',
      };
  }
}

export function ProfileUiPage() {
  const navigate = useNavigate();
  const { session, profile: authProfile, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserRecord | null>(authProfile);
  const [volunteerProfile, setVolunteerProfile] = useState<VolunteerProfile | null>(null);
  const [participations, setParticipations] = useState<ParticipationRecord[]>([]);

  const [editorPanel, setEditorPanel] = useState<EditorPanel | null>(null);
  const [form, setForm] = useState<EditFormState>(() => toEditForm(authProfile, null));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarFeedback, setAvatarFeedback] = useState<AvatarFeedback | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const avatarObjectUrlRef = useRef<string | null>(null);

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
    return () => {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!accessToken) {
      setParticipations([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const records = await listParticipations(accessToken, 8);
        if (!cancelled) {
          setParticipations(records);
        }
      } catch {
        if (!cancelled) {
          setParticipations([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const availability: VolunteerAvailability = volunteerProfile?.availability ?? {
    weekdays: false,
    weekends: false,
    evenings: false,
  };

  const weekBars = computeWeekBars(availability);

  const skills = volunteerProfile?.skills ?? [];
  const interests = volunteerProfile?.interests ?? [];
  const totalHours = volunteerProfile?.total_hours ?? 0;
  const memberSince = formatMonthYear(profile?.created_at);
  const hasAvailability = availability.weekdays || availability.weekends || availability.evenings;
  const activeAvailabilityLabels = availabilityLabels.filter((label) => {
    if (label === 'Weekdays') {
      return availability.weekdays;
    }
    if (label === 'Weekends') {
      return availability.weekends;
    }
    return availability.evenings;
  });

  const completedParticipations = useMemo(
    () =>
      [...participations]
        .filter((record) => record.status === 'completed')
        .sort((left, right) => new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime()),
    [participations]
  );

  const upcomingParticipations = useMemo(
    () =>
      [...participations]
        .filter((record) => record.status === 'upcoming')
        .sort((left, right) => new Date(left.date ?? 0).getTime() - new Date(right.date ?? 0).getTime()),
    [participations]
  );

  const participationPreview = completedParticipations.slice(0, 3);
  const upcomingPreview = upcomingParticipations[0] ?? null;

  const reputationScore = buildReputationScore(totalHours, skills.length, completedParticipations.length);
  const volunteerLevel = totalHours >= 120 ? 'Gold Level' : totalHours >= 60 ? 'Silver Level' : 'Growing Level';

  const displayName = profile?.full_name?.trim() || session?.user?.email || 'Volunteer';
  const avatarUrl = avatarPreviewUrl || profile?.avatar_url || fallbackAvatar;
  const profileSummary = buildProfileSummary(profile, volunteerProfile);

  const upcomingTimeLabel = upcomingPreview
    ? upcomingPreview.hours !== null
      ? `${upcomingPreview.hours.toFixed(1)} volunteer hours`
      : 'Schedule to be confirmed'
    : null;
  const editorMeta = getEditorPanelMeta(editorPanel);

  const openEditor = (panel: EditorPanel) => {
    setSaveError(null);
    setSaveNotice(null);
    setEditorPanel(panel);
  };

  const closeEditor = () => {
    setEditorPanel(null);
  };

  const handleAvatarButtonClick = () => {
    setAvatarFeedback(null);
    avatarInputRef.current?.click();
  };

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setAvatarFeedback(null);

    if (!file.type.startsWith('image/')) {
      setAvatarFeedback({
        tone: 'error',
        message: 'Please choose a valid image file for your avatar.',
      });
      return;
    }

    const maxFileSize = 5 * 1024 * 1024;
    if (file.size > maxFileSize) {
      setAvatarFeedback({
        tone: 'error',
        message: 'Avatar image must be smaller than 5 MB.',
      });
      return;
    }

    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    avatarObjectUrlRef.current = nextPreviewUrl;
    setAvatarPreviewUrl(nextPreviewUrl);
    setAvatarFeedback({
      tone: 'success',
      message: 'Avatar preview updated for this session.',
    });
  };

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
        availability: form.availability,
      };

      const updated = await patchProfileMe(payload, accessToken);
      setProfile(updated.profile);
      setVolunteerProfile(updated.volunteerProfile);
      setForm(toEditForm(updated.profile, updated.volunteerProfile));
      setSaveNotice('Profile updated successfully.');
      setEditorPanel(null);
      await refreshProfile();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save profile.';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <VolunteerShell
      activeNav="profile"
      headerActions={
        <Button className="vol-profile-ai-btn" type="button">
          <Sparkles size={16} />
          <span>Get AI Recommendations</span>
        </Button>
      }
      pageSubtitle="Manage your volunteer identity, skills, and schedule."
      pageTitle="Profile Overview"
    >
      <section className="vol-profile-dashboard">
        <input
          accept="image/*"
          className="vol-profile-file-input"
          onChange={handleAvatarFileChange}
          ref={avatarInputRef}
          type="file"
        />

        {loading && (
          <Card as="article" className="vol-profile-card">
            <p className="muted">Loading profile...</p>
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
          <>
            {avatarFeedback && (
              <p className={avatarFeedback.tone === 'error' ? 'form-error' : 'form-success'}>
                {avatarFeedback.message}
              </p>
            )}

            <Card as="article" className="vol-profile-card vol-profile-hero-card">
              <div className="vol-profile-hero-grid">
                <div className="vol-profile-avatar-wrap">
                  <img alt={displayName} className="vol-profile-avatar-lg" src={avatarUrl} />
                  <button
                    aria-label="Change avatar"
                    className="vol-profile-camera-btn"
                    onClick={handleAvatarButtonClick}
                    type="button"
                  >
                    <Camera size={14} />
                  </button>
                </div>

                <div className="vol-profile-hero-copy">
                  <div className="vol-profile-name-row">
                    <h2>{displayName}</h2>
                    <span className="vol-profile-badge vol-profile-badge-volunteer">Volunteer</span>
                    <span className="vol-profile-badge vol-profile-badge-gold">{volunteerLevel}</span>
                  </div>

                  <p className="vol-profile-bio">{profileSummary}</p>

                  <div className="vol-profile-metric-row">
                    <article className="vol-profile-metric-box">
                      <span className="vol-profile-metric-icon vol-profile-metric-icon-green" aria-hidden="true">
                        <Leaf size={18} />
                      </span>
                      <div>
                        <small>Total Impact</small>
                        <strong>{`${totalHours}+ Hours`}</strong>
                      </div>
                    </article>

                    <article className="vol-profile-metric-box">
                      <span className="vol-profile-metric-icon vol-profile-metric-icon-blue" aria-hidden="true">
                        <CalendarDays size={18} />
                      </span>
                      <div>
                        <small>Member Since</small>
                        <strong>{memberSince}</strong>
                      </div>
                    </article>

                    <article className="vol-profile-metric-box">
                      <span className="vol-profile-metric-icon vol-profile-metric-icon-purple" aria-hidden="true">
                        <Medal size={18} />
                      </span>
                      <div>
                        <small>Reputation</small>
                        <strong>{`${reputationScore}/100`}</strong>
                      </div>
                    </article>
                  </div>
                </div>

                <div className="vol-profile-hero-action">
                  <Button
                    className="vol-profile-edit-btn"
                    onClick={() => {
                      if (editorPanel) {
                        closeEditor();
                        return;
                      }
                      openEditor('profile');
                    }}
                    type="button"
                    variant="secondary"
                  >
                    <Pencil size={16} />
                    <span>{editorPanel ? 'Close editor' : 'Edit Profile'}</span>
                  </Button>
                </div>
              </div>
            </Card>

            {editorPanel && (
              <Card as="article" className="vol-profile-card vol-profile-edit-card">
                <div className="vol-profile-section-head">
                  <div className="vol-profile-section-title">
                    <span className="vol-profile-section-icon" aria-hidden="true">
                      <Pencil size={16} />
                    </span>
                    <div>
                      <h3>{editorMeta.title}</h3>
                      <p className="vol-profile-section-description">{editorMeta.description}</p>
                    </div>
                  </div>

                  <Button onClick={closeEditor} type="button" variant="secondary">
                    Close
                  </Button>
                </div>

                {saveError && <p className="form-error">{saveError}</p>}
                {saveNotice && <p className="form-success">{saveNotice}</p>}

                <form className="vol-profile-edit-form" onSubmit={handleSave}>
                  {editorPanel === 'profile' && (
                    <div className="vol-profile-form-grid">
                      <div>
                        <label className="field-label" htmlFor="editFullName">
                          Full name
                        </label>
                        <Input
                          id="editFullName"
                          onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                          required
                          value={form.fullName}
                        />
                      </div>

                      <div>
                        <label className="field-label" htmlFor="editPhone">
                          Phone
                        </label>
                        <Input
                          id="editPhone"
                          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                          required
                          value={form.phone}
                        />
                      </div>

                      <div className="vol-profile-form-span">
                        <label className="field-label" htmlFor="editAvatarUrl">
                          Avatar URL
                        </label>
                        <Input
                          id="editAvatarUrl"
                          onChange={(event) => setForm((current) => ({ ...current, avatarUrl: event.target.value }))}
                          placeholder="https://..."
                          value={form.avatarUrl}
                        />
                      </div>
                    </div>
                  )}

                  {editorPanel === 'availability' && (
                    <div>
                      <p className="field-label">Availability</p>
                      <div className="vol-profile-toggle-row">
                        <label className="vol-profile-toggle">
                          <input
                            checked={form.availability.weekdays}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                availability: { ...current.availability, weekdays: event.target.checked },
                              }))
                            }
                            type="checkbox"
                          />
                          <span>Weekdays</span>
                        </label>

                        <label className="vol-profile-toggle">
                          <input
                            checked={form.availability.weekends}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                availability: { ...current.availability, weekends: event.target.checked },
                              }))
                            }
                            type="checkbox"
                          />
                          <span>Weekends</span>
                        </label>

                        <label className="vol-profile-toggle">
                          <input
                            checked={form.availability.evenings}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                availability: { ...current.availability, evenings: event.target.checked },
                              }))
                            }
                            type="checkbox"
                          />
                          <span>Evenings</span>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="vol-profile-form-actions">
                    <Button disabled={saving} type="submit">
                      {saving ? 'Saving...' : 'Save changes'}
                    </Button>
                    <Button
                      onClick={() => {
                        setForm(toEditForm(profile, volunteerProfile));
                        setSaveError(null);
                        setSaveNotice(null);
                      }}
                      type="button"
                      variant="secondary"
                    >
                      Reset
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            <div className="vol-profile-content-grid">
              <div className="vol-profile-main-column">
                <ProfileSkillsCard onPersist={handlePersistSkills} skills={skills} userId={profile?.id ?? null} />

                <ProfileInterestsCard interests={interests} onPersist={handlePersistInterests} />

                <ProfileSectionCard
                  action={
                    <button
                      className="vol-profile-text-link"
                      onClick={() => navigate('/volunteer/participation-history')}
                      type="button"
                    >
                      View All
                    </button>
                  }
                  icon={TrendingUp}
                  title="Participation History"
                >
                  {participationPreview.length > 0 ? (
                    <div className="vol-profile-history-list">
                      {participationPreview.map((record) => (
                        <button
                          className="vol-profile-history-item"
                          key={record.id}
                          onClick={() =>
                            navigate(
                              record.activityDeleted || !record.activityId
                                ? '/volunteer/participation-history'
                                : `/volunteer/activity/${record.activityId}`
                            )
                          }
                          type="button"
                        >
                          <div className="vol-profile-history-copy">
                            <span className="vol-profile-history-bullet" aria-hidden="true" />
                            <div>
                              <h4>{record.activityName}</h4>
                              <p>{`Hosted by ${record.organization}`}</p>
                              <small className="vol-profile-history-description">
                                Completed volunteer contribution recorded in your recent history.
                              </small>
                            </div>
                          </div>

                          <div className="vol-profile-history-meta">
                            <span>{formatShortDate(record.date).toUpperCase()}</span>
                            <strong>{record.hours !== null ? `+${record.hours} Hours` : 'Completed'}</strong>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <ProfileEmptyState
                      action={
                        <button className="vol-profile-card-action vol-profile-card-action-ghost" onClick={() => navigate('/browse')} type="button">
                          Find activities
                        </button>
                      }
                      message="No participation history yet. Join an activity to start building your record."
                      title="Nothing here yet"
                    />
                  )}
                </ProfileSectionCard>
              </div>

              <div className="vol-profile-side-column">
                <ProfileSectionCard
                  action={
                    <button className="vol-profile-card-action" onClick={() => openEditor('availability')} type="button">
                      <Pencil size={14} />
                      <span>{hasAvailability ? 'Edit schedule' : 'Set schedule'}</span>
                    </button>
                  }
                  className="vol-profile-availability-card"
                  icon={CalendarDays}
                  title="Availability"
                >
                  {hasAvailability ? (
                    <>
                      <div className="vol-profile-availability-tags">
                        {activeAvailabilityLabels.map((label) => (
                          <span className="vol-profile-availability-tag" key={label}>
                            {label}
                          </span>
                        ))}
                      </div>

                      <div className="vol-profile-week-labels">
                        {weekBars.map((bar) => (
                          <span key={`label-${bar.day}-${bar.height}`}>{bar.day}</span>
                        ))}
                      </div>

                      <div className="vol-profile-bars">
                        {weekBars.map((bar, index) => (
                          <span className="vol-profile-bar-wrap" key={`${index}-${bar.height}`}>
                            <span
                              className={`vol-profile-bar ${bar.active ? 'vol-profile-bar-active' : ''}`}
                              style={{ height: `${bar.height}%` }}
                            >
                              {bar.label && <span className="vol-profile-bar-text">{bar.label}</span>}
                            </span>
                          </span>
                        ))}
                      </div>

                      <p className="vol-profile-mini-note">{buildAvailabilityNote(availability)}</p>
                    </>
                  ) : (
                    <ProfileEmptyState
                      action={
                        <button className="vol-profile-card-action vol-profile-card-action-ghost" onClick={() => openEditor('availability')} type="button">
                          Set availability
                        </button>
                      }
                      message="Add your weekly availability so coordinators know when you can help."
                      title="No availability set"
                    />
                  )}
                </ProfileSectionCard>

                <ProfileSectionCard className="vol-profile-upcoming-card" icon={Trees} title="Upcoming Activity">
                  {upcomingPreview ? (
                    <div className="vol-profile-upcoming-inner">
                      <span className="vol-profile-upcoming-icon" aria-hidden="true">
                        <Trees size={18} />
                      </span>

                      <div className="vol-profile-upcoming-copy">
                        <div className="vol-profile-upcoming-top">
                          <span className="vol-profile-tag">{buildActivityBadge(upcomingPreview.date)}</span>
                        </div>

                        <h4>{upcomingPreview.activityName}</h4>
                        <p className="vol-profile-upcoming-meta">{`Hosted by ${upcomingPreview.organization}`}</p>
                        <p className="vol-profile-upcoming-date">{formatShortDate(upcomingPreview.date)}</p>
                        <p className="vol-profile-upcoming-time">
                          <Clock3 size={14} />
                          <span>{upcomingTimeLabel}</span>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <ProfileEmptyState
                      action={
                        <button className="vol-profile-card-action vol-profile-card-action-ghost" onClick={() => navigate('/browse')} type="button">
                          Browse activities
                        </button>
                      }
                      message="No upcoming activity. Explore new opportunities and join your next volunteer session."
                      title="No upcoming activity"
                    />
                  )}
                </ProfileSectionCard>
              </div>
            </div>
          </>
        )}
      </section>
    </VolunteerShell>
  );
}
