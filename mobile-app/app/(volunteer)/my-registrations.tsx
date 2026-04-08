import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/features/auth';
import {
  fetchMyParticipations,
  fetchParticipationHistory,
  type EnrichedParticipation,
  type ParticipationHistoryEntry,
  type ParticipationStatusFilter,
} from '@/src/features/participations';
import { ThemedText } from '@/src/shared/ui/themed-text';

type ViewMode = 'status' | 'timeline';

type RegistrationListRow =
  | { kind: 'timeline'; key: string; entry: ParticipationHistoryEntry }
  | { kind: 'status'; key: string; entry: EnrichedParticipation };

const STATUS_CHIPS: { label: string; value: ParticipationStatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Checked in', value: 'checked_in' },
];

function formatActivityDate(iso: string | null | undefined): string {
  if (!iso) return 'Date TBD';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date TBD';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function rawStatusLabel(status: string | undefined): string {
  const s = String(status ?? '').toLowerCase();
  if (!s) return 'Unknown';
  return s.replace(/_/g, ' ');
}

function rawStatusStyle(status: string | undefined): { bg: string; fg: string } {
  const s = String(status ?? '').toLowerCase();
  if (s === 'approved') return { bg: '#d1fae5', fg: '#047857' };
  if (s === 'pending' || s === 'assigned') return { bg: '#fef3c7', fg: '#b45309' };
  if (s === 'rejected') return { bg: '#fee2e2', fg: '#b91c1c' };
  if (s === 'checked_in') return { bg: '#dbeafe', fg: '#1d4ed8' };
  if (s === 'cancelled') return { bg: '#f3f4f6', fg: '#4b5563' };
  return { bg: '#eef2f2', fg: '#374151' };
}

function timelineStatusStyle(status: string): { bg: string; fg: string } {
  const s = status.toLowerCase();
  if (s === 'completed') return { bg: '#d1fae5', fg: '#047857' };
  if (s === 'cancelled') return { bg: '#fee2e2', fg: '#b91c1c' };
  return { bg: '#e0f2fe', fg: '#0369a1' };
}

export default function MyRegistrationsScreen() {
  const { user, status: authStatus } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('status');
  const [statusFilter, setStatusFilter] = useState<ParticipationStatusFilter>('all');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participations, setParticipations] = useState<EnrichedParticipation[]>([]);
  const [history, setHistory] = useState<ParticipationHistoryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  const load = useCallback(
    async (mode: 'full' | 'background' = 'full') => {
      if (!user?.id) {
        setParticipations([]);
        setHistory([]);
        setLoadState('ready');
        return;
      }

      if (mode === 'full') {
        setLoadState('loading');
      } else {
        setRefreshing(true);
      }
      setErrorMessage(null);

      try {
        if (viewMode === 'timeline') {
          const rows = await fetchParticipationHistory(80);
          setHistory(rows);
          setParticipations([]);
        } else {
          const rows = await fetchMyParticipations({
            status: statusFilter,
            limit: 120,
          });
          setParticipations(rows);
          setHistory([]);
        }
        setLoadState('ready');
        hasLoadedOnceRef.current = true;
      } catch (error) {
        setLoadState('error');
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load registrations.');
      } finally {
        if (mode === 'background') {
          setRefreshing(false);
        }
      }
    },
    [user?.id, viewMode, statusFilter],
  );

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (authStatus !== 'authenticated' || !user?.id) {
      setLoadState('ready');
      setParticipations([]);
      setHistory([]);
      hasLoadedOnceRef.current = false;
      return;
    }
    void load(hasLoadedOnceRef.current ? 'background' : 'full');
  }, [authStatus, user?.id, viewMode, statusFilter, load]);

  const onRefresh = useCallback(async () => {
    await load('background');
  }, [load]);

  const openActivity = useCallback((activityId: string) => {
    router.push(`/(volunteer)/activity/${activityId}`);
  }, []);

  if (authStatus === 'loading') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#00AEEF" />
        </View>
      </SafeAreaView>
    );
  }

  if (authStatus !== 'authenticated' || !user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ThemedText type="defaultSemiBold" style={styles.emptyTitle}>
            Sign in to view registrations
          </ThemedText>
          <ThemedText style={styles.emptyHint}>Your activity sign-ups and statuses appear here.</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'loading') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#00AEEF" />
          <ThemedText style={styles.statusHint}>Loading your registrations...</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'error') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ThemedText type="defaultSemiBold" style={styles.emptyTitle}>
            Something went wrong
          </ThemedText>
          <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
          <Pressable style={styles.retryButton} onPress={() => void load('full')}>
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const listData: RegistrationListRow[] =
    viewMode === 'timeline'
      ? history.map((h) => ({ kind: 'timeline' as const, key: h.participationId, entry: h }))
      : participations.map((p) => ({ kind: 'status' as const, key: p.id, entry: p }));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList<RegistrationListRow>
        data={listData}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#00AEEF" />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ThemedText type="title" style={styles.screenTitle}>
              My registrations
            </ThemedText>
            <ThemedText style={styles.screenSubtitle}>
              Registration status from the server, plus a timeline by activity state
            </ThemedText>

            <View style={styles.segmentRow}>
              <Pressable
                onPress={() => setViewMode('status')}
                style={[styles.segment, viewMode === 'status' ? styles.segmentActive : styles.segmentInactive]}
              >
                <ThemedText style={viewMode === 'status' ? styles.segmentTextActive : styles.segmentText}>
                  By status
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setViewMode('timeline')}
                style={[styles.segment, viewMode === 'timeline' ? styles.segmentActive : styles.segmentInactive]}
              >
                <ThemedText style={viewMode === 'timeline' ? styles.segmentTextActive : styles.segmentText}>
                  Timeline
                </ThemedText>
              </Pressable>
            </View>

            {viewMode === 'status' ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {STATUS_CHIPS.map((chip) => {
                  const active = statusFilter === chip.value;
                  return (
                    <Pressable
                      key={chip.value}
                      onPress={() => setStatusFilter(chip.value)}
                      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
                    >
                      <ThemedText style={active ? styles.chipTextActive : styles.chipText}>{chip.label}</ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <ThemedText type="defaultSemiBold" style={styles.emptyTitle}>
              No registrations yet
            </ThemedText>
            <ThemedText style={styles.emptyHint}>
              Explore activities and register — pending and approved requests show here.
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'timeline') {
            const h = item.entry;
            const tl = timelineStatusStyle(h.status);
            return (
              <Pressable
                style={styles.card}
                onPress={() => openActivity(h.activityId)}
                accessibilityRole="button"
              >
                <View style={styles.cardTop}>
                  <ThemedText type="defaultSemiBold" style={styles.cardTitle} numberOfLines={2}>
                    {h.activityName}
                  </ThemedText>
                  <View style={[styles.badge, { backgroundColor: tl.bg }]}>
                    <ThemedText style={[styles.badgeText, { color: tl.fg }]}>{h.status}</ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.orgText}>{h.organization}</ThemedText>
                <ThemedText style={styles.dateText}>{formatActivityDate(h.date)}</ThemedText>
                {h.activityDeleted ? (
                  <ThemedText style={styles.deletedHint}>This activity was removed by the organizer.</ThemedText>
                ) : null}
              </Pressable>
            );
          }

          const p = item.entry;
          const st = rawStatusStyle(p.status);
          const title = p.activityName ?? 'Activity';
          const org = p.organization ?? '';
          return (
            <Pressable
              style={styles.card}
              onPress={() => openActivity(p.activity_id)}
              accessibilityRole="button"
            >
              <View style={styles.cardTop}>
                <ThemedText type="defaultSemiBold" style={styles.cardTitle} numberOfLines={2}>
                  {title}
                </ThemedText>
                <View style={[styles.badge, { backgroundColor: st.bg }]}>
                  <ThemedText style={[styles.badgeText, { color: st.fg }]}>
                    {rawStatusLabel(p.status)}
                  </ThemedText>
                </View>
              </View>
              {org ? <ThemedText style={styles.orgText}>{org}</ThemedText> : null}
              <ThemedText style={styles.dateText}>{formatActivityDate(p.date)}</ThemedText>
              {typeof p.ai_match_score === 'number' ? (
                <ThemedText style={styles.matchText}>
                  Match score: {Math.round(p.ai_match_score * 100)}%
                </ThemedText>
              ) : null}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  listContent: {
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  headerBlock: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  screenTitle: {
    fontSize: 32,
    letterSpacing: -0.5,
    color: '#0f172a',
  },
  screenSubtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    color: '#64748b',
  },
  segmentRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#7dd3fc',
  },
  segmentInactive: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  segmentTextActive: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0369a1',
  },
  chipsRow: {
    marginTop: 12,
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    marginRight: 8,
  },
  chipIdle: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipActive: {
    backgroundColor: '#0f766e',
    borderWidth: 1,
    borderColor: '#0f766e',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    color: '#0f172a',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  orgText: {
    marginTop: 6,
    fontSize: 14,
    color: '#64748b',
  },
  dateText: {
    marginTop: 4,
    fontSize: 13,
    color: '#475569',
  },
  matchText: {
    marginTop: 6,
    fontSize: 13,
    color: '#0f766e',
    fontWeight: '600',
  },
  deletedHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#b91c1c',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  statusHint: {
    marginTop: 12,
    fontSize: 15,
    color: '#64748b',
  },
  emptyWrap: {
    paddingVertical: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    color: '#0f172a',
    textAlign: 'center',
  },
  emptyHint: {
    marginTop: 8,
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: '#b91c1c',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#0f766e',
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
