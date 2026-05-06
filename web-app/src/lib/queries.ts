import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, apiRequest } from './api';
import { getActivityById, searchActivities } from './activities';
import {
  cancelParticipation,
  createParticipation,
  listParticipations,
  normalizeParticipationRecord,
  respondToAssignedParticipation,
} from './participations';
import { queryKeys } from './queryKeys';
import { emitParticipationSync } from './realtimeSync';
import { listActivityTimeline } from './timeline';
import type { ActivityRecord, ActivityStatus } from '../types/activity';
import type { ParticipationRecord, ParticipationStatus } from '../types/participation';

export interface BrowseActivitiesParams {
  status?: ActivityStatus | 'all';
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  skill?: string;
  location?: string;
  limit?: number;
}

interface ActivityViewerContextResponse {
  activity: ActivityRecord;
  participation: ParticipationRecord | null;
  organizer?: ActivityViewerPersonSummary | null;
  currentParticipants?: number | null;
  participantPreview?: ActivityViewerPersonSummary[] | null;
}

export interface ActivityViewerPersonSummary {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface ActivityViewerContext {
  activity: ActivityRecord;
  participation: ParticipationRecord | null;
  organizer: ActivityViewerPersonSummary | null;
  currentParticipants: number | null;
  participantPreview: ActivityViewerPersonSummary[];
}

async function fetchActivityViewerContext(
  accessToken: string,
  activityId: string
): Promise<ActivityViewerContext> {
  try {
    const response = await apiRequest<ActivityViewerContextResponse>(`/activities/${activityId}/viewer`, {
      accessToken,
    });

    return {
      activity: response.activity,
      participation: response.participation ? normalizeParticipationRecord(response.participation) : null,
      organizer: response.organizer ?? null,
      currentParticipants:
        typeof response.currentParticipants === 'number' && Number.isFinite(response.currentParticipants)
          ? Math.max(0, Math.trunc(response.currentParticipants))
          : null,
      participantPreview: Array.isArray(response.participantPreview) ? response.participantPreview : [],
    };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      throw error;
    }

    const activity = await getActivityById(activityId, accessToken);
    const rows = await listParticipations({
      accessToken,
      mine: true,
      activityId,
      limit: 1,
    });

    return {
      activity,
      participation: rows[0] ?? null,
      organizer: null,
      currentParticipants: null,
      participantPreview: [],
    };
  }
}

function toParticipationByActivity(rows: ParticipationRecord[]): Record<string, ParticipationRecord> {
  const result: Record<string, ParticipationRecord> = {};

  for (const row of rows) {
    const activityId = row.activityId ?? row.activity_id ?? null;
    if (!activityId) {
      continue;
    }
    result[activityId] = row;
  }

  return result;
}

export function useBrowseActivitiesQuery(accessToken: string | null | undefined, params: BrowseActivitiesParams) {
  return useQuery<ActivityRecord[]>({
    queryKey: queryKeys.activity.browse({
      status: params.status ?? 'all',
      keyword: params.keyword ?? '',
      dateFrom: params.dateFrom ?? '',
      dateTo: params.dateTo ?? '',
      skill: params.skill ?? '',
      location: params.location ?? '',
      limit: params.limit ?? 60,
    }),
    queryFn: async () => {
      if (!accessToken) {
        throw new Error('No active session token.');
      }
      return searchActivities({
        accessToken,
        status: params.status,
        keyword: params.keyword,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        skill: params.skill,
        location: params.location,
        limit: params.limit ?? 60,
      });
    },
    enabled: Boolean(accessToken),
    placeholderData: (previous: ActivityRecord[] | undefined) => previous,
  });
}

export function useParticipationMineQuery(
  accessToken: string | null | undefined,
  userId: string | null | undefined,
  options: { activityId?: string; status?: ParticipationStatus | 'all'; limit?: number } = {}
) {
  return useQuery<ParticipationRecord[]>({
    queryKey: queryKeys.participation.list({
      userId: userId ?? '',
      activityId: options.activityId ?? '',
      status: options.status ?? 'all',
      limit: options.limit ?? 250,
      mine: true,
    }),
    queryFn: async () => {
      if (!accessToken) {
        throw new Error('No active session token.');
      }
      return listParticipations({
        accessToken,
        mine: true,
        activityId: options.activityId,
        status: options.status ?? 'all',
        limit: options.limit ?? 250,
      });
    },
    enabled: Boolean(accessToken && userId),
    placeholderData: (previous: ParticipationRecord[] | undefined) => previous,
  });
}

export function useParticipationByActivityQuery(
  accessToken: string | null | undefined,
  userId: string | null | undefined,
  enabled = true
) {
  return useQuery<Record<string, ParticipationRecord>>({
    queryKey: queryKeys.participation.mine(userId ?? ''),
    queryFn: async () => {
      if (!accessToken) {
        throw new Error('No active session token.');
      }
      const participations = await listParticipations({
        accessToken,
        mine: true,
        limit: 250,
      });
      return toParticipationByActivity(participations);
    },
    enabled: Boolean(accessToken && userId && enabled),
    placeholderData: (previous: Record<string, ParticipationRecord> | undefined) => previous,
  });
}

export function useActivityDetailQuery(accessToken: string | null | undefined, activityId: string | null | undefined) {
  return useQuery<ActivityRecord>({
    queryKey: queryKeys.activity.detail(activityId ?? ''),
    queryFn: async () => {
      if (!accessToken) {
        throw new Error('No active session token.');
      }
      if (!activityId) {
        throw new Error('Missing activity id.');
      }
      return getActivityById(activityId, accessToken);
    },
    enabled: Boolean(accessToken && activityId),
    placeholderData: (previous: ActivityRecord | undefined) => previous,
  });
}

export function useActivityViewerContextQuery(
  accessToken: string | null | undefined,
  activityId: string | null | undefined
) {
  return useQuery<ActivityViewerContext>({
    queryKey: ['activity', 'viewer', activityId ?? ''],
    queryFn: async () => {
      if (!accessToken) {
        throw new Error('No active session token.');
      }
      if (!activityId) {
        throw new Error('Missing activity id.');
      }
      return fetchActivityViewerContext(accessToken, activityId);
    },
    enabled: Boolean(accessToken && activityId),
    placeholderData: (previous: ActivityViewerContext | undefined) =>
      previous,
  });
}

export function useActivityTimelineQuery(accessToken: string | null | undefined, activityId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.activity.timeline(activityId ?? ''),
    queryFn: async () => {
      if (!accessToken) {
        throw new Error('No active session token.');
      }
      if (!activityId) {
        throw new Error('Missing activity id.');
      }
      return listActivityTimeline(activityId, accessToken);
    },
    enabled: Boolean(accessToken && activityId),
    placeholderData: (
      previous:
        | {
            milestones: import('../types/timeline').TimelineMilestone[];
            integration: import('../types/timeline').TimelineIntegrationMeta;
          }
        | undefined
    ) => previous,
  });
}

export function usePrefetchActivityDetail(accessToken: string | null | undefined, userId: string | null | undefined) {
  const queryClient = useQueryClient();

  return async (activityId: string) => {
    if (!accessToken || !activityId) {
      return;
    }

    await Promise.allSettled([
      queryClient.prefetchQuery({
        queryKey: ['activity', 'viewer', activityId],
        queryFn: () => fetchActivityViewerContext(accessToken, activityId),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.activity.timeline(activityId),
        queryFn: () => listActivityTimeline(activityId, accessToken),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.activity.detail(activityId),
        queryFn: () => getActivityById(activityId, accessToken),
      }),
      userId
        ? queryClient.prefetchQuery({
            queryKey: queryKeys.participation.mineByActivity(userId, activityId),
            queryFn: async () => {
              const rows = await listParticipations({
                accessToken,
                mine: true,
                activityId,
                limit: 1,
              });
              return rows[0] ?? null;
            },
          })
        : Promise.resolve(),
    ]);
  };
}

export function useRegistrationMutations(accessToken: string | null | undefined, userId: string | null | undefined) {
  const queryClient = useQueryClient();
  type CacheContext = {
    previousSingle: ParticipationRecord | null;
    previousMap: Record<string, ParticipationRecord> | null;
    previousViewer: ActivityViewerContext | undefined;
  };

  const patchViewerParticipationCache = (activityId: string, participation: ParticipationRecord | null) => {
    queryClient.setQueryData<ActivityViewerContext>(
      ['activity', 'viewer', activityId],
      (current: ActivityViewerContext | undefined) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          participation,
        };
      }
    );
  };

  const patchParticipationCaches = (activityId: string, participation: ParticipationRecord | null) => {
    patchViewerParticipationCache(activityId, participation);

    if (userId) {
      queryClient.setQueryData<Record<string, ParticipationRecord>>(
        queryKeys.participation.mine(userId),
        (current: Record<string, ParticipationRecord> | undefined) => {
          const next = { ...(current ?? {}) };
          if (participation) {
            next[activityId] = participation;
          } else {
            delete next[activityId];
          }
          return next;
        }
      );

      queryClient.setQueryData(queryKeys.participation.mineByActivity(userId, activityId), participation);
    }
  };

  const registerMutation = useMutation<
    { participation: ParticipationRecord; created: boolean; message?: string },
    Error,
    { activityId: string; recommendationItemId?: string | null },
    CacheContext
  >({
    mutationFn: async ({ activityId, recommendationItemId }: { activityId: string; recommendationItemId?: string | null }) => {
      if (!accessToken) {
        throw new Error('No active session token.');
      }
      return createParticipation(activityId, accessToken, { recommendationItemId });
    },
    onMutate: async ({ activityId }) => {
      if (!userId) {
        return { previousSingle: null, previousMap: null, previousViewer: undefined } satisfies CacheContext;
      }

      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.participation.mineByActivity(userId, activityId) }),
        queryClient.cancelQueries({ queryKey: queryKeys.participation.mine(userId) }),
      ]);

      const previousSingle = queryClient.getQueryData<ParticipationRecord | null>(
        queryKeys.participation.mineByActivity(userId, activityId)
      ) ?? null;
      const previousMap =
        queryClient.getQueryData<Record<string, ParticipationRecord>>(queryKeys.participation.mine(userId)) ?? null;
      const previousViewer = queryClient.getQueryData<ActivityViewerContext>([
        'activity',
        'viewer',
        activityId,
      ]);

      const optimistic = normalizeParticipationRecord({
        id: previousSingle?.id ?? previousSingle?.participationId ?? `optimistic-${activityId}`,
        participationId: previousSingle?.participationId ?? `optimistic-${activityId}`,
        activityId,
        activity_id: activityId,
        status: 'pending',
        activityName: previousSingle?.activityName ?? 'Pending activity',
        organization: previousSingle?.organization ?? 'Organizer',
        date: new Date().toISOString(),
      } as ParticipationRecord);

      patchParticipationCaches(activityId, optimistic);
      return { previousSingle, previousMap, previousViewer };
    },
    onError: (_error, variables, context) => {
      queryClient.setQueryData(['activity', 'viewer', variables.activityId], context?.previousViewer);
      if (!userId) {
        return;
      }
      queryClient.setQueryData(queryKeys.participation.mineByActivity(userId, variables.activityId), context?.previousSingle ?? null);
      queryClient.setQueryData(queryKeys.participation.mine(userId), context?.previousMap ?? {});
    },
    onSuccess: (result, variables) => {
      patchParticipationCaches(variables.activityId, result.participation);
      emitParticipationSync(variables.activityId);
    },
    onSettled: (_result, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['activity', 'viewer', variables.activityId] });
      if (!userId) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.participation.mineByActivity(userId, variables.activityId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.participation.mine(userId) });
    },
  });

  const cancelMutation = useMutation<
    ParticipationRecord,
    Error,
    { activityId: string },
    CacheContext
  >({
    mutationFn: async ({ activityId }: { activityId: string }) => {
      if (!accessToken) {
        throw new Error('No active session token.');
      }
      return cancelParticipation(activityId, accessToken);
    },
    onMutate: async ({ activityId }) => {
      if (!userId) {
        return { previousSingle: null, previousMap: null, previousViewer: undefined } satisfies CacheContext;
      }
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.participation.mineByActivity(userId, activityId) }),
        queryClient.cancelQueries({ queryKey: queryKeys.participation.mine(userId) }),
      ]);

      const previousSingle = queryClient.getQueryData<ParticipationRecord | null>(
        queryKeys.participation.mineByActivity(userId, activityId)
      ) ?? null;
      const previousMap =
        queryClient.getQueryData<Record<string, ParticipationRecord>>(queryKeys.participation.mine(userId)) ?? null;
      const previousViewer = queryClient.getQueryData<ActivityViewerContext>([
        'activity',
        'viewer',
        activityId,
      ]);

      patchParticipationCaches(
        activityId,
        previousSingle
          ? ({
              ...previousSingle,
              status: 'cancelled',
            } as ParticipationRecord)
          : null
      );

      return { previousSingle, previousMap, previousViewer };
    },
    onError: (_error, variables, context) => {
      queryClient.setQueryData(['activity', 'viewer', variables.activityId], context?.previousViewer);
      if (!userId) {
        return;
      }
      queryClient.setQueryData(queryKeys.participation.mineByActivity(userId, variables.activityId), context?.previousSingle ?? null);
      queryClient.setQueryData(queryKeys.participation.mine(userId), context?.previousMap ?? {});
    },
    onSuccess: (result, variables) => {
      patchParticipationCaches(variables.activityId, result);
      emitParticipationSync(variables.activityId);
    },
    onSettled: (_result, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['activity', 'viewer', variables.activityId] });
      if (!userId) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.participation.mineByActivity(userId, variables.activityId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.participation.mine(userId) });
    },
  });

  const respondMutation = useMutation<
    { registration: ParticipationRecord; message?: string },
    Error,
    { participationId: string; decision: 'accept' | 'decline'; activityId?: string | null },
    CacheContext & { activityId: string | null }
  >({
    mutationFn: async ({
      participationId,
      decision,
    }: {
      participationId: string;
      decision: 'accept' | 'decline';
      activityId?: string | null;
    }) => {
      if (!accessToken) {
        throw new Error('No active session token.');
      }
      return respondToAssignedParticipation(participationId, decision, accessToken);
    },
    onMutate: async ({ participationId, decision, activityId: hintedActivityId }) => {
      let activityId = String(hintedActivityId ?? '').trim() || null;
      let previousSingle: ParticipationRecord | null = null;
      let previousMap: Record<string, ParticipationRecord> | null = null;
      let previousViewer:
        | ActivityViewerContext
        | undefined;

      if (userId) {
        previousMap = queryClient.getQueryData<Record<string, ParticipationRecord>>(queryKeys.participation.mine(userId)) ?? null;
        if (!activityId && previousMap) {
          const matched = Object.values(previousMap).find((item) => {
            const existingParticipationId = String(item.participationId ?? item.id ?? '').trim();
            return existingParticipationId.length > 0 && existingParticipationId === participationId;
          });
          activityId = matched?.activityId ?? matched?.activity_id ?? null;
        }
      }

      if (activityId && userId) {
        await Promise.all([
          queryClient.cancelQueries({ queryKey: queryKeys.participation.mineByActivity(userId, activityId) }),
          queryClient.cancelQueries({ queryKey: queryKeys.participation.mine(userId) }),
          queryClient.cancelQueries({ queryKey: ['activity', 'viewer', activityId] }),
        ]);
        previousSingle =
          queryClient.getQueryData<ParticipationRecord | null>(queryKeys.participation.mineByActivity(userId, activityId)) ?? null;
      } else if (activityId) {
        await queryClient.cancelQueries({ queryKey: ['activity', 'viewer', activityId] });
      }

      if (activityId) {
        previousViewer = queryClient.getQueryData<ActivityViewerContext>([
          'activity',
          'viewer',
          activityId,
        ]);
      }

      if (activityId) {
        const current = previousSingle ?? previousViewer?.participation ?? null;
        if (current) {
          const optimisticStatus = decision === 'accept' ? 'approved' : 'cancelled';
          patchParticipationCaches(
            activityId,
            normalizeParticipationRecord({
              ...current,
              status: optimisticStatus,
            } as ParticipationRecord)
          );
        }
      }

      return { previousSingle, previousMap, previousViewer, activityId };
    },
    onError: (_error, _variables, context) => {
      const activityId = context?.activityId ?? null;
      if (userId && activityId) {
        queryClient.setQueryData(queryKeys.participation.mineByActivity(userId, activityId), context?.previousSingle ?? null);
        queryClient.setQueryData(queryKeys.participation.mine(userId), context?.previousMap ?? {});
      }
      if (activityId) {
        queryClient.setQueryData(['activity', 'viewer', activityId], context?.previousViewer);
      }
    },
    onSuccess: (result) => {
      const updated = result.registration;
      const activityId = updated.activityId ?? updated.activity_id ?? null;
      if (!activityId) {
        return;
      }
      patchParticipationCaches(activityId, updated);
      emitParticipationSync(activityId);
    },
    onSettled: (_result, _error, variables, context) => {
      const activityId = String(variables.activityId ?? context?.activityId ?? '').trim();
      if (!activityId) {
        return;
      }
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.participation.mineByActivity(userId, activityId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.participation.mine(userId) });
      }
      void queryClient.invalidateQueries({ queryKey: ['activity', 'viewer', activityId] });
    },
  });

  return {
    registerMutation,
    cancelMutation,
    respondMutation,
  };
}
