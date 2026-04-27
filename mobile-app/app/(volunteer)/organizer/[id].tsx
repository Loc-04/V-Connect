import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  getOrganizerManagedActivities,
  getOrganizerProfile,
  getOrganizerTopStats,
  type OrganizerManagedActivityItem,
  type OrganizerProfileView,
  type OrganizerTopStats,
} from '@/src/features/profile';
import { ThemedText } from '@/src/shared/ui/themed-text';

const PRIMARY = '#00AEEF';

const EMPTY_STATS: OrganizerTopStats = {
  totalEvents: '0',
  volunteers: '0',
  successRate: '0%',
};

function toInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

export default function OrganizerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const organizerId = typeof id === 'string' ? id : '';
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<OrganizerProfileView | null>(null);
  const [stats, setStats] = useState<OrganizerTopStats>(EMPTY_STATS);
  const [activities, setActivities] = useState<OrganizerManagedActivityItem[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'empty'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const initials = useMemo(
    () => (profile?.fullName ? toInitials(profile.fullName) : '?'),
    [profile?.fullName],
  );

  const load = useCallback(async () => {
    if (!organizerId) {
      setLoadState('error');
      setErrorMessage('Missing organizer id.');
      return;
    }

    setLoadState('loading');
    setErrorMessage(null);

    try {
      const [profileResult, statsResult, activitiesResult] = await Promise.allSettled([
        getOrganizerProfile(organizerId),
        getOrganizerTopStats(organizerId),
        getOrganizerManagedActivities(organizerId, 8),
      ]);

      if (profileResult.status !== 'fulfilled' || !profileResult.value) {
        if (profileResult.status === 'rejected') {
          const err = profileResult.reason;
          setErrorMessage(
            err instanceof Error ? err.message : 'Unable to load organizer profile.',
          );
          setLoadState('error');
          return;
        }
        setProfile(null);
        setLoadState('empty');
        return;
      }

      setProfile(profileResult.value);
      setStats(statsResult.status === 'fulfilled' ? statsResult.value : EMPTY_STATS);
      setActivities(activitiesResult.status === 'fulfilled' ? activitiesResult.value : []);
      setLoadState('ready');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load organizer profile.');
      setLoadState('error');
    }
  }, [organizerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const renderHeader = () => (
    <View style={[styles.headerBar, { paddingTop: insets.top + 8 }]}>
      <Pressable
        style={styles.backBtn}
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityLabel="Go back">
        <MaterialIcons name="arrow-back" size={22} color="#0f172a" />
      </Pressable>
      <ThemedText type="defaultSemiBold" style={styles.headerTitle}>
        Organizer
      </ThemedText>
      <View style={styles.backBtnPlaceholder} />
    </View>
  );

  if (loadState === 'loading') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.root}>
          {renderHeader()}
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        </View>
      </>
    );
  }

  if (loadState === 'error') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.root}>
          {renderHeader()}
          <View style={styles.centered}>
            <ThemedText type="defaultSemiBold" style={styles.errorTitle}>
              Could not load organizer
            </ThemedText>
            <ThemedText style={styles.errorBody}>{errorMessage}</ThemedText>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <ThemedText type="defaultSemiBold" style={styles.retryText}>
                Try again
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  if (loadState === 'empty' || !profile) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.root}>
          {renderHeader()}
          <View style={styles.centered}>
            <ThemedText type="defaultSemiBold" style={styles.errorTitle}>
              Organizer not found
            </ThemedText>
            <ThemedText style={styles.errorBody}>
              This organizer profile is no longer available.
            </ThemedText>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        {renderHeader()}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.profileCard}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <ThemedText style={styles.avatarFallbackText}>{initials}</ThemedText>
              </View>
            )}
            <ThemedText type="defaultSemiBold" style={styles.nameText}>
              {profile.fullName}
            </ThemedText>
            <ThemedText style={styles.roleBadge}>ORGANIZER</ThemedText>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <ThemedText type="defaultSemiBold" style={styles.statValue}>
                {stats.totalEvents}
              </ThemedText>
              <ThemedText style={styles.statLabel}>ACTIVITIES</ThemedText>
            </View>
            <View style={styles.statCard}>
              <ThemedText type="defaultSemiBold" style={styles.statValue}>
                {stats.volunteers}
              </ThemedText>
              <ThemedText style={styles.statLabel}>VOLUNTEERS</ThemedText>
            </View>
            <View style={styles.statCard}>
              <ThemedText type="defaultSemiBold" style={styles.statValue}>
                {stats.successRate}
              </ThemedText>
              <ThemedText style={styles.statLabel}>SUCCESS RATE</ThemedText>
            </View>
          </View>

          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Recent activities
          </ThemedText>

          {activities.length === 0 ? (
            <ThemedText style={styles.emptyText}>
              This organizer has not posted any activities yet.
            </ThemedText>
          ) : (
            activities.map((item) => (
              <Pressable
                key={item.activityId}
                style={({ pressed }) => [styles.activityCard, pressed && styles.activityCardPressed]}
                onPress={() => router.push(`/(volunteer)/activity/${item.activityId}`)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}>
                <View style={styles.activityIconWrap}>
                  <MaterialIcons name="event" size={22} color={PRIMARY} />
                </View>
                <View style={styles.activityContent}>
                  <View style={styles.activityTopRow}>
                    <ThemedText
                      type="defaultSemiBold"
                      style={styles.activityTitle}
                      numberOfLines={1}>
                      {item.title}
                    </ThemedText>
                    <View
                      style={[
                        styles.activityBadge,
                        item.badge === 'open' ? styles.badgeOpen : styles.badgeClosed,
                      ]}>
                      <ThemedText
                        style={[
                          styles.activityBadgeText,
                          item.badge === 'open' ? styles.badgeOpenText : styles.badgeClosedText,
                        ]}>
                        {item.badge === 'open' ? 'OPEN' : 'CLOSED'}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.activityMetaRow}>
                    <MaterialIcons name="group" size={14} color="#64748b" />
                    <ThemedText style={styles.activityMetaText}>
                      {item.joinedVolunteers}/{item.capacity} joined
                    </ThemedText>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  backBtnPlaceholder: {
    width: 36,
    height: 36,
  },
  headerTitle: {
    fontSize: 17,
    color: '#0f172a',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  errorTitle: {
    fontSize: 18,
    color: '#0f172a',
    textAlign: 'center',
  },
  errorBody: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: PRIMARY,
    borderRadius: 999,
  },
  retryText: {
    color: '#fff',
    fontSize: 15,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: '#0f766e',
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#d1fae5',
    borderWidth: 2,
    borderColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 30,
    fontWeight: '700',
    color: '#0f766e',
  },
  nameText: {
    marginTop: 14,
    fontSize: 22,
    color: '#0f172a',
    textAlign: 'center',
  },
  roleBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#d6efea',
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statValue: {
    fontSize: 22,
    color: '#0f8a8a',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 12,
    fontSize: 17,
    color: '#0f172a',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    paddingVertical: 12,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  activityCardPressed: {
    opacity: 0.85,
  },
  activityIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F7FC',
  },
  activityContent: {
    flex: 1,
  },
  activityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activityTitle: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
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
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badgeOpenText: {
    color: '#16a34a',
  },
  badgeClosedText: {
    color: '#4b5563',
  },
  activityMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityMetaText: {
    fontSize: 12,
    color: '#64748b',
  },
});
