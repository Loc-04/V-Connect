import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardList, MapPin, Sparkles } from 'lucide-react';

import { normalizeRole } from '../auth/roleUtils';
import { useAuth } from '../auth/useAuth';
import { Button, Card } from '../components/ui';
import { OrganizerShell } from '../layouts/OrganizerShell';
import { createActivity, getActivityById, updateActivity } from '../lib/activities';
import { listProvinces, listWards } from '../lib/locations';
import type { ActivityRecord, ActivityStatus } from '../types/activity';
import type { ProvinceRecord, WardRecord } from '../types/location';
import './CreateActivityPage.css';

function combineDateAndTime(date: string, time: string) {
  const localDate = new Date(`${date}T${time}`);
  if (Number.isNaN(localDate.getTime())) {
    throw new Error('Invalid date/time.');
  }
  return localDate.toISOString();
}

function splitDateAndTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: '', time: '' };
  }

  const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
  };
}

function getAddressValue(location: ActivityRecord['location']) {
  if (!location) {
    return '';
  }

  if (typeof location === 'string') {
    return location;
  }

  return location.address ?? '';
}

export function CreateActivityPage() {
  const navigate = useNavigate();
  const { id: activityId } = useParams<{ id?: string }>();
  const { profile, session } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [provinceCode, setProvinceCode] = useState('');
  const [wardCode, setWardCode] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [capacity, setCapacity] = useState('10');
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState('');
  const [provinces, setProvinces] = useState<ProvinceRecord[]>([]);
  const [wards, setWards] = useState<WardRecord[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(Boolean(activityId));
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingWards, setLoadingWards] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const role = normalizeRole(profile?.role);
  const canManageActivities = role === 'organizer' || role === 'admin';
  const organizerHomePath = role === 'admin' ? '/admin/dashboard' : '/organizer/activities';
  const isEditing = Boolean(activityId);

  const selectedProvince = useMemo(
    () => provinces.find((province) => province.code === provinceCode) ?? null,
    [provinceCode, provinces]
  );
  const selectedWard = useMemo(() => wards.find((ward) => ward.code === wardCode) ?? null, [wardCode, wards]);

  useEffect(() => {
    if (!session?.access_token) {
      setLoadingProvinces(false);
      return;
    }

    let isMounted = true;
    setLoadingProvinces(true);

    void listProvinces(session.access_token)
      .then((rows) => {
        if (!isMounted) {
          return;
        }
        setProvinces(rows);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Failed to load provinces.');
      })
      .finally(() => {
        if (isMounted) {
          setLoadingProvinces(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || !provinceCode) {
      setWards([]);
      setLoadingWards(false);
      return;
    }

    let isMounted = true;
    setLoadingWards(true);

    void listWards(provinceCode, session.access_token)
      .then((rows) => {
        if (!isMounted) {
          return;
        }
        setWards(rows);
        setWardCode((current) => (rows.some((ward) => ward.code === current) ? current : ''));
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Failed to load wards.');
        setWards([]);
      })
      .finally(() => {
        if (isMounted) {
          setLoadingWards(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [provinceCode, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || !activityId) {
      setLoadingActivity(false);
      return;
    }

    let isMounted = true;
    setLoadingActivity(true);
    setError(null);

    void getActivityById(activityId, session.access_token)
      .then((activity) => {
        if (!isMounted) {
          return;
        }

        const start = splitDateAndTime(activity.start_time);
        const end = splitDateAndTime(activity.end_time);
        setTitle(activity.title ?? '');
        setDescription(activity.description ?? '');
        setStreetAddress(getAddressValue(activity.location));
        setProvinceCode(activity.province_code ?? '');
        setWardCode(activity.ward_code ?? '');
        setDate(start.date);
        setStartTime(start.time);
        setEndTime(end.time);
        setCapacity(String(activity.capacity ?? 10));
        setRequiredSkills(Array.isArray(activity.required_skills) ? activity.required_skills : []);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Failed to load activity.');
      })
      .finally(() => {
        if (isMounted) {
          setLoadingActivity(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activityId, session?.access_token]);

  const addSkill = () => {
    const nextSkill = skillDraft.trim();
    if (!nextSkill) {
      return;
    }

    if (!requiredSkills.some((skill) => skill.toLowerCase() === nextSkill.toLowerCase())) {
      setRequiredSkills((current) => [...current, nextSkill]);
    }
    setSkillDraft('');
  };

  const removeSkill = (skillToRemove: string) => {
    setRequiredSkills((current) => current.filter((skill) => skill !== skillToRemove));
  };

  const handleSave = async (status: ActivityStatus) => {
    if (!session?.access_token) {
      setError('No active session token.');
      return;
    }

    if (!canManageActivities) {
      setError('Only organizers/admins can create activities.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!title.trim()) {
        throw new Error('Activity title is required.');
      }

      if (!streetAddress.trim()) {
        throw new Error('Street address is required.');
      }

      if (!provinceCode) {
        throw new Error('Please select a city/province.');
      }

      if (!wardCode) {
        throw new Error('Please select a ward/commune.');
      }

      if (!date || !startTime || !endTime) {
        throw new Error('Date, start time, and end time are required.');
      }

      const startIso = combineDateAndTime(date, startTime);
      const endIso = combineDateAndTime(date, endTime);
      if (new Date(endIso) <= new Date(startIso)) {
        throw new Error('End time must be later than start time.');
      }

      const capacityValue = Number(capacity);
      if (!Number.isInteger(capacityValue) || capacityValue <= 0) {
        throw new Error('Volunteer capacity must be a positive integer.');
      }

      const payload = {
        title: title.trim(),
        description: description.trim(),
        location: {
          address: streetAddress.trim(),
        },
        provinceCode,
        wardCode,
        startTime: startIso,
        endTime: endIso,
        capacity: capacityValue,
        requiredSkills,
        status,
      };

      const savedActivity = isEditing && activityId
        ? await updateActivity(activityId, payload, session.access_token)
        : await createActivity(payload, session.access_token);

      setSuccess(
        isEditing
          ? `Activity "${savedActivity.title}" updated successfully.`
          : `Activity "${savedActivity.title}" saved as ${savedActivity.status}.`
      );

      if (isEditing || status === 'published') {
        navigate(organizerHomePath);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save activity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OrganizerShell
      activeNav="activities"
      headerActions={
        <Button onClick={() => navigate(organizerHomePath)} type="button" variant="secondary">
          Back to Activities
        </Button>
      }
      pageSubtitle={
        isEditing
          ? 'Update the activity details, schedule, and selected location.'
          : 'Fill in the details below to launch a volunteering opportunity.'
      }
      pageTitle={isEditing ? 'Edit Activity' : 'Create New Activity'}
    >
      <section className="create-activity-page">
        <div className="create-activity-content">
          <div className="create-activity-breadcrumbs">
            <span>Home</span>
            <span aria-hidden="true">/</span>
            <span>Activities</span>
            <span aria-hidden="true">/</span>
            <strong>{isEditing ? 'Edit' : 'Create'}</strong>
          </div>

          {!canManageActivities && <p className="form-error">Only organizer/admin accounts can manage activities.</p>}
          {error && <p className="form-error">{error}</p>}
          {success && <p className="form-success">{success}</p>}

          <form className="create-activity-form" onSubmit={(event) => event.preventDefault()}>
            <Card as="section" className="activity-card">
              <div className="activity-card__head">
                <span className="activity-card__badge is-blue" aria-hidden="true">
                  <Sparkles size={16} />
                </span>
                <h2>Basic Information</h2>
              </div>

              <label className="activity-field">
                <span>Activity Title</span>
                <input
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g., Weekend Beach Cleanup"
                  type="text"
                  value={title}
                />
              </label>

              <label className="activity-field">
                <span>Description</span>
                <textarea
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe the activity, goals, and what volunteers can expect..."
                  rows={4}
                  value={description}
                />
              </label>
            </Card>

            <Card as="section" className="activity-card">
              <div className="activity-card__head">
                <span className="activity-card__badge is-purple" aria-hidden="true">
                  <ClipboardList size={16} />
                </span>
                <h2>Requirements</h2>
              </div>

              <div className="activity-grid two-cols">
                <div className="activity-field">
                  <span>Required Skills</span>
                  <div className="activity-tag-input">
                    {requiredSkills.map((skill) => (
                      <button
                        key={skill}
                        className="activity-tag"
                        onClick={() => removeSkill(skill)}
                        type="button"
                      >
                        {skill} <span aria-hidden="true">x</span>
                      </button>
                    ))}
                    <input
                      onChange={(event) => setSkillDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ',') {
                          event.preventDefault();
                          addSkill();
                        }
                      }}
                      placeholder="Add skill and press Enter"
                      type="text"
                      value={skillDraft}
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card as="section" className="activity-card">
              <div className="activity-card__head">
                <span className="activity-card__badge is-orange" aria-hidden="true">
                  <MapPin size={16} />
                </span>
                <h2>Logistics</h2>
              </div>

              <div className="activity-grid three-cols">
                <label className="activity-field">
                  <span>Date</span>
                  <input onChange={(event) => setDate(event.target.value)} type="date" value={date} />
                </label>
                <label className="activity-field">
                  <span>Start Time</span>
                  <input onChange={(event) => setStartTime(event.target.value)} type="time" value={startTime} />
                </label>
                <label className="activity-field">
                  <span>End Time</span>
                  <input onChange={(event) => setEndTime(event.target.value)} type="time" value={endTime} />
                </label>
              </div>

              <div className="activity-grid three-cols location-grid">
                <label className="activity-field location-grid__wide">
                  <span>Street / House Number</span>
                  <input
                    onChange={(event) => setStreetAddress(event.target.value)}
                    placeholder="e.g., 123 Nguyen Hue Street"
                    type="text"
                    value={streetAddress}
                  />
                </label>

                <label className="activity-field">
                  <span>City / Province</span>
                  <select
                    disabled={loadingProvinces}
                    onChange={(event) => {
                      setProvinceCode(event.target.value);
                      setWardCode('');
                    }}
                    value={provinceCode}
                  >
                    <option value="">{loadingProvinces ? 'Loading provinces...' : 'Select city / province'}</option>
                    {provinces.map((province) => (
                      <option key={province.code} value={province.code}>
                        {province.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="activity-field">
                  <span>Ward / Commune</span>
                  <select
                    disabled={!provinceCode || loadingWards}
                    onChange={(event) => setWardCode(event.target.value)}
                    value={wardCode}
                  >
                    <option value="">
                      {!provinceCode
                        ? 'Select province first'
                        : loadingWards
                          ? 'Loading wards...'
                          : 'Select ward / commune'}
                    </option>
                    {wards.map((ward) => (
                      <option key={ward.code} value={ward.code}>
                        {ward.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="activity-grid two-cols is-wide-first">
                <label className="activity-field">
                  <span>Selected location summary</span>
                  <div className="activity-location-summary" role="status">
                    {streetAddress || selectedWard || selectedProvince
                      ? [streetAddress.trim(), selectedWard?.name, selectedProvince?.name].filter(Boolean).join(', ')
                      : 'Select province, ward, and street address.'}
                  </div>
                </label>

                <label className="activity-field">
                  <span>Volunteer Capacity</span>
                  <input
                    min={1}
                    onChange={(event) => setCapacity(event.target.value)}
                    type="number"
                    value={capacity}
                  />
                </label>
              </div>

              <div className="map-preview" aria-hidden="true">
                <span>Map Preview</span>
                <div className="map-preview__content">
                  <strong>
                    {streetAddress || selectedWard || selectedProvince
                      ? [streetAddress.trim(), selectedWard?.name, selectedProvince?.name].filter(Boolean).join(', ')
                      : 'Select address, province, and ward'}
                  </strong>
                  <p>Map integration will be added later. This area is reserved for the live map picker/preview.</p>
                </div>
              </div>
            </Card>

            <div className="activity-action-bar">
              <button className="action-btn is-ghost" onClick={() => navigate(organizerHomePath)} type="button">
                Cancel
              </button>
              <div className="activity-action-bar__right">
                <button
                  className="action-btn is-secondary"
                  disabled={saving || !canManageActivities || loadingActivity}
                  onClick={() => void handleSave('draft')}
                  type="button"
                >
                  {saving ? 'Saving...' : isEditing ? 'Save Draft Changes' : 'Save Draft'}
                </button>
                <button
                  className="action-btn is-primary"
                  disabled={saving || !canManageActivities || loadingActivity}
                  onClick={() => void handleSave('published')}
                  type="button"
                >
                  {saving ? 'Saving...' : isEditing ? 'Save & Publish Updates' : 'Save & Publish'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </OrganizerShell>
  );
}
