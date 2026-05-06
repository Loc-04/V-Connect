export const queryKeys = {
  activity: {
    all: ['activity'] as const,
    detail: (activityId: string) => ['activity', 'detail', activityId] as const,
    timeline: (activityId: string) => ['activity', 'timeline', activityId] as const,
    browse: (params: Record<string, string | number | boolean | null | undefined>) =>
      ['activity', 'browse', params] as const,
  },
  participation: {
    all: ['participation'] as const,
    mine: (userId: string) => ['participation', 'mine', userId] as const,
    mineByActivity: (userId: string, activityId: string) =>
      ['participation', 'mine', userId, 'activity', activityId] as const,
    list: (params: Record<string, string | number | boolean | null | undefined>) =>
      ['participation', 'list', params] as const,
  },
} as const;

