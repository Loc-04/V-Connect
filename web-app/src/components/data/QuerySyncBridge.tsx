import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onParticipationSync } from '../../lib/realtimeSync';
import { queryKeys } from '../../lib/queryKeys';

export function QuerySyncBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return onParticipationSync((activityId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.participation.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity.detail(activityId) });
      void queryClient.invalidateQueries({ queryKey: ['activity', 'viewer', activityId] });
    });
  }, [queryClient]);

  return null;
}
