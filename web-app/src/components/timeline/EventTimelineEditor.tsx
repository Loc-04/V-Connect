import { AlertCircle, PencilLine, PlusCircle, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { createTimelineMilestone, deleteTimelineMilestone, listActivityTimeline, updateTimelineMilestone, updateTimelineMilestoneStatus } from '../../lib/timeline';
import { formatTimelineRangeLabel } from '../../lib/dateTimeFormat';
import { normalizeTimelineItem, safeText } from '../../lib/timelineNormalization';
import { resolveTimelineMilestoneStatus } from '../../lib/timelineStatus';
import { hasTimelineValidationErrors, sortTimelineByTime, validateTimelineDrafts } from '../../lib/timelineValidation';
import type { TimelineIntegrationMeta, TimelineMilestone, TimelineMilestoneDraft, TimelineMilestoneStatus, TimelineMilestoneType } from '../../types/timeline';
import { Badge, Button, Card, Input, Select } from '../ui';
import { TimelineStatusBadge } from './TimelineStatusBadge';

const typeOptions: TimelineMilestoneType[] = ['opening', 'session', 'break', 'closing', 'other'];

function formatTypeLabel(type: TimelineMilestoneType) {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeDuplicateText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildDuplicateSignature(item: Pick<TimelineMilestoneDraft, 'title' | 'type' | 'startTime' | 'endTime'>) {
  return JSON.stringify({
    title: normalizeDuplicateText(item.title),
    type: item.type,
    startTime: item.startTime,
    endTime: item.endTime,
  });
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
  };
}

function getInlineFieldError(issueMessages: string[], targetText: string) {
  return issueMessages.find((message) => message.toLowerCase().includes(targetText));
}

function isCompletedMilestoneStatus(status: TimelineMilestoneStatus | string | null | undefined) {
  return String(status ?? '').trim().toLowerCase() === 'completed';
}

interface EventTimelineEditorProps {
  accessToken?: string;
  activityId: string;
  activityTitle: string;
  activityStartTime?: string | null;
  activityEndTime?: string | null;
}

export function EventTimelineEditor({
  accessToken,
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
  const [isSubmittingDraft, setIsSubmittingDraft] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

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
    if (!accessToken) {
      setMilestones([]);
      setLoading(false);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await listActivityTimeline(activityId, accessToken);
      setMilestones(result.milestones.map((item, index) => normalizeTimelineItem(item, activityId, index)));
      setIntegrationMeta(result.integration);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load timeline.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, activityId]);

  useEffect(() => {
    void loadTimeline();
    resetForm();
  }, [activityId, loadTimeline, resetForm]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const orderedMilestones = useMemo(() => sortTimelineByTime(milestones), [milestones]);
  const displayedMilestones = useMemo(
    () =>
      orderedMilestones.map((item) => ({
        ...item,
        status: resolveTimelineMilestoneStatus(item, nowMs),
      })),
    [nowMs, orderedMilestones]
  );
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
          enforceActivityWindow: true,
        }
      ),
    [activityEndTime, activityStartTime, orderedMilestones]
  );

  const timelineErrorMessages = useMemo(
    () => Array.from(new Set(timelineIssues.filter((issue) => issue.level === 'error').map((issue) => issue.message))),
    [timelineIssues]
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
    if (isCompletedMilestoneStatus(resolveTimelineMilestoneStatus(milestone, nowMs))) {
      setNotice('Completed milestones are locked and cannot be edited.');
      return;
    }

    const normalized = normalizeTimelineItem(milestone, activityId, milestone.orderIndex);
    setEditingMilestoneId(milestone.id);
    setFormDraft({
      id: normalized.id,
      title: normalized.title,
      description: normalized.description,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      type: normalized.type,
      status: normalized.status === 'cancelled' ? 'cancelled' : undefined,
    });
    setFormErrorMessages([]);
    setNotice(null);
  };

  const handleSubmitDraft = async () => {
    if (isSubmittingDraft) {
      return;
    }

    const issues = validateTimelineDrafts([formDraft], {
      activityStartTime,
      activityEndTime,
      enforceActivityWindow: true,
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
      status: formDraft.status === 'cancelled' ? 'cancelled' : undefined,
    };

    const nextSignature = buildDuplicateSignature(payload);
    const hasDuplicate = milestones.some((milestone) => {
      if (editingMilestoneId && milestone.id === editingMilestoneId) {
        return false;
      }

      return (
        buildDuplicateSignature({
          title: milestone.title,
          type: milestone.type,
          startTime: milestone.startTime,
          endTime: milestone.endTime,
        }) === nextSignature
      );
    });

    if (hasDuplicate) {
      setFormErrorMessages(['A milestone with the same title, type, start time, and end time already exists.']);
      return;
    }

    setIsSubmittingDraft(true);
    try {
      if (editingMilestoneId) {
        const targetMilestone = displayedMilestones.find((item) => item.id === editingMilestoneId);
        if (targetMilestone && isCompletedMilestoneStatus(targetMilestone.status)) {
          setNotice('Completed milestones are locked and cannot be edited.');
          return;
        }

        const result = await updateTimelineMilestone(activityId, editingMilestoneId, payload, accessToken);
        setMilestones(result.milestones);
        setNotice('Milestone updated.');
      } else {
        const result = await createTimelineMilestone(activityId, payload, accessToken);
        setMilestones(result.milestones);
        setNotice('Milestone added.');
      }
      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update milestone.');
    } finally {
      setIsSubmittingDraft(false);
    }
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    const targetMilestone = displayedMilestones.find((item) => item.id === milestoneId);
    if (targetMilestone && isCompletedMilestoneStatus(targetMilestone.status)) {
      setNotice('Completed milestones are locked and cannot be deleted.');
      return;
    }

    const confirmed = window.confirm('Delete this milestone?');
    if (!confirmed) {
      return;
    }

    setBusyMilestoneId(milestoneId);
    try {
      const result = await deleteTimelineMilestone(activityId, milestoneId, accessToken);
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

  const handleUpdateMilestoneStatus = async (milestoneId: string, status: TimelineMilestoneStatus) => {
    if (status !== 'cancelled') {
      return;
    }

    const targetMilestone = displayedMilestones.find((item) => item.id === milestoneId);
    if (targetMilestone && isCompletedMilestoneStatus(targetMilestone.status)) {
      setNotice('Completed milestones are locked and cannot be changed.');
      return;
    }

    setBusyMilestoneId(milestoneId);
    try {
      const result = await updateTimelineMilestoneStatus(activityId, milestoneId, status, accessToken);
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
  const activityRangeError = getInlineFieldError(formErrorMessages, 'activity time range');
  const activeDraftStatus = resolveTimelineMilestoneStatus(formDraft, nowMs);

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
      {timelineErrorMessages.length > 0 ? <p className="form-error">{timelineErrorMessages[0]}</p> : null}
      {warningMessages.length > 0 ? <p className="timeline-warning-text">{warningMessages[0]}</p> : null}

      <div className="timeline-editor-form">
        <h3>{editingMilestoneId ? 'Edit milestone' : 'Add milestone'}</h3>
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
        {activityRangeError ? <small className="form-error">{activityRangeError}</small> : null}
        <p className="muted">
          Status updates automatically from milestone time range. Manual override is available only for Cancelled.
        </p>
        <TimelineStatusBadge status={activeDraftStatus} />

        <div className="timeline-form-actions">
          <Button disabled={isSubmittingDraft} onClick={() => void handleSubmitDraft()} type="button">
            <Save size={15} />
            <span>
              {isSubmittingDraft ? 'Saving...' : editingMilestoneId ? 'Update milestone' : 'Add milestone'}
            </span>
          </Button>
          {editingMilestoneId ? (
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
        ) : displayedMilestones.length === 0 ? (
          <div className="timeline-empty-state">
            <p>No milestones yet.</p>
            <small>Add the first timeline milestone to plan event flow.</small>
          </div>
        ) : (
          <p className="muted">Milestones are automatically ordered by start time.</p>
        )}
        {!loading && displayedMilestones.length > 0 && (
          displayedMilestones.map((milestone, index) => (
            <article className={`timeline-editor-item ${milestone.status === 'in_progress' ? 'is-current' : ''}`} key={milestone.id}>
              <div className="timeline-item-top">
                <div>
              <p className="timeline-item-title">{safeText(milestone.title, 'Untitled milestone')}</p>
                  <small className="timeline-item-time">{formatTimelineRangeLabel(milestone.startTime, milestone.endTime)}</small>
                </div>
                <TimelineStatusBadge status={milestone.status} />
              </div>

              <div className="timeline-item-tags">
                <Badge tone="neutral">{formatTypeLabel(milestone.type)}</Badge>
              </div>

              {safeText(milestone.description) ? (
                <p className="timeline-item-description">{safeText(milestone.description)}</p>
              ) : null}

              <div className="timeline-item-controls">
                <div className="timeline-item-order-controls">
                  <Badge tone="neutral">#{index + 1}</Badge>
                </div>

                <div className="timeline-item-status-controls">
                  {milestone.status === 'cancelled' ? (
                    <Badge tone="danger">Cancelled</Badge>
                  ) : milestone.status === 'completed' ? (
                    <Badge tone="success">Completed milestone (locked)</Badge>
                  ) : (
                    <Button
                      disabled={busyMilestoneId === milestone.id || isCompletedMilestoneStatus(milestone.status)}
                      onClick={() => void handleUpdateMilestoneStatus(milestone.id, 'cancelled')}
                      type="button"
                      variant="danger"
                    >
                      Cancel
                    </Button>
                  )}
                </div>

                <div className="timeline-item-action-controls">
                  <Button
                    disabled={busyMilestoneId === milestone.id || isCompletedMilestoneStatus(milestone.status)}
                    onClick={() => handleEditMilestone(milestone)}
                    type="button"
                    variant="secondary"
                  >
                    <PencilLine size={14} />
                    <span>Edit</span>
                  </Button>
                  <Button
                    disabled={busyMilestoneId === milestone.id || isCompletedMilestoneStatus(milestone.status)}
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
