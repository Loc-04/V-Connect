import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { useAuth } from '@/src/features/auth';
import {
  categoryFromSkills,
  ExploreActivityCard,
  fetchVolunteerRecommendations,
  resolveExploreCoverUrl,
  formatDateRangeLine,
  formatLocationLine,
  type VolunteerRecommendationActivity,
} from '@/src/features/volunteer-explore';
import {
  fetchSkillOptions,
  listActivities,
  searchActivities,
  type SkillOption,
} from '@/src/features/organizer-activities';
import type { ActivityRecord } from '@/src/features/organizer-activities';
import {
  buildMyActivitiesSections,
  fetchMyParticipations,
  type EnrichedParticipation,
} from '@/src/features/participations';
import { ThemedText } from '@/src/shared/ui/themed-text';
import { supabase } from '@/lib/supabase';

const PRIMARY = '#00AEEF';

interface ActivityRow {
  id: string;
  title: string;
  categoryLabel: string;
  matchScore: number | null;
  matchExplanation: string | null;
  dateLine: string;
  locationLine: string;
  organizerName: string;
  imageUrl: string;
}

type DatePresetKey = 'all' | 'today' | 'week' | 'month';

interface DatePreset {
  key: DatePresetKey;
  label: string;
}

const DATE_PRESETS: DatePreset[] = [
  { key: 'all', label: 'All dates' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
];

const FALLBACK_SKILLS = [
  'Teaching',
  'Healthcare',
  'Environment',
  'Logistics',
  'Translation',
  'Cooking',
];

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getDatePresetRange(key: DatePresetKey): { dateFrom?: string; dateTo?: string } {
  if (key === 'all') return {};
  const now = new Date();
  if (key === 'today') {
    const today = toIsoDate(now);
    return { dateFrom: today, dateTo: today };
  }
  if (key === 'week') {
    const start = new Date(now);
    const day = start.getDay();
    const diffToMonday = (day + 6) % 7;
    start.setDate(start.getDate() - diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { dateFrom: toIsoDate(start), dateTo: toIsoDate(end) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { dateFrom: toIsoDate(start), dateTo: toIsoDate(end) };
}

function mapRecommendation(
  item: VolunteerRecommendationActivity,
  coverFromPublished?: string | null,
): ActivityRow {
  return {
    id: item.activityId,
    title: item.title,
    categoryLabel: categoryFromSkills(item.requiredSkills),
    matchScore: item.matchScore,
    matchExplanation: item.explanation,
    dateLine: formatDateRangeLine(item.startTime, item.endTime),
    locationLine: formatLocationLine(item.location),
    organizerName: item.organizerName,
    imageUrl: resolveExploreCoverUrl(
      item.activityId,
      coverFromPublished,
      item.cover_image_url,
    ),
  };
}

function mapPublishedActivity(
  activity: ActivityRecord,
  organizerNameMap: Map<string, string>,
): ActivityRow {
  const organizerName =
    (activity.organizer_id && organizerNameMap.get(activity.organizer_id)) || 'Organizer';
  return {
    id: activity.id,
    title: activity.title,
    categoryLabel: categoryFromSkills(activity.required_skills ?? []),
    matchScore: null,
    matchExplanation: null,
    dateLine: formatDateRangeLine(activity.start_time, activity.end_time),
    locationLine: formatLocationLine(activity.location),
    organizerName,
    imageUrl: resolveExploreCoverUrl(activity.id, activity.cover_image_url),
  };
}

interface PublicUserRow {
  id: string;
  full_name: string;
}

async function fetchOrganizerNames(organizerIds: string[]): Promise<Map<string, string>> {
  if (organizerIds.length === 0) return new Map();
  try {
    const result = await supabase.rpc('get_users_public_profiles', { p_user_ids: organizerIds });
    if (result.error) return new Map();
    const rows = (result.data ?? []) as PublicUserRow[];
    return new Map(rows.map((r) => [r.id, r.full_name]));
  } catch {
    return new Map();
  }
}

const STATUS_CHIP_STYLE: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e' },
  approved: { bg: '#d1fae5', text: '#065f46' },
  assigned: { bg: '#dbeafe', text: '#1e40af' },
  checked_in: { bg: '#ccfbf1', text: '#0f766e' },
  rejected: { bg: '#fee2e2', text: '#991b1b' },
  cancelled: { bg: '#f1f5f9', text: '#64748b' },
};

function statusChipStyle(status: string): { bg: string; text: string } {
  return STATUS_CHIP_STYLE[String(status).toLowerCase()] ?? { bg: '#f1f5f9', text: '#64748b' };
}

function formatMyActivityStatus(status: string): string {
  switch (String(status).toLowerCase()) {
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'assigned':
      return 'Assigned';
    case 'checked_in':
      return 'Checked in';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export default function HomeScreen() {
  const { user, status: authStatus, role } = useAuth();
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [myParticipations, setMyParticipations] = useState<EnrichedParticipation[]>([]);
  const [myActivitiesLoadState, setMyActivitiesLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [datePreset, setDatePreset] = useState<DatePresetKey>('all');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillOptions, setSkillOptions] = useState<string[]>(FALLBACK_SKILLS);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [keyword]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const opts: SkillOption[] = await fetchSkillOptions();
        if (cancelled) return;
        const names = opts
          .map((o) => o.skillName)
          .filter((n) => typeof n === 'string' && n.trim().length > 0)
          .slice(0, 12);
        if (names.length > 0) setSkillOptions(names);
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMyActivities = useCallback(async () => {
    if (role !== 'volunteer' || !user?.id) {
      setMyParticipations([]);
      setMyActivitiesLoadState('ready');
      return;
    }
    setMyActivitiesLoadState('loading');
    try {
      const data = await fetchMyParticipations({ status: 'all', limit: 50 });
      setMyParticipations(data);
      setMyActivitiesLoadState('ready');
    } catch {
      setMyActivitiesLoadState('error');
    }
  }, [role, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (authStatus === 'authenticated') {
        void loadMyActivities();
      }
    }, [authStatus, loadMyActivities]),
  );

  const myActivitiesSections = useMemo(
    () => buildMyActivitiesSections(myParticipations),
    [myParticipations],
  );

  const isFiltering = useMemo(
    () => debouncedKeyword.length > 0 || datePreset !== 'all' || selectedSkills.length > 0,
    [debouncedKeyword, datePreset, selectedSkills],
  );

  const loadDefault = useCallback(async () => {
    if (!user?.id) {
      setRows([]);
      setLoadState('ready');
      return;
    }

    setLoadState('loading');
    setErrorMessage(null);

    try {
      const [publishedResult, recResult] = await Promise.allSettled([
        listActivities({ status: 'published', limit: 80 }),
        fetchVolunteerRecommendations(user.id, 40),
      ]);

      let published: ActivityRecord[] = [];
      if (publishedResult.status === 'fulfilled') {
        published = publishedResult.value;
      }

      let recActivities: VolunteerRecommendationActivity[] = [];
      if (recResult.status === 'fulfilled') {
        recActivities = recResult.value.activities ?? [];
      }

      if (publishedResult.status === 'rejected' && recResult.status === 'rejected') {
        const err = publishedResult.reason;
        setErrorMessage(err instanceof Error ? err.message : 'Unable to load activities.');
        setLoadState('error');
        return;
      }

      if (published.length === 0) {
        setRows(recActivities.map((r) => mapRecommendation(r)));
        setLoadState('ready');
        return;
      }

      const publishedById = new Map(published.map((p) => [p.id, p]));
      const publishedIds = new Set(published.map((p) => p.id));
      const recIds = new Set(recActivities.map((r) => r.activityId));
      const merged: ActivityRow[] = [];
      const seen = new Set<string>();

      // Collect organizer IDs for activities not covered by recommendations
      const missingOrganizerIds = Array.from(
        new Set(
          published
            .filter((p) => !recIds.has(p.id) && p.organizer_id)
            .map((p) => p.organizer_id as string),
        ),
      );
      const organizerNameMap = await fetchOrganizerNames(missingOrganizerIds);

      for (const r of recActivities) {
        if (!publishedIds.has(r.activityId)) continue;
        const coverFromPublished = publishedById.get(r.activityId)?.cover_image_url ?? null;
        merged.push(mapRecommendation(r, coverFromPublished));
        seen.add(r.activityId);
      }

      for (const p of published) {
        if (seen.has(p.id)) continue;
        merged.push(mapPublishedActivity(p, organizerNameMap));
      }

      setRows(merged);
      setLoadState('ready');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unable to load activities.';
      setErrorMessage(msg);
      setLoadState('error');
    }
  }, [user?.id]);

  const loadFiltered = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(null);

    try {
      const range = getDatePresetRange(datePreset);
      const results = await searchActivities({
        keyword: debouncedKeyword || undefined,
        skills: selectedSkills.length > 0 ? selectedSkills : undefined,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        status: 'published',
        limit: 80,
      });

      const organizerIds = Array.from(
        new Set(results.filter((a) => a.organizer_id).map((a) => a.organizer_id as string)),
      );
      const organizerNameMap = await fetchOrganizerNames(organizerIds);

      setRows(results.map((a) => mapPublishedActivity(a, organizerNameMap)));
      setLoadState('ready');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unable to search activities.';
      setErrorMessage(msg);
      setLoadState('error');
    }
  }, [debouncedKeyword, datePreset, selectedSkills]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (authStatus !== 'authenticated' || !user?.id) {
      setLoadState('ready');
      setRows([]);
      return;
    }
    if (isFiltering) {
      void loadFiltered();
    } else {
      void loadDefault();
    }
  }, [authStatus, user?.id, isFiltering, loadFiltered, loadDefault]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      isFiltering ? loadFiltered() : loadDefault(),
      loadMyActivities(),
    ]);
    setRefreshing(false);
  }, [isFiltering, loadFiltered, loadDefault, loadMyActivities]);

  const openDetail = useCallback((id: string) => {
    router.push(`/(volunteer)/activity/${id}`);
  }, []);

  const toggleSkill = useCallback((skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  }, []);

  const resetFilters = useCallback(() => {
    setKeyword('');
    setDebouncedKeyword('');
    setDatePreset('all');
    setSelectedSkills([]);
  }, []);

  if (authStatus === 'loading') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  if (authStatus !== 'authenticated' || !user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ThemedText type="defaultSemiBold" style={styles.emptyTitle}>
            Sign in to view activities
          </ThemedText>
          <ThemedText style={styles.emptyHint}>Activities tailored to your profile appear here.</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  const myActivitiesNode =
    role === 'volunteer' ? (
      <View style={styles.myActivitiesSection}>
        <View style={styles.myActivitiesHeader}>
          <ThemedText type="defaultSemiBold" style={styles.myActivitiesTitle}>
            My Registrations
          </ThemedText>
          <Pressable
            onPress={() => router.push('/(volunteer)/my-registrations')}
            hitSlop={8}
            accessibilityLabel="View all my registrations">
            <ThemedText style={styles.myActivitiesViewAll}>View all</ThemedText>
          </Pressable>
        </View>

        {myActivitiesLoadState === 'loading' ? (
          <View style={styles.myActivitiesLoading}>
            <ActivityIndicator size="small" color={PRIMARY} />
          </View>
        ) : myActivitiesLoadState === 'error' ? (
          <View style={styles.myActivitiesEmpty}>
            <ThemedText style={styles.myActivitiesEmptyText}>Could not load registrations.</ThemedText>
            <Pressable onPress={() => void loadMyActivities()} hitSlop={8}>
              <ThemedText style={styles.myActivitiesRetry}>Retry</ThemedText>
            </Pressable>
          </View>
        ) : myActivitiesSections.upcoming.length === 0 ? (
          <View style={styles.myActivitiesEmpty}>
            <ThemedText style={styles.myActivitiesEmptyText}>No upcoming registrations.</ThemedText>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.myActivitiesScroll}>
            {myActivitiesSections.upcoming.map((item) => {
              const chip = statusChipStyle(item.status);
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [styles.myActivityCard, pressed && styles.myActivityCardPressed]}
                  onPress={() => router.push(`/(volunteer)/activity/${item.activity_id}`)}
                  accessibilityLabel={`Open ${item.activityName ?? 'activity'}`}>
                  <ThemedText type="defaultSemiBold" style={styles.myActivityName} numberOfLines={2}>
                    {item.activityName ?? 'Activity'}
                  </ThemedText>
                  {item.date ? (
                    <ThemedText style={styles.myActivityDate} numberOfLines={1}>
                      {new Date(item.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </ThemedText>
                  ) : null}
                  <View style={[styles.myActivityChip, { backgroundColor: chip.bg }]}>
                    <ThemedText style={[styles.myActivityChipText, { color: chip.text }]}>
                      {formatMyActivityStatus(item.status)}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    ) : null;

  const headerNode = (
    <View style={styles.header}>
      <ThemedText type="title" style={styles.screenTitle}>
        Activities
      </ThemedText>
      <ThemedText style={styles.screenSubtitle}>
        Search activities, filter by date or skill, and explore opportunities near you
      </ThemedText>

      {myActivitiesNode}

      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={20} color="#64748b" />
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          placeholder="Search by title, location, skill"
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {keyword.length > 0 ? (
          <Pressable onPress={() => setKeyword('')} hitSlop={8} accessibilityLabel="Clear search">
            <MaterialIcons name="close" size={18} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}>
        {DATE_PRESETS.map((preset) => {
          const active = preset.key === datePreset;
          return (
            <Pressable
              key={preset.key}
              onPress={() => setDatePreset(preset.key)}
              style={[styles.chip, active && styles.chipActive]}>
              <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                {preset.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}>
        {skillOptions.map((skill) => {
          const active = selectedSkills.includes(skill);
          return (
            <Pressable
              key={skill}
              onPress={() => toggleSkill(skill)}
              style={[styles.chip, active && styles.chipActive]}>
              <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                {skill}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {isFiltering ? (
        <Pressable onPress={resetFilters} style={styles.resetRow} hitSlop={8}>
          <MaterialIcons name="refresh" size={16} color={PRIMARY} />
          <ThemedText style={styles.resetText}>Reset filters</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );

  if (loadState === 'loading' && rows.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <FlatList
          data={[] as ActivityRow[]}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={headerNode}
          ListEmptyComponent={
            <View style={styles.centeredInline}>
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          }
          renderItem={() => null}
        />
      </SafeAreaView>
    );
  }

  if (loadState === 'error') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <FlatList
          data={[] as ActivityRow[]}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={headerNode}
          ListEmptyComponent={
            <View style={styles.centeredInline}>
              <ThemedText type="defaultSemiBold" style={styles.emptyTitle}>
                Something went wrong
              </ThemedText>
              <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
            </View>
          }
          renderItem={() => null}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={PRIMARY} />
        }
        ListHeaderComponent={headerNode}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <ThemedText type="defaultSemiBold" style={styles.emptyTitle}>
              {isFiltering ? 'No activities match your filters' : 'No upcoming activities'}
            </ThemedText>
            <ThemedText style={styles.emptyHint}>
              {isFiltering
                ? 'Try adjusting your search keyword, date or skills.'
                : 'Check back soon or update your availability in your profile.'}
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => (
          <ExploreActivityCard
            title={item.title}
            categoryLabel={item.categoryLabel}
            matchScore={item.matchScore}
            matchExplanation={item.matchExplanation}
            dateLine={item.dateLine}
            locationLine={item.locationLine}
            organizerName={item.organizerName}
            imageUrl={item.imageUrl}
            onPress={() => openDetail(item.id)}
          />
        )}
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
  },
  header: {
    paddingHorizontal: 22,
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
    marginBottom: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
    paddingVertical: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  chipText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  resetText: {
    fontSize: 13,
    color: PRIMARY,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  centeredInline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  emptyWrap: {
    paddingHorizontal: 32,
    paddingVertical: 48,
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
  myActivitiesSection: {
    marginBottom: 18,
  },
  myActivitiesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  myActivitiesTitle: {
    fontSize: 18,
    color: '#0f172a',
  },
  myActivitiesViewAll: {
    fontSize: 13,
    color: PRIMARY,
    fontWeight: '600',
  },
  myActivitiesLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  myActivitiesEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  myActivitiesEmptyText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  myActivitiesRetry: {
    fontSize: 13,
    color: PRIMARY,
    fontWeight: '600',
  },
  myActivitiesScroll: {
    gap: 10,
    paddingRight: 4,
    paddingBottom: 2,
  },
  myActivityCard: {
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
    justifyContent: 'space-between',
    minHeight: 100,
  },
  myActivityCardPressed: {
    opacity: 0.8,
  },
  myActivityName: {
    fontSize: 14,
    color: '#0f172a',
    lineHeight: 19,
  },
  myActivityDate: {
    fontSize: 12,
    color: '#64748b',
  },
  myActivityChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 2,
  },
  myActivityChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
