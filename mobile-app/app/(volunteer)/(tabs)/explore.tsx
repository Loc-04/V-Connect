import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/features/auth';
import {
  categoryFromSkills,
  ExploreActivityCard,
  fetchVolunteerRecommendations,
  formatDateRangeLine,
  formatLocationLine,
  pickHeroImage,
  type VolunteerRecommendationActivity,
} from '@/src/features/volunteer-explore';
import { listActivities } from '@/src/features/organizer-activities';
import type { ActivityRecord } from '@/src/features/organizer-activities';
import { ThemedText } from '@/src/shared/ui/themed-text';

interface ExploreRow {
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

function mapRecommendation(item: VolunteerRecommendationActivity): ExploreRow {
  return {
    id: item.activityId,
    title: item.title,
    categoryLabel: categoryFromSkills(item.requiredSkills),
    matchScore: item.matchScore,
    matchExplanation: item.explanation,
    dateLine: formatDateRangeLine(item.startTime, item.endTime),
    locationLine: formatLocationLine(item.location),
    organizerName: item.organizerName,
    imageUrl: pickHeroImage(item.activityId),
  };
}

function mapPublishedActivity(activity: ActivityRecord): ExploreRow {
  return {
    id: activity.id,
    title: activity.title,
    categoryLabel: categoryFromSkills(activity.required_skills ?? []),
    matchScore: null,
    matchExplanation: null,
    dateLine: formatDateRangeLine(activity.start_time, activity.end_time),
    locationLine: formatLocationLine(activity.location),
    organizerName: 'Organizer',
    imageUrl: pickHeroImage(activity.id),
  };
}

export default function ExploreScreen() {
  const { user, status: authStatus } = useAuth();
  const [rows, setRows] = useState<ExploreRow[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
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
        setRows(recActivities.map(mapRecommendation));
        setLoadState('ready');
        return;
      }

      const publishedIds = new Set(published.map((p) => p.id));
      const merged: ExploreRow[] = [];
      const seen = new Set<string>();

      for (const r of recActivities) {
        if (!publishedIds.has(r.activityId)) continue;
        merged.push(mapRecommendation(r));
        seen.add(r.activityId);
      }

      for (const p of published) {
        if (seen.has(p.id)) continue;
        merged.push(mapPublishedActivity(p));
      }

      setRows(merged);
      setLoadState('ready');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unable to load activities.';
      setErrorMessage(msg);
      setLoadState('error');
    }
  }, [user?.id]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (authStatus !== 'authenticated' || !user?.id) {
      setLoadState('ready');
      setRows([]);
      return;
    }
    void load();
  }, [authStatus, user?.id, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openDetail = useCallback((id: string) => {
    router.push(`/(volunteer)/activity/${id}`);
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
            Sign in to explore
          </ThemedText>
          <ThemedText style={styles.emptyHint}>Activities tailored to your profile appear here.</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'loading') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#00AEEF" />
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
        </View>
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
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#00AEEF" />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="title" style={styles.screenTitle}>
              Explore
            </ThemedText>
            <ThemedText style={styles.screenSubtitle}>
              All open activities, with AI matches shown first when available
            </ThemedText>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <ThemedText type="defaultSemiBold" style={styles.emptyTitle}>
              No upcoming activities
            </ThemedText>
            <ThemedText style={styles.emptyHint}>
              Check back soon or update your availability in your profile.
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
    fontSize: 16,
    lineHeight: 22,
    color: '#64748b',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
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
});
