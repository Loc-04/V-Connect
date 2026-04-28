import { Bell, Building2, Camera, Info, KeyRound, LogOut, Mail, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { getRoleLabel } from '../auth/roleUtils';
import { Badge, Button, Card, Input } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { getProfileMe, patchProfileMe } from '../lib/profile';
import './OrganizerSettingsPage.css';

interface OrganizerSettingsForm {
  fullName: string;
  phone: string;
}

const acceptedAvatarMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const maxAvatarFileSizeBytes = 5 * 1024 * 1024;
const avatarTargetSize = 512;

function normalizeField(value: string | null | undefined) {
  return String(value ?? '').trim();
}

function buildInitialFormState(profile: { full_name: string | null; phone: string | null; avatar_url: string | null } | null): OrganizerSettingsForm {
  return {
    fullName: normalizeField(profile?.full_name),
    phone: normalizeField(profile?.phone),
  };
}

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

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceAspect > 1) {
    cropWidth = sourceHeight;
    cropX = Math.round((sourceWidth - cropWidth) / 2);
  } else if (sourceAspect < 1) {
    cropHeight = sourceWidth;
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

function SettingsField({
  label,
  value,
  icon,
  helper,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  helper?: string;
}) {
  return (
    <div className="org-settings-detail-item">
      <span className="org-settings-detail-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {helper ? <p>{helper}</p> : null}
      </div>
    </div>
  );
}

function SettingsSection({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card as="section" className="org-settings-card">
      <div className="org-settings-card-head">
        <div className="org-settings-card-title">
          <span className="org-settings-card-icon" aria-hidden="true">
            {icon}
          </span>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>
        {action ? <div className="org-settings-card-action">{action}</div> : null}
      </div>
      <div className="org-settings-card-body">{children}</div>
    </Card>
  );
}

export function OrganizerSettingsPage() {
  const navigate = useNavigate();
  const { profile, session, signOut, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OrganizerSettingsForm>(buildInitialFormState(profile));
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarUploadDataUrl, setAvatarUploadDataUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const accessToken = session?.access_token ?? '';

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      setLoadError('No active organizer session.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void (async () => {
      try {
        const response = await getProfileMe(accessToken);
        if (cancelled) {
          return;
        }
        setForm(buildInitialFormState(response.profile));
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load organizer profile.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const organizationName = useMemo(() => {
    const fullName = normalizeField(profile?.full_name);
    return fullName ? `${fullName} Workspace` : 'Not available yet';
  }, [profile?.full_name]);
  const displayAvatarUrl = avatarPreviewUrl || normalizeField(profile?.avatar_url);

  const handleFieldChange = (field: keyof OrganizerSettingsForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
    setNotice(null);
  };

  const handleAvatarUploadClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setFormError(null);
    setNotice(null);

    if (!acceptedAvatarMimeTypes.has(file.type.toLowerCase())) {
      setFormError('Please choose a PNG, JPG, WEBP, or GIF file for avatar.');
      return;
    }

    if (file.size > maxAvatarFileSizeBytes) {
      setFormError('Avatar image must be smaller than 5 MB.');
      return;
    }

    void (async () => {
      try {
        const normalizedAvatar = await normalizeAvatarImage(file);
        setAvatarPreviewUrl(normalizedAvatar);
        setAvatarUploadDataUrl(normalizedAvatar);
        setNotice('Avatar selected. Click Save changes to update your profile.');
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Failed to process avatar image.');
      }
    })();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const fullName = normalizeField(form.fullName);
    const phone = normalizeField(form.phone);

    if (!fullName) {
      setFormError('Full name is required.');
      return;
    }

    if (!phone) {
      setFormError('Phone number is required.');
      return;
    }

    if (!accessToken) {
      setFormError('No active organizer session.');
      return;
    }

    setSaving(true);
    setFormError(null);
    setNotice(null);

    try {
      const payload: { fullName: string; phone: string; avatarUrl?: string | null } = {
        fullName,
        phone,
      };
      if (avatarUploadDataUrl) {
        payload.avatarUrl = avatarUploadDataUrl;
      }

      await patchProfileMe(payload, accessToken);
      await refreshProfile();
      setAvatarUploadDataUrl(null);
      setAvatarPreviewUrl(null);
      setNotice('Organizer profile updated successfully.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to update organizer profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm(buildInitialFormState(profile));
    setAvatarUploadDataUrl(null);
    setAvatarPreviewUrl(null);
    setFormError(null);
    setNotice(null);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <OrganizerShell
      activeNav="settings"
      pageContext={<span>Preferences / Organizer account</span>}
      pageSubtitle="Manage the account information currently supported by the web platform."
      pageTitle="Organizer Settings"
      showSearch={false}
    >
      <section className="org-settings-page">
        {loadError ? <p className="form-error">{loadError}</p> : null}

        <Card as="section" className="org-settings-summary-card">
          <div className="org-settings-summary-copy">
            <p className="org-settings-summary-eyebrow">Account overview</p>
            <h2>{normalizeField(profile?.full_name) || 'Organizer'}</h2>
            <p>
              Use this page to maintain the organizer account information currently available on the web platform.
              Organization-specific profile fields remain read-only until backend support is added.
            </p>
          </div>

          <div className="org-settings-summary-badges">
            <Badge tone="accent">{getRoleLabel(profile?.role, 'Organizer')}</Badge>
            <Badge tone={String(profile?.status ?? '').toLowerCase() === 'active' ? 'success' : 'neutral'}>
              {normalizeField(profile?.status) || 'Unknown status'}
            </Badge>
          </div>
        </Card>

        <div className="org-settings-grid">
          <SettingsSection
            action={
              <Button disabled={loading || saving} form="organizer-settings-form" type="submit" variant="primary">
                <Save size={15} />
                <span>{saving ? 'Saving...' : 'Save changes'}</span>
              </Button>
            }
            icon={<UserRound size={18} />}
            subtitle="These fields are connected directly to the existing /profile/me flow."
            title="Basic account profile"
          >
            <form className="org-settings-form" id="organizer-settings-form" onSubmit={handleSubmit}>
              <input
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="org-settings-avatar-file-input"
                onChange={handleAvatarFileChange}
                ref={avatarInputRef}
                type="file"
              />

              <label className="org-settings-field">
                <span>Full name</span>
                <Input
                  disabled={loading || saving}
                  onChange={(event) => handleFieldChange('fullName', event.target.value)}
                  placeholder="Organizer full name"
                  type="text"
                  value={form.fullName}
                />
              </label>

              <label className="org-settings-field">
                <span>Phone</span>
                <Input
                  disabled={loading || saving}
                  onChange={(event) => handleFieldChange('phone', event.target.value)}
                  placeholder="Phone number"
                  type="tel"
                  value={form.phone}
                />
              </label>

              <div className="org-settings-field org-settings-field-span">
                <span>Avatar</span>
                <div className="org-settings-avatar-uploader">
                  <div className="org-settings-avatar-preview">
                    {displayAvatarUrl ? (
                      <img alt={normalizeField(form.fullName) || 'Organizer avatar'} src={displayAvatarUrl} />
                    ) : (
                      <span>{(normalizeField(form.fullName) || 'O').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="org-settings-avatar-uploader-actions">
                    <Button disabled={loading || saving} onClick={handleAvatarUploadClick} type="button" variant="secondary">
                      <Camera size={15} />
                      <span>Upload avatar</span>
                    </Button>
                    {avatarUploadDataUrl ? <small>New avatar is ready to save.</small> : <small>PNG, JPG, WEBP, GIF up to 5MB.</small>}
                  </div>
                </div>
              </div>

              <div className="org-settings-form-actions">
                <Button disabled={loading || saving} onClick={handleReset} type="button" variant="secondary">
                  Reset
                </Button>
              </div>
            </form>

            {formError ? <p className="form-error">{formError}</p> : null}
            {notice ? <p className="form-success">{notice}</p> : null}
          </SettingsSection>

          <SettingsSection
            icon={<Info size={18} />}
            subtitle="Role and account status are currently read-only."
            title="Account details"
          >
            <div className="org-settings-detail-grid">
              <SettingsField icon={<Mail size={16} />} label="Email" value={session?.user?.email ?? 'Unavailable'} />
              <SettingsField
                helper="Derived from the authenticated account profile."
                icon={<ShieldCheck size={16} />}
                label="Role"
                value={getRoleLabel(profile?.role, 'Organizer')}
              />
              <SettingsField
                helper="This reflects the current public.users account state."
                icon={<Info size={16} />}
                label="Status"
                value={normalizeField(profile?.status) || 'Unknown'}
              />
              <SettingsField
                icon={<Phone size={16} />}
                label="Current phone"
                value={normalizeField(profile?.phone) || 'Unavailable'}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            icon={<Building2 size={18} />}
            subtitle="Organization profile fields are not exposed by the current backend yet."
            title="Organization and contact information"
          >
            <div className="org-settings-detail-grid">
              <SettingsField
                helper="Displayed as a safe read-only fallback until a dedicated organizer profile endpoint exists."
                icon={<Building2 size={16} />}
                label="Organization name"
                value={organizationName}
              />
              <SettingsField
                helper="Use account email for now. Dedicated public contact settings are not available yet."
                icon={<Mail size={16} />}
                label="Primary contact"
                value={session?.user?.email ?? 'Not available yet'}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            action={
              <Button onClick={() => navigate('/organizer/notifications')} type="button" variant="secondary">
                <Bell size={15} />
                <span>Open notifications</span>
              </Button>
            }
            icon={<Bell size={18} />}
            subtitle="Preference persistence is not available yet, so these controls remain informational."
            title="Preferences and app settings"
          >
            <div className="org-settings-preference-list">
              <div className="org-settings-preference-item">
                <div>
                  <strong>Approval updates</strong>
                  <p>Registration, recommendation, and attendance changes already surface in the organizer notifications workspace.</p>
                </div>
                <span className="org-settings-placeholder-pill">Managed automatically</span>
              </div>

              <div className="org-settings-preference-item">
                <div>
                  <strong>Report follow-up alerts</strong>
                  <p>Custom reminder and digest preferences are not available yet on the web settings screen.</p>
                </div>
                <span className="org-settings-placeholder-pill">Not available yet</span>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            icon={<KeyRound size={18} />}
            subtitle="Use the existing account flows only. No new security workflow is introduced here."
            title="Security and account actions"
          >
            <div className="org-settings-security-actions">
              <Button onClick={() => navigate('/forgot-password')} type="button" variant="secondary">
                <KeyRound size={15} />
                <span>Send password reset link</span>
              </Button>
              <Button onClick={() => void handleSignOut()} type="button" variant="danger">
                <LogOut size={15} />
                <span>Logout</span>
              </Button>
            </div>
          </SettingsSection>
        </div>
      </section>
    </OrganizerShell>
  );
}
