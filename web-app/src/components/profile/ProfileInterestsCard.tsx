import { Heart, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { Button } from '../ui/Button';
import { ProfileEmptyState, ProfileSectionCard } from './ProfileSectionCard';

interface ProfileInterestsCardProps {
  interests: string[];
  onPersist: (nextInterests: string[]) => Promise<void>;
}

function normalizeInterestName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function ProfileInterestsCard({ interests, onPersist }: ProfileInterestsCardProps) {
  const [items, setItems] = useState<string[]>(interests);
  const [isManaging, setIsManaging] = useState(false);
  const [formMode, setFormMode] = useState<'idle' | 'add' | 'edit'>('idle');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setItems(interests);
  }, [interests]);

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
              setDraftName('');
              setError(null);
              setNotice(null);
            }}
            type="button"
          >
            Done
          </button>
          <button
            className="vol-profile-card-action"
            onClick={() => {
              setIsManaging(true);
              setFormMode('add');
              setEditingIndex(null);
              setDraftName('');
              setError(null);
              setNotice(null);
            }}
            type="button"
          >
            Add interest
            <Plus size={14} />
          </button>
        </div>
      );
    }

    return (
      <div className="vol-profile-section-action-group">
        {items.length > 0 && (
          <button className="vol-profile-text-link" onClick={() => setIsManaging(true)} type="button">
            Manage
          </button>
        )}
        <button
          className="vol-profile-card-action"
          onClick={() => {
            setIsManaging(true);
            setFormMode('add');
            setEditingIndex(null);
            setDraftName('');
            setError(null);
            setNotice(null);
          }}
          type="button"
        >
          Add interest
          <Plus size={14} />
        </button>
      </div>
    );
  }, [isManaging, items.length]);

  const resetInlineEditor = () => {
    setFormMode('idle');
    setEditingIndex(null);
    setDraftName('');
    setError(null);
  };

  const handleStartEdit = (interest: string, index: number) => {
    setIsManaging(true);
    setFormMode('edit');
    setEditingIndex(index);
    setDraftName(interest);
    setError(null);
    setNotice(null);
  };

  const handleDelete = async (index: number) => {
    const target = items[index];
    if (!target) {
      return;
    }

    const confirmed = window.confirm(`Remove interest "${target}"?`);
    if (!confirmed) {
      return;
    }

    const nextItems = items.filter((_, currentIndex) => currentIndex !== index);

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await onPersist(nextItems);
      setItems(nextItems);
      setNotice('Interest removed.');

      if (nextItems.length === 0) {
        setIsManaging(false);
      }

      if (editingIndex === index) {
        resetInlineEditor();
      } else if (editingIndex !== null && editingIndex > index) {
        setEditingIndex(editingIndex - 1);
      }
    } catch (persistError) {
      setError(persistError instanceof Error ? persistError.message : 'Failed to remove interest.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = normalizeInterestName(draftName);

    if (!normalizedName) {
      setError('Interest name is required.');
      return;
    }

    const duplicate = items.some(
      (item, index) => index !== editingIndex && item.toLowerCase() === normalizedName.toLowerCase()
    );

    if (duplicate) {
      setError('This interest already exists.');
      return;
    }

    const nextItems = [...items];

    if (formMode === 'edit' && editingIndex !== null) {
      nextItems[editingIndex] = normalizedName;
    } else {
      nextItems.push(normalizedName);
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await onPersist(nextItems);
      setItems(nextItems);
      setNotice(formMode === 'edit' ? 'Interest updated.' : 'Interest added.');
      resetInlineEditor();
      setIsManaging(true);
    } catch (persistError) {
      setError(persistError instanceof Error ? persistError.message : 'Failed to save interest.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProfileSectionCard
      action={headerAction}
      icon={Heart}
      subtitle="Keep your causes current so the platform can surface more relevant volunteer programs."
      title="Interests & Causes"
    >
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-success">{notice}</p>}

      {items.length > 0 ? (
        <>
          <div className="vol-profile-interest-list">
            {items.map((interest, index) => (
              <span className="vol-profile-interest-chip" key={interest}>
                <span>{interest}</span>
                {isManaging && (
                  <span className="vol-profile-chip-controls">
                    <button
                      aria-label={`Edit ${interest}`}
                      className="vol-profile-chip-action-btn"
                      onClick={() => handleStartEdit(interest, index)}
                      type="button"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      aria-label={`Delete ${interest}`}
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
                setError(null);
                setNotice(null);
              }}
              type="button"
            >
              Add Interest
            </button>
          }
          message="Select the causes you care about so organizers can recommend the right programs."
          title="No interests set yet"
        />
      )}

      {(formMode === 'add' || (formMode === 'edit' && editingIndex !== null)) && (
        <form className="vol-profile-inline-editor" onSubmit={handleSubmit}>
          <div className="vol-profile-inline-grid vol-profile-inline-grid-single">
            <input
              className="text-input"
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Interest name"
              value={draftName}
            />
          </div>
          <div className="vol-profile-form-helper">
            {formMode === 'add'
              ? 'Add one interest at a time to keep your profile organized.'
              : 'Rename the selected interest and save the change.'}
          </div>
          <div className="vol-profile-inline-actions">
            <Button disabled={submitting} type="submit">
              {submitting ? 'Saving...' : formMode === 'add' ? 'Add interest' : 'Save interest'}
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
