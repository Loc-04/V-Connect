import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  deleteActivity,
  listActivities,
  type ActivityRecord,
  type ActivityStatus,
} from '@/src/features/organizer-activities';
import { ROUTES } from '@/src/shared/constants/route-constants';
import { ThemedText } from '@/src/shared/ui/themed-text';

type LoadState = 'loading' | 'ready' | 'error';

const STATUS_FILTERS: { label: string; value: ActivityStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusBadgeStyle(status: ActivityStatus) {
  switch (status) {
    case 'published':
      return { bg: '#d1fae5', text: '#16a34a' };
    case 'draft':
      return { bg: '#fef3c7', text: '#b45309' };
    case 'completed':
      return { bg: '#dbeafe', text: '#2563eb' };
    case 'cancelled':
      return { bg: '#e5e7eb', text: '#4b5563' };
    default:
      return { bg: '#e5e7eb', text: '#4b5563' };
  }
}

export default function OrganizerEventsScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ActivityStatus | 'all'>('all');

  const loadActivities = useCallback(async () => {
    setState('loading');
    setErrorMsg(null);
    try {
      const data = await listActivities({
        mine: true,
        status: statusFilter,
        search: search.trim() || undefined,
        limit: 100,
      });
      setActivities(data);
      setState('ready');
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load activities.');
    }
  }, [statusFilter, search]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const handleDelete = useCallback(
    (item: ActivityRecord) => {
      Alert.alert('Delete Activity', `Are you sure you want to delete "${item.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteActivity(item.id);
              setActivities((prev) => prev.filter((a) => a.id !== item.id));
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Delete failed.');
            }
          },
        },
      ]);
    },
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: ActivityRecord }) => {
      const badge = statusBadgeStyle(item.status);
      return (
        <Pressable
          style={styles.activityCard}
          onPress={() =>
            router.push({ pathname: ROUTES.ORGANIZER.ACTIVITY_DETAIL, params: { id: item.id } })
          }
        >
          <View style={styles.activityIconWrap}>
            <MaterialIcons name="event-note" size={22} color="#0f766e" />
          </View>
          <View style={styles.activityContent}>
            <View style={styles.activityTopRow}>
              <ThemedText type="defaultSemiBold" style={styles.activityTitle} numberOfLines={1}>
                {item.title}
              </ThemedText>
              <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                <ThemedText style={[styles.badgeText, { color: badge.text }]}>
                  {item.status.toUpperCase()}
                </ThemedText>
              </View>
            </View>
            <View style={styles.metaRow}>
              <MaterialIcons name="schedule" size={14} color="#6b7280" />
              <ThemedText style={styles.metaText}>{formatDate(item.start_time)}</ThemedText>
              <MaterialIcons name="groups" size={14} color="#6b7280" style={{ marginLeft: 10 }} />
              <ThemedText style={styles.metaText}>{item.capacity} cap.</ThemedText>
            </View>
          </View>
          <Pressable hitSlop={8} onPress={() => handleDelete(item)} style={styles.deleteBtn}>
            <MaterialIcons name="delete-outline" size={20} color="#dc2626" />
          </Pressable>
        </Pressable>
      );
    },
    [handleDelete],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <ThemedText style={styles.topBarTitle}>My Activities</ThemedText>
        <Pressable
          style={styles.createButton}
          onPress={() => router.push(ROUTES.ORGANIZER.ACTIVITY_NEW)}
        >
          <MaterialIcons name="add" size={18} color="#ffffff" />
          <ThemedText style={styles.createButtonText}>Create</ThemedText>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <MaterialIcons name="search" size={18} color="#6b7280" />
          <TextInput
            placeholder="Search activities..."
            placeholderTextColor="#9ca3af"
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => {
          const active = f.value === statusFilter;
          return (
            <Pressable
              key={f.value}
              style={[styles.filterTab, active && styles.filterTabActive]}
              onPress={() => setStatusFilter(f.value)}
            >
              <ThemedText
                numberOfLines={1}
                style={[styles.filterTabText, active && styles.filterTabTextActive]}
              >
                {f.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {state === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0f8a8a" />
          <ThemedText style={styles.statusText}>Loading activities...</ThemedText>
        </View>
      ) : state === 'error' ? (
        <View style={styles.centered}>
          <ThemedText style={styles.errorText}>{errorMsg}</ThemedText>
          <Pressable style={styles.retryButton} onPress={() => void loadActivities()}>
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </Pressable>
        </View>
      ) : activities.length === 0 ? (
        <View style={styles.centered}>
          <MaterialIcons name="event-busy" size={48} color="#d1d5db" />
          <ThemedText style={styles.emptyText}>No activities found.</ThemedText>
          <ThemedText style={styles.emptySubText}>
            Tap &quot;Create&quot; to add your first activity.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  topBarTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0f8a8a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  createButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  searchRow: {
    marginBottom: 10,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1f2937',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 12,
    alignSelf: 'flex-start',
  },
  filterTab: {
    minWidth: 92,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: '#0f8a8a',
    borderColor: '#0f8a8a',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
  },
  filterTabTextActive: {
    color: '#ffffff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
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
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  emptySubText: {
    marginTop: 4,
    fontSize: 14,
    color: '#9ca3af',
  },
  listContent: {
    paddingBottom: 28,
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
  badge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#4b5563',
  },
  deleteBtn: {
    padding: 6,
  },
});
