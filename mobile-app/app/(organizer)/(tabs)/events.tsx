import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Picker } from '@react-native-picker/picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  listActivities,
  type ActivityRecord,
  type ActivityStatus,
} from '@/src/features/organizer-activities';
import { ROUTES } from '@/src/shared/constants/route-constants';
import { ThemedText } from '@/src/shared/ui/themed-text';

type LoadState = 'loading' | 'ready' | 'error';

const STATUS_FILTERS: { label: string; value: ActivityStatus | 'all' }[] = [
  { label: 'All Status', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const MONTH_FILTERS: { label: string; value: string }[] = [
  { label: 'All Month', value: 'all' },
  { label: 'January', value: '0' },
  { label: 'February', value: '1' },
  { label: 'March', value: '2' },
  { label: 'April', value: '3' },
  { label: 'May', value: '4' },
  { label: 'June', value: '5' },
  { label: 'July', value: '6' },
  { label: 'August', value: '7' },
  { label: 'September', value: '8' },
  { label: 'October', value: '9' },
  { label: 'November', value: '10' },
  { label: 'December', value: '11' },
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
  const [monthFilter, setMonthFilter] = useState<string>('all');

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

  const visibleActivities = useMemo(() => {
    if (monthFilter === 'all') {
      return activities;
    }

    const month = Number(monthFilter);
    return activities.filter((activity) => new Date(activity.start_time).getMonth() === month);
  }, [activities, monthFilter]);

  const renderItem = useCallback(
    ({ item }: { item: ActivityRecord }) => {
      const badge = statusBadgeStyle(item.status);
      return (
        <Pressable
          style={styles.activityCard}
          onPress={() =>
            router.push({
              pathname: ROUTES.ORGANIZER.ACTIVITY_DETAIL,
              params: { id: item.id, readOnly: '1' },
            })
          }
        >
          {item.cover_image_url ? (
            <Image source={{ uri: item.cover_image_url }} style={styles.coverImage} />
          ) : (
            <View style={styles.coverPlaceholder}>
              <MaterialIcons name="image" size={32} color="#d1d5db" />
            </View>
          )}
          <View style={styles.cardBody}>
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
        </Pressable>
      );
    },
    [],
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

      <View style={styles.filterBarRow}>
        <View style={styles.searchControl}>
          <View style={styles.searchInputWrap}>
            <MaterialIcons name="search" size={18} color="#6b7280" />
            <TextInput
              placeholder="Search..."
              placeholderTextColor="#9ca3af"
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>

        <View style={styles.filterControl}>

          <View style={styles.pickerWrap}>
            <Picker
              mode="dropdown"
              selectedValue={statusFilter}
              onValueChange={(value) => setStatusFilter(value as ActivityStatus | 'all')}
              style={styles.picker}
              dropdownIconColor="#4b5563"
            >
              {STATUS_FILTERS.map((filter) => (
                <Picker.Item key={filter.value} label={filter.label} value={filter.value} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.filterControl}>

          <View style={styles.pickerWrap}>
            <Picker
              mode="dropdown"
              selectedValue={monthFilter}
              onValueChange={(value) => setMonthFilter(String(value))}
              style={styles.picker}
              dropdownIconColor="#4b5563"
            >
              {MONTH_FILTERS.map((month) => (
                <Picker.Item key={month.value} label={month.label} value={month.value} />
              ))}
            </Picker>
          </View>
        </View>
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
      ) : visibleActivities.length === 0 ? (
        <View style={styles.centered}>
          <MaterialIcons name="event-busy" size={48} color="#d1d5db" />
          <ThemedText style={styles.emptyText}>No activities found.</ThemedText>
          <ThemedText style={styles.emptySubText}>
            Tap &quot;Create&quot; to add your first activity.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={visibleActivities}
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
  filterBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  searchControl: {
    width: '50%',
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 50,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1f2937',
  },
  filterControl: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#f9fafb',
  },
  picker: {
    height: 50,
    fontSize: 12,
    color: '#1f2937',
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
    marginBottom: 12,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: 140,
  },
  coverPlaceholder: {
    width: '100%',
    height: 100,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: 12,
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
});
