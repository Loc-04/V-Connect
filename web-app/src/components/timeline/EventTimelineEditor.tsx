import { AlertCircle, ArrowDown, ArrowUp, PencilLine, PlusCircle, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getSelectableTimelineStatuses, isTimelineStatusLocked } from '../../lib/timelineStatus';
import { createTimelineMilestone, deleteTimelineMilestone, listActivityTimeline, moveTimelineMilestone, updateTimelineMilestone, updateTimelineMilestoneStatus } from '../../lib/timeline';
import { hasTimelineValidationErrors, sortTimelineByTime, validateTimelineDrafts } from '../../lib/timelineValidation';
import type { TimelineIntegrationMeta, TimelineMilestone, TimelineMilestoneDraft, TimelineMilestoneStatus, TimelineMilestoneType } from '../../types/timeline';
import { Badge, Button, Card, Input, Select } from '../ui';
import { TimelineStatusBadge } from './TimelineStatusBadge';

const typeOptions: TimelineMilestoneType[] = ['check_in', 'opening', 'session', 'break', 'closing', 'wrap_up', 'custom'];

function formatTypeLabel(type: TimelineMilestoneType) {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatRange(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Time TBD';
  }

  return `${start.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })} - ${end.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function toInputDateTimeValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString();
}

function createInitialDraft(activityStartTime?: string | null, activityEndTime?: string | null): TimelineMilestoneDraft {
  const startValue = toInputDateTimeValue(activityStartTime);
  const endValue = toInputDateTimeValue(activityEndTime);

  return {
    title: '',
    description: '',
    startTime: startValue ? toIsoDateTime(startValue) : '',
    endTime: endValue ? toIsoDateTime(endValue) : '',
    type: 'session',
    status: 'upcoming',
  };
}

function getInlineFieldError(issueMessages: string[], targetText: string) {
  return issueMessages.find((message) => message.toLowerCase().includes(targetText));
}

interface EventTimelineEditorProps {
  activityId: string;
  activityTitle: string;
  activityStartTime?: string | null;
  activityEndTime?: string | null;
}

export function EventTimelineEditor({
  activityId,
  activityTitle,
  activityStartTime = null,
  activityEndTime = null,
}: EventTimelineEditorProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<TimelineMilestone[]>([]);
  const [integrationMeta, setIntegrationMeta] = useState<TimelineIntegrationMeta | null>(null);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<TimelineMilestoneDraft>(() =>
    createInitialDraft(activityStartTime, activityEndTime)
  );
  const [formErrorMessages, setFormErrorMessages] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyMilestoneId, setBusyMilestoneId] = useState<string | null>(null);
  const isEditingDraft = Boolean(editingMilestoneId);

  const resetForm = useCallback(() => {
    setEditingMilestoneId(null);
    setFormDraft(createInitialDraft(activityStartTime, activityEndTime));
    setFormErrorMessages([]);
  }, [activityEndTime, activityStartTime]);

  const loadTimeline = useCallback(async () => {
    if (!activityId) {
      setMilestones([]);
      setLoading(false);
      setError('Select an activity to manage timeline.');
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await listActivityTimeline(activityId);
      setMilestones(result.milestones);
      setIntegrationMeta(result.integration);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load timeline.');
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    void loadTimeline();
    resetForm();
  }, [activityId, loadTimeline, resetForm]);

  const orderedMilestones = useMemo(() => sortTimelineByTime(milestones), [milestones]);
  const editingMilestone = useMemo(
    () => (editingMilestoneId ? milestones.find((item) => item.id === editingMilestoneId) ?? null : null),
    [editingMilestoneId, milestones]
  );
  const editingBaseStatus = editingMilestone?.status ?? 'upcoming';
  const formStatusOptions = useMemo(
    () => (isEditingDraft ? getSelectableTimelineStatuses(editingBaseStatus) : (['upcoming'] as TimelineMilestoneStatus[])),
    [editingBaseStatus, isEditingDraft]
  );
  const isFormStatusLocked = !isEditingDraft || isTimelineStatusLocked(editingBaseStatus);
  const timelineIssues = useMemo(
    () =>
      validateTimelineDrafts(
        orderedMilestones.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          startTime: item.startTime,
          endTime: item.endTime,
          type: item.type,
          status: item.status,
        })),
        {
          activityStartTime,
          activityEndTime,
          enforceActivityWindow: false,
        }
      ),
    [activityEndTime, activityStartTime, orderedMilestones]
  );

  const warningMessages = useMemo(
    () => Array.from(new Set(timelineIssues.filter((issue) => issue.level === 'warning').map((issue) => issue.message))),
    [timelineIssues]
  );

  const handleDraftChange = <K extends keyof TimelineMilestoneDraft>(field: K, value: TimelineMilestoneDraft[K]) => {
    setFormDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleEditMilestone = (milestone: TimelineMilestone) => {
    setEditingMilestoneId(milestone.id);
    setFormDraft({
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      startTime: milestone.startTime,
      endTime: milestone.endTime,
      type: milestone.type,
      status: milestone.status,
    });
    setFormErrorMessages([]);
    setNotice(null);
  };

  const handleSubmitDraft = async () => {
    const issues = validateTimelineDrafts([formDraft], {
      activityStartTime,
      activityEndTime,
      enforceActivityWindow: false,
    });

    const errorMessages = issues.filter((issue) => issue.level === 'error').map((issue) => issue.message);
    setFormErrorMessages(errorMessages);
    if (hasTimelineValidationErrors(issues)) {
      return;
    }

    const payload: TimelineMilestoneDraft = {
      ...formDraft,
      title: formDraft.title.trim(),
      description: formDraft.description.trim(),
      startTime: formDraft.startTime,
      endTime: formDraft.endTime,
      status: isEditingDraft
        ? (isTimelineStatusLocked(editingBaseStatus) ? editingBaseStatus : (formDraft.status ?? editingBaseStatus))
        : 'upcoming',
    };

    try {
      if (editingMilestoneId) {
        const result = await updateTimelineMilestone(activityId, editingMilestoneId, payload);
        setMilestones(result.milestones);
        setNotice('Milestone updated.');
      } else {
        const result = await createTimelineMilestone(activityId, payload);
        setMilestones(result.milestones);
        setNotice('Milestone added.');
      }
      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update milestone.');
    }
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    const confirmed = window.confirm('Delete this milestone?');
    if (!confirmed) {
      return;
    }

    setBusyMilestoneId(milestoneId);
    try {
      const result = await deleteTimelineMilestone(activityId, milestoneId);
      setMilestones(result.milestones);
      setNotice('Milestone removed.');
      if (editingMilestoneId === milestoneId) {
        resetForm();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete milestone.');
    } finally {
      setBusyMilestoneId(null);
    }
  };

  const handleMoveMilestone = async (milestoneId: string, direction: 'up' | 'down') => {
    setBusyMilestoneId(milestoneId);
    try {
      const result = await moveTimelineMilestone(activityId, milestoneId, direction);
      setMilestones(result.milestones);
      setNotice(`Milestone moved ${direction}.`);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : 'Failed to reorder milestone.');
    } finally {
      setBusyMilestoneId(null);
    }
  };

  const handleUpdateMilestoneStatus = async (milestoneId: string, status: TimelineMilestoneStatus) => {
    setBusyMilestoneId(milestoneId);
    try {
      const result = await updateTimelineMilestoneStatus(activityId, milestoneId, status);
      setMilestones(result.milestones);
      setNotice('Milestone status updated.');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update milestone status.');
    } finally {
      setBusyMilestoneId(null);
    }
  };

  const titleFieldError = getInlineFieldError(formErrorMessages, 'title');
  const startFieldError = getInlineFieldError(formErrorMessages, 'start time');
  const endFieldError = getInlineFieldError(formErrorMessages, 'end time');
  const timeRangeError = getInlineFieldError(formErrorMessages, 'end time must be later');

  return (
    <Card as="section" className="timeline-editor-shell">
      <div className="timeline-editor-head">
        <div>
          <h2>Timeline Management</h2>
          <p className="muted">Manage organizer milestones for {activityTitle}.</p>
        </div>
        <Badge tone="info">Organizer Editable</Badge>
      </div>

      {integrationMeta?.pendingServerIntegration ? (
        <div className="timeline-integration-banner" role="status">
          <AlertCircle size={14} />
          <span>{integrationMeta.message}</span>
        </div>
      ) : null}

      {notice ? <p className="form-success">{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {warningMessages.length > 0 ? <p className="timeline-warning-text">{warningMessages[0]}</p> : null}

      <div className="timeline-editor-form">
        <h3>{isEditingDraft ? 'Edit milestone' : 'Add milestone'}</h3>
        <div className="timeline-form-grid">
          <label>
            <span>Title</span>
            <Input
              onChange={(event) => handleDraftChange('title', event.target.value)}
              placeholder="Opening ceremony"
              value={formDraft.title}
            />
            {titleFieldError ? <small className="form-error">{titleFieldError}</small> : null}
          </label>

          <label>
            <span>Type</span>
            <Select onChange={(event) => handleDraftChange('type', event.target.value as TimelineMilestoneType)} value={formDraft.type}>
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {formatTypeLabel(option)}
                </option>
              ))}
            </Select>
          </label>

          <label>
            <span>Status</span>
            <Select
              onChange={(event) => handleDraftChange('status', event.target.value as TimelineMilestoneStatus)}
              disabled={isFormStatusLocked}
              value={formDraft.status ?? 'upcoming'}
            >
              {formStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </label>

          <label>
            <span>Start time</span>
            <Input
              onChange={(event) => handleDraftChange('startTime', toIsoDateTime(event.target.value))}
              type="datetime-local"
              value={toInputDateTimeValue(formDraft.startTime)}
            />
            {startFieldError ? <small className="form-error">{startFieldError}</small> : null}
          </label>

          <label>
            <span>End time</span>
            <Input
              onChange={(event) => handleDraftChange('endTime', toIsoDateTime(event.target.value))}
              type="datetime-local"
              value={toInputDateTimeValue(formDraft.endTime)}
            />
            {endFieldError ? <small className="form-error">{endFieldError}</small> : null}
          </label>
        </div>

        <label className="timeline-form-description">
          <span>Description</span>
          <textarea
            className="text-input timeline-form-textarea"
            onChange={(event) => handleDraftChange('description', event.target.value)}
            placeholder="Share instructions for this milestone."
            rows={3}
            value={formDraft.description}
          />
        </label>
        {timeRangeError ? <small className="form-error">{timeRangeError}</small> : null}

        <div className="timeline-form-actions">
          <Button onClick={() => void handleSubmitDraft()} type="button">
            <Save size={15} />
            <span>{isEditingDraft ? 'Update milestone' : 'Add milestone'}</span>
          </Button>
          {isEditingDraft ? (
            <Button onClick={resetForm} type="button" variant="secondary">
              Cancel edit
            </Button>
          ) : (
            <Button
              onClick={() => {
                resetForm();
                setNotice('New milestone form is ready.');
              }}
              type="button"
              variant="secondary"
            >
              <PlusCircle size={15} />
              <span>Reset form</span>
            </Button>
          )}
        </div>
      </div>

      <div className="timeline-editor-list">
        <h3>Milestones</h3>
        {loading ? (
          <p className="muted">Loading timeline milestones...</p>
        ) : orderedMilestones.length === 0 ? (
          <div className="timeline-empty-state">
            <p>No milestones yet.</p>
            <small>Add the first timeline milestone to plan event flow.</small>
          </div>
        ) : (
          orderedMilestones.map((milestone, index) => (
            <article className={`timeline-editor-item ${milestone.status === 'in_progress' ? 'is-current' : ''}`} key={milestone.id}>
              <div className="timeline-item-top">
                <div>
                  <p className="timeline-item-title">{milestone.title}</p>
                  <small className="timeline-item-time">{formatRange(milestone.startTime, milestone.endTime)}</small>
                </div>
                <TimelineStatusBadge status={milestone.status} />
              </div>

              <div className="timeline-item-tags">
                <Badge tone="neutral">{formatTypeLabel(milestone.type)}</Badge>
              </div>

              {milestone.description ? <p className="timeline-item-description">{milestone.description}</p> : null}

              <div className="timeline-item-controls">
                <div className="timeline-item-order-controls">
                  <Button
                    disabled={busyMilestoneId === milestone.id || index === 0}
                    onClick={() => void handleMoveMilestone(milestone.id, 'up')}
                    type="button"
                    variant="secondary"
                  >
                    <ArrowUp size={14} />
                    <span>Up</span>
                  </Button>
                  <Button
                    disabled={busyMilestoneId === milestone.id || index === orderedMilestones.length - 1}
                    onClick={() => void handleMoveMilestone(milestone.id, 'down')}
                    type="button"
                    variant="secondary"
                  >
                    <ArrowDown size={14} />
                    <span>Down</span>
                  </Button>
                </div>

                <div className="timeline-item-status-controls">
                  {(() => {
                    const selectableStatuses = getSelectableTimelineStatuses(milestone.status);
                    const isLockedStatus = isTimelineStatusLocked(milestone.status);
                    return (
                      <Select
                        disabled={busyMilestoneId === milestone.id || isLockedStatus}
                        onChange={(event) => void handleUpdateMilestoneStatus(milestone.id, event.target.value as TimelineMilestoneStatus)}
                        sizeMode="small"
                        value={milestone.status}
                      >
                        {selectableStatuses.map((option) => (
                          <option key={option} value={option}>
                            {option.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </Select>
                    );
                  })()}
                </div>

                <div className="timeline-item-action-controls">
                  <Button
                    disabled={busyMilestoneId === milestone.id}
                    onClick={() => handleEditMilestone(milestone)}
                    type="button"
                    variant="secondary"
                  >
                    <PencilLine size={14} />
                    <span>Edit</span>
                  </Button>
                  <Button
                    disabled={busyMilestoneId === milestone.id}
                    onClick={() => void handleDeleteMilestone(milestone.id)}
                    type="button"
                    variant="danger"
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </Button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </Card>
  );
}
