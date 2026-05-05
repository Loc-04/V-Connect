export type ParticipationCheckInActionState = 'eligible' | 'already_checked_in' | 'blocked';

export function normalizeParticipationStatus(status?: string | null): string {
  return String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function canParticipationCheckIn(status?: string | null): boolean {
  return normalizeParticipationStatus(status) === 'approved';
}

export function getParticipationCheckInActionState(status?: string | null): ParticipationCheckInActionState {
  const normalizedStatus = normalizeParticipationStatus(status);
  if (normalizedStatus === 'approved') {
    return 'eligible';
  }
  if (normalizedStatus === 'checked_in') {
    return 'already_checked_in';
  }
  return 'blocked';
}

export function getParticipationCheckInActionLabel(status?: string | null): string {
  const normalizedStatus = normalizeParticipationStatus(status);

  if (normalizedStatus === 'approved') {
    return 'Check In';
  }
  if (normalizedStatus === 'checked_in') {
    return 'Checked In';
  }
  if (normalizedStatus === 'pending') {
    return 'Pending';
  }
  if (normalizedStatus === 'rejected') {
    return 'Rejected';
  }
  if (normalizedStatus === 'assigned') {
    return 'Assigned';
  }
  if (normalizedStatus === 'cancelled') {
    return 'Cancelled';
  }
  if (normalizedStatus === 'absent') {
    return 'Absent';
  }
  if (normalizedStatus === 'expired') {
    return 'Expired';
  }
  if (normalizedStatus === 'completed') {
    return 'Completed';
  }
  return 'Not Eligible';
}
