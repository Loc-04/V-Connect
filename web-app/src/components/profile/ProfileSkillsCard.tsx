import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { Button } from '../ui/Button';
import { ProfileEmptyState, ProfileSectionCard } from './ProfileSectionCard';

const skillTones = ['green', 'blue', 'purple', 'orange'] as const;
const skillLevels = ['BASIC', 'INTER', 'ADV', 'EXPERT'] as const;

type SkillTone = (typeof skillTones)[number];
export type SkillLevel = (typeof skillLevels)[number];

interface StoredSkillMeta {
  name: string;
  level: SkillLevel;
}

interface SkillEntry extends StoredSkillMeta {
  tone: SkillTone;
}

interface ProfileSkillsCardProps {
  userId: string | null;
  skills: string[];
  onPersist: (nextSkills: string[]) => Promise<void>;
}

function getStorageKey(userId: string) {
  return `vconnect_profile_skill_levels_v1_${userId}`;
}

function normalizeSkillName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function readStoredSkillMeta(userId: string | null): StoredSkillMeta[] {
  if (!userId || typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const name = typeof item.name === 'string' ? normalizeSkillName(item.name) : '';
        const level = typeof item.level === 'string' ? (item.level.toUpperCase() as SkillLevel) : null;

        if (!name || !level || !skillLevels.includes(level)) {
          return null;
        }

        return { name, level };
      })
      .filter((item): item is StoredSkillMeta => item !== null);
  } catch {
    return [];
  }
}

function writeStoredSkillMeta(userId: string | null, entries: StoredSkillMeta[]) {
  if (!userId || typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(entries));
}

function withTones(entries: StoredSkillMeta[]): SkillEntry[] {
  return entries.map((entry, index) => ({
    ...entry,
    tone: skillTones[index % skillTones.length],
  }));
}

function hydrateSkillEntries(userId: string | null, skills: string[]): SkillEntry[] {
  const saved = readStoredSkillMeta(userId);

  return withTones(
    skills.map((skill, index) => {
      const name = normalizeSkillName(skill);
      const matched = saved.find((item) => item.name.toLowerCase() === name.toLowerCase());

      return {
        name,
        level: matched?.level ?? skillLevels[index % skillLevels.length],
      };
    })
  );
}

export function ProfileSkillsCard({ userId, skills, onPersist }: ProfileSkillsCardProps) {
  const [entries, setEntries] = useState<SkillEntry[]>(() => hydrateSkillEntries(userId, skills));
  const [isManaging, setIsManaging] = useState(false);
  const [formMode, setFormMode] = useState<'idle' | 'add' | 'edit'>('idle');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftLevel, setDraftLevel] = useState<SkillLevel>('BASIC');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setEntries(hydrateSkillEntries(userId, skills));
  }, [skills, userId]);

  const hasSkills = entries.length > 0;
  const isEditing = formMode === 'edit' && editingIndex !== null;

  const headerAction = useMemo(() => {
    if (isManaging) {
      return (
        <div className="vol-profile-section-action-group">
          <button
            className="vol-profile-text-link"
            onClick={() => {
              setIsManaging(false);
              setFormMode('idle');
              setEditingIndex(null);
              setError(null);
              setNotice(null);
            }}
            type="button"
          >
            Done
          </button>
          <button className="vol-profile-card-action" onClick={() => {
            setIsManaging(true);
            setFormMode('add');
            setEditingIndex(null);
            setDraftName('');
            setDraftLevel('BASIC');
            setError(null);
            setNotice(null);
          }} type="button">
            Add skill
            <Plus size={14} />
          </button>
        </div>
      );
    }

    return (
      <div className="vol-profile-section-action-group">
        {hasSkills && (
          <button className="vol-profile-text-link" onClick={() => setIsManaging(true)} type="button">
            Edit
          </button>
        )}
        <button
          className="vol-profile-card-action"
          onClick={() => {
            setIsManaging(true);
            setFormMode('add');
            setEditingIndex(null);
            setDraftName('');
            setDraftLevel('BASIC');
            setError(null);
            setNotice(null);
          }}
          type="button"
        >
          Add skill
          <Plus size={14} />
        </button>
      </div>
    );
  }, [hasSkills, isManaging]);

  const resetInlineEditor = () => {
    setFormMode('idle');
    setEditingIndex(null);
    setDraftName('');
    setDraftLevel('BASIC');
    setError(null);
  };

  const handleStartEdit = (entry: SkillEntry, index: number) => {
    setIsManaging(true);
    setFormMode('edit');
    setEditingIndex(index);
    setDraftName(entry.name);
    setDraftLevel(entry.level);
    setError(null);
    setNotice(null);
  };

  const handleDelete = async (index: number) => {
    const target = entries[index];
    if (!target) {
      return;
    }

    const confirmed = window.confirm(`Remove skill "${target.name}"?`);
    if (!confirmed) {
      return;
    }

    const nextEntries = entries.filter((_, currentIndex) => currentIndex !== index).map(({ name, level }) => ({ name, level }));

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await onPersist(nextEntries.map((entry) => entry.name));
      writeStoredSkillMeta(userId, nextEntries);
      setEntries(withTones(nextEntries));
      setNotice('Skill removed.');

      if (nextEntries.length === 0) {
        setIsManaging(false);
      }

      if (editingIndex === index) {
        resetInlineEditor();
      } else if (editingIndex !== null && editingIndex > index) {
        setEditingIndex(editingIndex - 1);
      }
    } catch (persistError) {
      setError(persistError instanceof Error ? persistError.message : 'Failed to remove skill.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = normalizeSkillName(draftName);

    if (!normalizedName) {
      setError('Skill name is required.');
      return;
    }

    const duplicate = entries.some(
      (entry, index) => index !== editingIndex && entry.name.toLowerCase() === normalizedName.toLowerCase()
    );

    if (duplicate) {
      setError('This skill already exists.');
      return;
    }

    const nextEntries = entries.map(({ name, level }) => ({ name, level }));

    if (formMode === 'edit' && editingIndex !== null) {
      nextEntries[editingIndex] = { name: normalizedName, level: draftLevel };
    } else {
      nextEntries.push({ name: normalizedName, level: draftLevel });
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await onPersist(nextEntries.map((entry) => entry.name));
      writeStoredSkillMeta(userId, nextEntries);
      setEntries(withTones(nextEntries));
      setNotice(formMode === 'edit' ? 'Skill updated.' : 'Skill added.');
      resetInlineEditor();
      setIsManaging(true);
    } catch (persistError) {
      setError(persistError instanceof Error ? persistError.message : 'Failed to save skill.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProfileSectionCard action={headerAction} icon={Sparkles} title="Skills & Expertise">
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-success">{notice}</p>}

      {hasSkills ? (
        <>
          <p className="vol-profile-section-description">
            Highlight the strengths you want coordinators to recognize when matching new opportunities.
          </p>
          <div className="vol-profile-chips">
            {entries.map((skill, index) => (
              <span className={`vol-profile-chip vol-profile-chip-${skill.tone}`} key={`${skill.name}-${skill.level}`}>
                <span className="vol-profile-chip-dot" aria-hidden="true" />
                <span>{skill.name}</span>
                <em>{skill.level}</em>
                {isManaging && (
                  <span className="vol-profile-chip-controls">
                    <button
                      aria-label={`Edit ${skill.name}`}
                      className="vol-profile-chip-action-btn"
                      onClick={() => handleStartEdit(skill, index)}
                      type="button"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      aria-label={`Delete ${skill.name}`}
                      className="vol-profile-chip-action-btn vol-profile-chip-action-danger"
                      disabled={submitting}
                      onClick={() => {
                        void handleDelete(index);
                      }}
                      type="button"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                )}
              </span>
            ))}
          </div>
        </>
      ) : (
        <ProfileEmptyState
          action={
            <button
              className="vol-profile-card-action vol-profile-card-action-ghost"
              onClick={() => {
                setIsManaging(true);
                setFormMode('add');
                setEditingIndex(null);
                setDraftName('');
                setDraftLevel('BASIC');
                setError(null);
                setNotice(null);
              }}
              type="button"
            >
              Add Skill
            </button>
          }
          message="No skills added yet. Add a few strengths to make your volunteer profile easier to match."
          title="No skills added yet"
        />
      )}

      {(formMode === 'add' || isEditing) && (
        <form className="vol-profile-inline-editor" onSubmit={handleSubmit}>
          <div className="vol-profile-inline-grid">
            <input
              className="text-input"
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Skill name"
              value={draftName}
            />
            <select
              className="text-input vol-profile-inline-select"
              onChange={(event) => setDraftLevel(event.target.value as SkillLevel)}
              value={draftLevel}
            >
              {skillLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
          <div className="vol-profile-form-helper">
            {formMode === 'add'
              ? 'Add one skill at a time. Levels are stored locally until backend support for levels is added.'
              : 'Update the skill name or its level, then save the change.'}
          </div>
          <div className="vol-profile-inline-actions">
            <Button disabled={submitting} type="submit">
              {submitting ? 'Saving...' : formMode === 'add' ? 'Add skill' : 'Save skill'}
            </Button>
            <Button onClick={resetInlineEditor} type="button" variant="secondary">
              Cancel
            </Button>
          </div>
        </form>
      )}
    </ProfileSectionCard>
  );
}
