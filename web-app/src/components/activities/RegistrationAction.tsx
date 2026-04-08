import { useMemo, useState, type MouseEvent, type SyntheticEvent } from 'react';

import { Badge, Button } from '../ui';
import { createParticipation } from '../../lib/participations';
import type { ParticipationRecord } from '../../types/participation';
import './RegistrationAction.css';

type NoticeType = 'success' | 'error';
type RegistrationActionMode = 'full' | 'badge';

interface RegistrationActionProps {
  activityId: string;
  currentStatus?: string | null;
  accessToken?: string | null;
  participationId?: string | null;
  canRegister?: boolean;
  mode?: RegistrationActionMode;
  className?: string;
  disabled?: boolean;
  onRegistered?: (participation: ParticipationRecord) => void;
  onCancel?: (context: { activityId: string; participationId: string | null }) => Promise<void> | void;
  onNotice?: (type: NoticeType, message: string) => void;
  confirmCancelMessage?: string;
  registerDisabledLabel?: string;
}

function toTitleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'none') {
    return 'none';
  }

  return normalized;
}

function getBadgeTone(status: string) {
  if (status === 'approved' || status === 'checked_in' || status === 'completed') {
    return 'success' as const;
  }
  if (status === 'rejected' || status === 'cancelled' || status === 'expired') {
    return 'danger' as const;
  }
  if (status === 'pending' || status === 'upcoming') {
    return 'info' as const;
  }
  return 'neutral' as const;
}

function getStatusLabel(status: string) {
  if (status === 'none') {
    return 'Not registered';
  }
  if (status === 'checked_in') {
    return 'Checked-in';
  }
  if (status === 'expired') {
    return 'Expired';
  }
  return toTitleCase(status);
}

export function RegistrationAction({
  activityId,
  currentStatus,
  accessToken,
  participationId = null,
  canRegister = true,
  mode = 'full',
  className = '',
  disabled = false,
  onRegistered,
  onCancel,
  onNotice,
  confirmCancelMessage = 'Cancel this registration request?',
  registerDisabledLabel = 'Volunteer only',
}: RegistrationActionProps) {
  const status = useMemo(() => normalizeStatus(currentStatus), [currentStatus]);
  const [registering, setRegistering] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancelableStatuses = useMemo(() => new Set(['assigned', 'pending', 'approved']), []);

  const isRegisterable = status === 'none';
  const showCancelAction = mode === 'full' && cancelableStatuses.has(status);
  const canCancel = showCancelAction && typeof onCancel === 'function';

  const notify = (type: NoticeType, message: string) => {
    if (onNotice) {
      onNotice(type, message);
    }
  };

  const stopEventBubble = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  const handleRegister = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (!canRegister || disabled || registering) {
      return;
    }

    if (!accessToken) {
      notify('error', 'No active session token.');
      return;
    }

    setRegistering(true);
    try {
      const result = await createParticipation(activityId, accessToken);
      onRegistered?.(result.participation);
      notify('success', result.message ?? (result.created ? 'Registration submitted successfully.' : 'Participation already exists.'));
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Failed to register for this activity.');
    } finally {
      setRegistering(false);
    }
  };

  const handleCancel = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (!showCancelAction || disabled || cancelling) {
      return;
    }

    if (!onCancel) {
      notify('error', 'Cancel registration is not available yet.');
      return;
    }

    const confirmed = window.confirm(confirmCancelMessage);
    if (!confirmed) {
      return;
    }

    setCancelling(true);
    try {
      await onCancel({ activityId, participationId });
      notify('success', 'Registration request cancelled.');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Failed to cancel this registration.');
    } finally {
      setCancelling(false);
    }
  };

  if (mode === 'badge') {
    return (
      <span className={`registration-action registration-action--badge ${className}`.trim()} onClick={stopEventBubble} onKeyDown={stopEventBubble}>
        <Badge className="registration-action-badge" tone={getBadgeTone(status)}>
          {getStatusLabel(status)}
        </Badge>
      </span>
    );
  }

  if (isRegisterable) {
    return (
      <span className={`registration-action registration-action--full ${className}`.trim()} onClick={stopEventBubble} onKeyDown={stopEventBubble}>
        <Button
          className="registration-action-btn"
          disabled={disabled || !canRegister || registering}
          onClick={(event) => void handleRegister(event)}
          type="button"
        >
          {registering ? 'Registering...' : canRegister ? 'Register' : registerDisabledLabel}
        </Button>
      </span>
    );
  }

  return (
    <span className={`registration-action registration-action--full ${className}`.trim()} onClick={stopEventBubble} onKeyDown={stopEventBubble}>
      <Badge className="registration-action-badge" tone={getBadgeTone(status)}>
        {getStatusLabel(status)}
      </Badge>
      {showCancelAction ? (
        <Button
          className="registration-action-btn registration-action-btn--secondary"
          disabled={disabled || cancelling || !canCancel}
          onClick={(event) => void handleCancel(event)}
          type="button"
          variant="secondary"
        >
          {cancelling ? 'Cancelling...' : canCancel ? 'Cancel' : 'Cancel unavailable'}
        </Button>
      ) : null}
    </span>
  );
}
