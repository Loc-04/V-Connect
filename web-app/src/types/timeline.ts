export type TimelineMilestoneStatus = 'upcoming' | 'in_progress' | 'completed' | 'cancelled';

export type TimelineMilestoneType = 'opening' | 'session' | 'break' | 'closing' | 'other';

export interface TimelineMilestone {
  id: string;
  activityId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  orderIndex: number;
  type: TimelineMilestoneType;
  status: TimelineMilestoneStatus;
  createdAt: string;
  updatedAt: string;
  source: 'local_only' | 'server';
}

export interface TimelineMilestoneDraft {
  id?: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  orderIndex?: number;
  type: TimelineMilestoneType;
  status?: TimelineMilestoneStatus;
}

export interface TimelineValidationIssue {
  milestoneId?: string;
  field: 'title' | 'startTime' | 'endTime' | 'timeRange' | 'activityRange' | 'overlap' | 'general';
  level: 'error' | 'warning';
  message: string;
}

export interface TimelineIntegrationMeta {
  mode: 'server';
  pendingServerIntegration: boolean;
  message: string;
}
