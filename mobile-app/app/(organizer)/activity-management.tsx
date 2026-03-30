import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/src/features/auth';
import { getActivity } from '@/src/features/organizer-activities';
import { getOrganizerManagedActivities, type OrganizerManagedActivityItem } from '@/src/features/profile';
import { ROUTES } from '@/src/shared/constants/route-constants';
import { ThemedText } from '@/src/shared/ui/themed-text';

type LoadState = 'loading' | 'ready' | 'error';

function getActivityIcon(activityTitle: string): keyof typeof MaterialIcons.glyphMap {
  const name = activityTitle.toLowerCase();
  if (name.includes('park') || name.includes('clean') || name.includes('tree')) {
    return 'park';
  }
  if (name.includes('workshop') || name.includes('teach') || name.includes('class')) {
    return 'school';
  }
  return 'event-note';
}

function formatBadgeLabel(item: OrganizerManagedActivityItem): string {
  return item.badge === 'open' ? 'OPEN' : 'CLOSED';
}

export default function ActivityManagementScreen() {
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activities, setActivities] = useState<OrganizerManagedActivityItem[]>([]);

  const loadActivities = useCallback(async () => {
    if (!user?.id) {
      setState('error');
      setErrorMessage('Please sign in again to load activity management.');
      return;
    }

    setState('loading');
    setErrorMessage(null);
    try {
      const items = await getOrganizerManagedActivities(user.id, 100);
      setActivities(items);
      setState('ready');
    } catch (error) {
      setState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to load activity management right now.',
      );
    }
  }, [user?.id]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const handleActivityPress = useCallback(async (item: OrganizerManagedActivityItem) => {
    try {
      const detail = await getActivity(item.activityId);
      if (detail.status !== 'draft') {
        Alert.alert('Read Only', 'Only draft activities can be edited.');
        return;
      }
      router.push({ pathname: ROUTES.ORGANIZER.ACTIVITY_DETAIL, params: { id: item.activityId } });
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Unable to open activity.');
    }
  }, []);

  if (state === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f8a8a" />
        <ThemedText style={styles.statusText}>Loading activities...</ThemedText>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.centered}>
        <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
        <Pressable style={styles.retryButton} onPress={() => void loadActivities()}>
          <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.helperText}>
          Tap an activity to edit details. Only draft activities are editable.
        </ThemedText>

        {activities.length > 0 ? (
          activities.map((item) => (
            <Pressable
              key={item.activityId}
              style={styles.activityCard}
              onPress={() => void handleActivityPress(item)}
            >
              <View style={styles.activityIconWrap}>
                <MaterialIcons name={getActivityIcon(item.title)} size={22} color="#0f766e" />
              </View>
              <View style={styles.activityContent}>
                <View style={styles.activityTopRow}>
                  <ThemedText type="defaultSemiBold" style={styles.activityTitle}>
                    {item.title}
                  </ThemedText>
                  <View
                    style={[
                      styles.activityBadge,
                      item.badge === 'open' ? styles.badgeOpen : styles.badgeClosed,
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.activityBadgeText,
                        item.badge === 'open' ? styles.badgeOpenText : styles.badgeClosedText,
                      ]}
                    >
                      {formatBadgeLabel(item)}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.metaRow}>
                  <MaterialIcons name="groups" size={14} color="#6b7280" />
                  <ThemedText style={styles.metaText}>
                    {item.joinedVolunteers}/{item.capacity} Volunteers Joined
                  </ThemedText>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
            </Pressable>
          ))
        ) : (
          <ThemedText style={styles.emptyText}>No managed activities yet.</ThemedText>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#ffffff',
  },
  statusText: {
    marginTop: 12,
    opacity: 0.7,
  },
  errorText: {
    color: '#dc2626',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#0f766e',
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  helperText: {
    marginBottom: 12,
    color: '#4b5563',
    fontSize: 13,
  },
  activityCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eceff1',
    backgroundColor: '#f8faf9',
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  activityIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dff3ef',
  },
  activityContent: {
    flex: 1,
  },
  activityTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
  },
  activityTitle: {
    flex: 1,
    fontSize: 17,
    color: '#1f2937',
  },
  activityBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeOpen: {
    backgroundColor: '#d1fae5',
  },
  badgeClosed: {
    backgroundColor: '#e5e7eb',
  },
  activityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeOpenText: {
    color: '#16a34a',
  },
  badgeClosedText: {
    color: '#4b5563',
  },
  metaRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 14,
    color: '#4b5563',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
});
