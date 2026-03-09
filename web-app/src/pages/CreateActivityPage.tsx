import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { createActivity } from '../lib/activities';
import type { ActivityStatus } from '../types/activity';
import './CreateActivityPage.css';

function combineDateAndTime(date: string, time: string) {
  const localDate = new Date(`${date}T${time}`);
  if (Number.isNaN(localDate.getTime())) {
    throw new Error('Invalid date/time.');
  }
  return localDate.toISOString();
}

function normalizeRole(role: string | null | undefined) {
  return String(role ?? '').toLowerCase();
}

export function CreateActivityPage() {
  const navigate = useNavigate();
  const { profile, session, signOut } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [capacity, setCapacity] = useState('10');
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const role = normalizeRole(profile?.role);
  const canManageActivities = role === 'organizer' || role === 'admin';

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

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
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

      const createdActivity = await createActivity(
        {
          title: title.trim(),
          description: description.trim(),
          location: {
            address: location.trim() || 'TBD',
            city: '',
            lat: 0,
            lng: 0,
          },
          startTime: startIso,
          endTime: endIso,
          capacity: capacityValue,
          requiredSkills,
          status,
        },
        session.access_token
      );

      setSuccess(`Activity "${createdActivity.title}" saved as ${createdActivity.status}.`);
      if (status === 'published') {
        navigate('/organizer/dashboard');
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save activity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="create-activity-page">
      <header className="create-activity-header">
        <div className="create-activity-header__container">
          <div className="create-activity-brand">
            <span className="create-activity-brand__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img">
                <path d="M12 3.2c-3.7 0-6.8 2.1-6.8 4.7 0 1 .5 1.9 1.3 2.7-.8.8-1.3 1.7-1.3 2.7 0 1.1.6 2.1 1.6 2.9-.6.7-1 1.5-1 2.3 0 2.6 3 4.7 6.8 4.7s6.8-2.1 6.8-4.7c0-.8-.3-1.6-1-2.3 1-.8 1.6-1.8 1.6-2.9 0-1-.5-1.9-1.3-2.7.8-.8 1.3-1.7 1.3-2.7 0-2.6-3-4.7-6.8-4.7Z" />
              </svg>
            </span>
            <strong>V-Connect</strong>
          </div>

          <nav className="create-activity-nav" aria-label="Main">
            <button className="create-activity-nav__item" onClick={() => navigate('/organizer/dashboard')} type="button">
              Dashboard
            </button>
            <button className="create-activity-nav__item is-active" type="button">
              Activities
            </button>
          </nav>

          <div className="create-activity-header__actions">
            <button className="create-activity-profile-btn" onClick={handleSignOut} type="button">
              Logout
            </button>
            <span className="create-activity-avatar" aria-hidden="true" />
          </div>
        </div>
      </header>

      <main className="create-activity-main">
        <div className="create-activity-content">
          <div className="create-activity-breadcrumbs">
            <span>Home</span>
            <span aria-hidden="true">/</span>
            <span>Activities</span>
            <span aria-hidden="true">/</span>
            <strong>Create</strong>
          </div>

          <section className="create-activity-title">
            <h1>Create New Activity</h1>
            <p>Fill in the details below to launch a new volunteering opportunity and connect with the community.</p>
          </section>

          {!canManageActivities && <p className="form-error">Only organizer/admin accounts can create activities.</p>}
          {error && <p className="form-error">{error}</p>}
          {success && <p className="form-success">{success}</p>}

          <form className="create-activity-form" onSubmit={(event) => event.preventDefault()}>
            <section className="activity-card">
              <div className="activity-card__head">
                <span className="activity-card__badge is-blue" aria-hidden="true">
                  B
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
            </section>

            <section className="activity-card">
              <div className="activity-card__head">
                <span className="activity-card__badge is-purple" aria-hidden="true">
                  R
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
            </section>

            <section className="activity-card">
              <div className="activity-card__head">
                <span className="activity-card__badge is-orange" aria-hidden="true">
                  L
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

              <div className="activity-grid two-cols is-wide-first">
                <label className="activity-field">
                  <span>Location</span>
                  <input
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Search for a location or address"
                    type="text"
                    value={location}
                  />
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
              </div>
            </section>

            <div className="activity-action-bar">
              <button className="action-btn is-ghost" onClick={() => navigate('/organizer/dashboard')} type="button">
                Cancel
              </button>
              <div className="activity-action-bar__right">
                <button
                  className="action-btn is-secondary"
                  disabled={saving || !canManageActivities}
                  onClick={() => void handleSave('draft')}
                  type="button"
                >
                  {saving ? 'Saving...' : 'Save Draft'}
                </button>
                <button
                  className="action-btn is-primary"
                  disabled={saving || !canManageActivities}
                  onClick={() => void handleSave('published')}
                  type="button"
                >
                  {saving ? 'Saving...' : 'Save & Publish'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
