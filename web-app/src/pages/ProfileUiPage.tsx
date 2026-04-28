import './ProfileUiPage.css';

import {
  CalendarDays,
  Camera,
  Clock3,
  Heart,
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
import { Button, Card, Input } from '../components/ui';
import { VolunteerShell } from '../layouts/VolunteerShell';
import {
  computeWeekBarsFromChoices,
  formatAvailabilityChoice,
  normalizeAvailableChoices,
  summarizeAvailableChoices,
} from '../lib/availability';
import { listParticipations } from '../lib/participations';
import { getProfileMe, patchProfileMe } from '../lib/profile';
import type { UserRecord } from '../types/domain';
import type { ParticipationRecord } from '../types/participation';
import type { VolunteerProfile } from '../types/profile';

const fallbackAvatar =
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80';

const settingsRoute = '/volunteer/profile-settings';
const skillToneClassNames = [
  'vol-profile-chip-green',
  'vol-profile-chip-blue',
  'vol-profile-chip-purple',
  'vol-profile-chip-orange',
] as const;

interface AvatarFeedback {
  tone: 'error' | 'success';
  message: string;
}

interface EditFormState {
  fullName: string;
  phone: string;
}

const acceptedAvatarMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const maxAvatarFileSizeBytes = 5 * 1024 * 1024;
const avatarTargetSize = 512;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to read selected image.'));
    };
    reader.onerror = () => reject(new Error('Failed to read selected image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode selected image.'));
    image.src = source;
  });
}

function estimateDataUrlSizeBytes(value: string) {
  const base64Payload = value.split(',')[1] ?? '';
  const paddingBytes = base64Payload.endsWith('==') ? 2 : base64Payload.endsWith('=') ? 1 : 0;
  return Math.floor((base64Payload.length * 3) / 4) - paddingBytes;
}

async function normalizeAvatarImage(file: File): Promise<string> {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);

  const sourceWidth = Math.max(1, image.naturalWidth || image.width);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height);
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = 1;

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceAspect > targetAspect) {
    cropWidth = Math.round(sourceHeight * targetAspect);
    cropX = Math.round((sourceWidth - cropWidth) / 2);
  } else if (sourceAspect < targetAspect) {
    cropHeight = Math.round(sourceWidth / targetAspect);
    cropY = Math.round((sourceHeight - cropHeight) / 2);
  }

  const canvas = document.createElement('canvas');
  canvas.width = avatarTargetSize;
  canvas.height = avatarTargetSize;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image processing is not available in this browser.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    avatarTargetSize,
    avatarTargetSize
  );

  const qualitySteps = [0.9, 0.82, 0.74, 0.66];
  for (const quality of qualitySteps) {
    const encoded = canvas.toDataURL('image/jpeg', quality);
    if (estimateDataUrlSizeBytes(encoded) <= maxAvatarFileSizeBytes) {
      return encoded;
    }
  }

  const fallback = canvas.toDataURL('image/jpeg', 0.58);
  if (estimateDataUrlSizeBytes(fallback) > maxAvatarFileSizeBytes) {
    throw new Error('Avatar image is too large after processing. Please choose a smaller image.');
  }
  return fallback;
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

function toEditForm(profile: UserRecord | null): EditFormState {
  return {
    fullName: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
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

export function ProfileUiPage() {
  const navigate = useNavigate();
  const { session, profile: authProfile, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserRecord | null>(authProfile);
  const [volunteerProfile, setVolunteerProfile] = useState<VolunteerProfile | null>(null);
  const [participations, setParticipations] = useState<ParticipationRecord[]>([]);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [form, setForm] = useState<EditFormState>(() => toEditForm(authProfile));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarUploadDataUrl, setAvatarUploadDataUrl] = useState<string | null>(null);
  const [avatarFeedback, setAvatarFeedback] = useState<AvatarFeedback | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);

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
      setForm(toEditForm(response.profile));
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

  const availableChoices = normalizeAvailableChoices(volunteerProfile?.availableChoices);
  const weekBars = computeWeekBarsFromChoices(availableChoices);

  const skills = volunteerProfile?.skills ?? [];
  const interests = volunteerProfile?.interests ?? [];
  const totalHours = volunteerProfile?.total_hours ?? 0;
  const memberSince = formatMonthYear(profile?.created_at);
  const hasAvailability = availableChoices.length > 0;
  const activeAvailabilityLabels = availableChoices.slice(0, 6).map(formatAvailabilityChoice);

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
  const handleCancelProfileEdit = () => {
    setForm(toEditForm(profile));
    setAvatarPreviewUrl(null);
    setAvatarUploadDataUrl(null);
    setAvatarFeedback(null);
    setSaveError(null);
    setSaveNotice(null);
    setIsEditingProfile(false);
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

    if (!acceptedAvatarMimeTypes.has(file.type.toLowerCase())) {
      setAvatarFeedback({
        tone: 'error',
        message: 'Please choose a PNG, JPG, WEBP, or GIF image for your avatar.',
      });
      return;
    }

    if (file.size > maxAvatarFileSizeBytes) {
      setAvatarFeedback({
        tone: 'error',
        message: 'Avatar image must be smaller than 5 MB.',
      });
      return;
    }

    void (async () => {
      try {
        const normalizedAvatar = await normalizeAvatarImage(file);
        setAvatarPreviewUrl(normalizedAvatar);
        setAvatarUploadDataUrl(normalizedAvatar);
        setIsEditingProfile(true);
        setSaveError(null);
        setSaveNotice(null);
        setAvatarFeedback({
          tone: 'success',
          message: 'Avatar selected. Click Save changes to apply it to your profile.',
        });
      } catch (avatarError) {
        setAvatarFeedback({
          tone: 'error',
          message: avatarError instanceof Error ? avatarError.message : 'Failed to process avatar image.',
        });
      }
    })();
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
      const payload: {
        fullName: string;
        phone: string;
        avatarUrl?: string | null;
      } = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
      };
      if (avatarUploadDataUrl) {
        payload.avatarUrl = avatarUploadDataUrl;
      }

      const updated = await patchProfileMe(payload, accessToken);
      setProfile(updated.profile);
      setVolunteerProfile(updated.volunteerProfile);
      setForm(toEditForm(updated.profile));
      setAvatarUploadDataUrl(null);
      setAvatarPreviewUrl(null);
      setAvatarFeedback(null);
      setSaveNotice('Profile updated successfully.');
      setIsEditingProfile(false);
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
      pageEyebrow="Account Overview"
      headerActions={
        <div className="vol-profile-page-actions">
          <Button onClick={() => navigate(settingsRoute)} type="button" variant="secondary">
            <Pencil size={14} />
            <span>Manage Skills & Availability</span>
          </Button>
        </div>
      }
      pageSubtitle="View your profile summary and manage preferences from the dedicated settings page."
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
                      if (isEditingProfile) {
                        handleCancelProfileEdit();
                        return;
                      }
                      setSaveError(null);
                      setSaveNotice(null);
                      setIsEditingProfile(true);
                    }}
                    type="button"
                    variant="secondary"
                  >
                    <Pencil size={16} />
                    <span>{isEditingProfile ? 'Cancel edit' : 'Edit Profile'}</span>
                  </Button>
                </div>
              </div>
            </Card>

            {isEditingProfile && (
              <Card as="article" className="vol-profile-card vol-profile-edit-card">
                <div className="vol-profile-section-head">
                  <div className="vol-profile-section-title">
                    <span className="vol-profile-section-icon" aria-hidden="true">
                      <Pencil size={16} />
                    </span>
                    <div>
                      <h3>Edit Profile</h3>
                      <p className="vol-profile-section-description">
                        Update your basic profile details shown on this overview page.
                      </p>
                    </div>
                  </div>

                  <Button onClick={handleCancelProfileEdit} type="button" variant="secondary">
                    Cancel
                  </Button>
                </div>

                {saveError && <p className="form-error">{saveError}</p>}
                {saveNotice && <p className="form-success">{saveNotice}</p>}

                <form className="vol-profile-edit-form" onSubmit={handleSave}>
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
                      <label className="field-label">Avatar</label>
                      <div className="vol-profile-form-actions">
                        <Button onClick={handleAvatarButtonClick} type="button" variant="secondary">
                          <Camera size={14} />
                          <span>Upload from device</span>
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="vol-profile-form-actions">
                    <Button disabled={saving} type="submit">
                      {saving ? 'Saving...' : 'Save changes'}
                    </Button>
                    <Button
                      onClick={() => {
                        setForm(toEditForm(profile));
                        setAvatarPreviewUrl(null);
                        setAvatarUploadDataUrl(null);
                        setAvatarFeedback(null);
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
                <ProfileSectionCard
                  action={
                    <button className="vol-profile-text-link" onClick={() => navigate(settingsRoute)} type="button">
                      Manage
                    </button>
                  }
                  icon={Sparkles}
                  title="Skills & Expertise"
                >
                  {skills.length > 0 ? (
                    <>
                      <p className="vol-profile-section-description">
                        Skills are managed in the dedicated preferences page.
                      </p>
                      <div className="vol-profile-chips">
                        {skills.map((skill, index) => (
                          <span
                            className={`vol-profile-chip ${skillToneClassNames[index % skillToneClassNames.length]}`}
                            key={skill}
                          >
                            <span className="vol-profile-chip-dot" aria-hidden="true" />
                            <span>{skill}</span>
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <ProfileEmptyState
                      message="No skills added yet. Add your skills in the settings page."
                      title="No skills added yet"
                    />
                  )}
                </ProfileSectionCard>

                <ProfileSectionCard
                  action={
                    <button className="vol-profile-text-link" onClick={() => navigate(settingsRoute)} type="button">
                      Manage
                    </button>
                  }
                  icon={Heart}
                  title="Interests & Causes"
                >
                  {interests.length > 0 ? (
                    <>
                      <p className="vol-profile-section-description">
                        Interests are managed in the dedicated preferences page.
                      </p>
                      <div className="vol-profile-interest-list">
                        {interests.map((interest) => (
                          <span className="vol-profile-interest-chip" key={interest}>
                            <span>{interest}</span>
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <ProfileEmptyState
                      message="No interests set yet. Add your interests in the settings page."
                      title="No interests set yet"
                    />
                  )}
                </ProfileSectionCard>

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
                    <button className="vol-profile-card-action" onClick={() => navigate(settingsRoute)} type="button">
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

                      <p className="vol-profile-mini-note">{summarizeAvailableChoices(availableChoices)}</p>
                    </>
                  ) : (
                    <ProfileEmptyState
                      action={
                        <button
                          className="vol-profile-card-action vol-profile-card-action-ghost"
                          onClick={() => navigate(settingsRoute)}
                          type="button"
                        >
                          Edit availability
                        </button>
                      }
                      message="Add your weekly availability in settings so coordinators know when you can help."
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
