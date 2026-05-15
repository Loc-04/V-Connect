import { Heart, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import {
  filterSharedInterests,
  getSharedInterestCatalog,
  isKnownSharedInterest,
  normalizeInterestSelection,
  resolveCanonicalInterestLabel,
} from '../../lib/interestCatalog';
import { Button } from '../ui/Button';
import { ProfileEmptyState, ProfileSectionCard } from './ProfileSectionCard';

interface ProfileInterestsCardProps {
  interests: string[];
  onPersist: (nextInterests: string[]) => Promise<void>;
}

const legacyHint = 'This saved interest is not in the current catalog';

export function ProfileInterestsCard({ interests, onPersist }: ProfileInterestsCardProps) {
  const interestCatalog = useMemo(() => getSharedInterestCatalog(), []);
  const [items, setItems] = useState<string[]>(() => normalizeInterestSelection(interests, interestCatalog));
  const [isManaging, setIsManaging] = useState(false);
  const [formMode, setFormMode] = useState<'idle' | 'add'>('idle');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [draftName, setDraftName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setItems(normalizeInterestSelection(interests, interestCatalog));
  }, [interestCatalog, interests]);

  const selectedInterests = useMemo(
    () =>
      items.map((item) => ({
        label: item,
        isLegacy: !isKnownSharedInterest(item, interestCatalog),
      })),
    [interestCatalog, items]
  );
  const hasLegacyInterests = selectedInterests.some((item) => item.isLegacy);

  const visibleInterestOptions = useMemo(
    () =>
      filterSharedInterests(catalogQuery, interestCatalog)
        .filter((interest) => !items.some((item) => item.toLowerCase() === interest.toLowerCase()))
        .slice(0, 16),
    [catalogQuery, interestCatalog, items]
  );

  const canonicalDraftName = resolveCanonicalInterestLabel(draftName, interestCatalog);
  const isCatalogDraft = isKnownSharedInterest(canonicalDraftName, interestCatalog);

  const headerAction = useMemo(() => {
    if (isManaging) {
      return (
        <div className="vol-profile-section-action-group">
          <button
            className="vol-profile-text-link"
            onClick={() => {
              setIsManaging(false);
              setFormMode('idle');
              setCatalogQuery('');
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
              setCatalogQuery('');
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
            setCatalogQuery('');
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
    setCatalogQuery('');
    setDraftName('');
    setError(null);
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
    } catch (persistError) {
      setError(persistError instanceof Error ? persistError.message : 'Failed to remove interest.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isCatalogDraft) {
      setError('Choose an interest from the list');
      return;
    }

    const duplicate = items.some((item) => item.toLowerCase() === canonicalDraftName.toLowerCase());

    if (duplicate) {
      setError('This interest already exists.');
      return;
    }

    const nextItems = normalizeInterestSelection([...items, canonicalDraftName], interestCatalog);

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await onPersist(nextItems);
      setItems(nextItems);
      setNotice('Interest added.');
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
          <p className="vol-profile-section-description">
            <strong>Selected interests</strong>
          </p>
          <div className="vol-profile-interest-list">
            {selectedInterests.map((interest, index) => (
              <span className="vol-profile-interest-chip" key={interest.label}>
                <span>{interest.label}</span>
                {interest.isLegacy ? <small className="vol-profile-interest-legacy-pill">Legacy</small> : null}
                {isManaging && (
                  <span className="vol-profile-chip-controls">
                    <button
                      aria-label={`Delete ${interest.label}`}
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
          {hasLegacyInterests ? <p className="vol-profile-form-helper">{legacyHint}</p> : null}
        </>
      ) : (
        <ProfileEmptyState
          action={
            <button
              className="vol-profile-card-action vol-profile-card-action-ghost"
              onClick={() => {
                setIsManaging(true);
                setFormMode('add');
                setCatalogQuery('');
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

      {formMode === 'add' && (
        <form className="vol-profile-inline-editor" onSubmit={handleSubmit}>
          <div className="vol-profile-inline-grid vol-profile-inline-grid-single">
            <div className="vol-profile-skill-picker">
              <input
                className="text-input"
                onChange={(event) => {
                  setCatalogQuery(event.target.value);
                  setDraftName('');
                  setError(null);
                }}
                placeholder="Search interests..."
                value={catalogQuery}
              />
              <div className="vol-profile-skill-options">
                {visibleInterestOptions.map((interest) => (
                  <button
                    className={interest.toLowerCase() === canonicalDraftName.toLowerCase() ? 'is-selected' : ''}
                    key={interest}
                    onClick={() => {
                      setDraftName(interest);
                      setCatalogQuery(interest);
                      setError(null);
                    }}
                    type="button"
                  >
                    {interest}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="vol-profile-form-helper">
            {catalogQuery.trim().length > 0 && visibleInterestOptions.length === 0 ? 'No matching interests' : null}
          </div>
          <div className="vol-profile-form-helper">
            {catalogQuery.trim().length > 0 && !isCatalogDraft ? 'Choose an interest from the list' : null}
          </div>
          <div className="vol-profile-inline-actions">
            <Button disabled={submitting || !isCatalogDraft} type="submit">
              {submitting ? 'Saving...' : 'Add interest'}
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
