import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useAuth } from '@/src/features/auth';
import {
  getOrganizerManagedActivities,
  getOrganizerProfile,
  getOrganizerRecommendedVolunteers,
  getOrganizerTopStats,
  type OrganizerManagedActivityItem,
  type OrganizerProfileView,
  type OrganizerRecommendedVolunteerItem,
  type OrganizerTopStats,
} from '@/src/features/profile';
import { ThemedText } from '@/src/shared/ui/themed-text';
import { ThemedView } from '@/src/shared/ui/themed-view';

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

const EMPTY_TOP_STATS: OrganizerTopStats = {
  totalEvents: '0',
  volunteers: '0',
  successRate: '0%',
};

function toInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

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

export default function DashboardScreen() {
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<OrganizerProfileView | null>(null);
  const [topStats, setTopStats] = useState<OrganizerTopStats>(EMPTY_TOP_STATS);
  const [activities, setActivities] = useState<OrganizerManagedActivityItem[]>([]);
  const [allActivities, setAllActivities] = useState<OrganizerManagedActivityItem[]>([]);
  const [isViewAllVisible, setIsViewAllVisible] = useState(false);
  const [recommendedVolunteers, setRecommendedVolunteers] = useState<
    OrganizerRecommendedVolunteerItem[]
  >([]);

  const initials = useMemo(
    () => (profile?.fullName ? toInitials(profile.fullName) : '?'),
    [profile?.fullName],
  );

  const loadOrganizerProfile = useCallback(async () => {
    if (!user?.id) {
      setState('error');
      setErrorMessage('Please sign in again to load organizer profile.');
      return;
    }

    setState('loading');
    setErrorMessage(null);

    try {
      const [nextProfile, nextStats, nextActivities, nextRecommended] = await Promise.all([
        getOrganizerProfile(user.id),
        getOrganizerTopStats(user.id),
        getOrganizerManagedActivities(user.id, 5),
        getOrganizerRecommendedVolunteers(user.id, 6),
      ]);

      if (!nextProfile) {
        setProfile(null);
        setTopStats(EMPTY_TOP_STATS);
        setActivities([]);
        setRecommendedVolunteers([]);
        setState('empty');
        return;
      }

      setProfile(nextProfile);
      setTopStats(nextStats);
      setActivities(nextActivities);
      setRecommendedVolunteers(nextRecommended);
      setState('ready');
    } catch (error) {
      setState('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to load organizer profile right now.',
      );
    }
  }, [user?.id]);

  useEffect(() => {
    void loadOrganizerProfile();
  }, [loadOrganizerProfile]);

  const handleViewAllActivities = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Missing Account', 'Please sign in again.');
      return;
    }

    try {
      const items = await getOrganizerManagedActivities(user.id, 100);
      setAllActivities(items);
      setIsViewAllVisible(true);
    } catch (error) {
      Alert.alert(
        'Unable to Load Activities',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }, [user?.id]);

  if (state === 'loading') {
    return (
      <ThemedView style={styles.centeredContainer}>
        <ThemedText type="title">Organizer Profile</ThemedText>
        <ThemedText style={styles.statusText}>Loading organizer profile...</ThemedText>
      </ThemedView>
    );
  }

  if (state === 'error') {
    return (
      <ThemedView style={styles.centeredContainer}>
        <ThemedText type="title">Organizer Profile</ThemedText>
        <ThemedText style={styles.errorText}>
          {errorMessage ?? 'Unable to load organizer profile.'}
        </ThemedText>
        <Pressable style={styles.retryButton} onPress={() => void loadOrganizerProfile()}>
          <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (state === 'empty' || !profile) {
    return (
      <ThemedView style={styles.centeredContainer}>
        <ThemedText type="title">Organizer Profile</ThemedText>
        <ThemedText style={styles.statusText}>No organizer profile found for this account.</ThemedText>
        <Pressable style={styles.retryButton} onPress={() => void loadOrganizerProfile()}>
          <ThemedText style={styles.retryButtonText}>Refresh</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <MaterialIcons name="arrow-back" size={22} color="#1f2937" />
            <ThemedText style={styles.topBarTitle}>Organizer Profile</ThemedText>
          </View>
          <Pressable
            onPress={() => Alert.alert('Settings', 'Settings action will be wired next.')}
            hitSlop={8}
          >
            <MaterialIcons name="settings" size={22} color="#374151" />
          </Pressable>
        </View>

        <View style={styles.profileCard}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <ThemedText style={styles.avatarFallbackText}>{initials}</ThemedText>
            </View>
          )}
          <ThemedText type="subtitle" style={styles.nameText}>
            {profile.fullName}
          </ThemedText>
          <ThemedText style={styles.roleBadge}>ORGANIZER</ThemedText>
          <Pressable
            style={styles.editButton}
            onPress={() => Alert.alert('Edit Profile', 'Profile edit flow will be wired next.')}
          >
            <ThemedText style={styles.editButtonText}>Edit Profile</ThemedText>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>{topStats.totalEvents}</ThemedText>
            <ThemedText style={styles.statLabel}>TOTAL EVENTS</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>{topStats.volunteers}</ThemedText>
            <ThemedText style={styles.statLabel}>VOLUNTEERS</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>{topStats.successRate}</ThemedText>
            <ThemedText style={styles.statLabel}>SUCCESS RATE</ThemedText>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Managed Activities</ThemedText>
          <Pressable onPress={() => void handleViewAllActivities()}>
            <ThemedText style={styles.sectionAction}>View All</ThemedText>
          </Pressable>
        </View>

        {activities.length > 0 ? (
          activities.map((item) => (
            <View key={item.activityId} style={styles.activityCard}>
              <View style={styles.activityIconWrap}>
                <MaterialIcons
                  name={getActivityIcon(item.title)}
                  size={22}
                  color="#0f766e"
                />
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
                        item.badge === 'open'
                          ? styles.badgeOpenText
                          : styles.badgeClosedText,
                      ]}
                    >
                      {formatBadgeLabel(item)}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.volunteerMetaRow}>
                  <MaterialIcons name="groups" size={14} color="#6b7280" />
                  <ThemedText style={styles.volunteerMetaText}>
                    {item.joinedVolunteers}/{item.capacity} Volunteers Joined
                  </ThemedText>
                </View>
              </View>
            </View>
          ))
        ) : (
          <ThemedText style={styles.emptyInlineText}>No managed activities yet.</ThemedText>
        )}

        <View style={styles.aiHeaderRow}>
          <MaterialIcons name="auto-awesome" size={18} color="#0f766e" />
          <ThemedText style={styles.sectionTitle}>AI Recommended Volunteers</ThemedText>
        </View>

        {recommendedVolunteers.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendedRow}>
            {recommendedVolunteers.map((volunteer) => (
              <View key={volunteer.userId} style={styles.recommendedCard}>
                <View style={styles.recommendedTopRow}>
                  {volunteer.avatarUrl ? (
                    <Image source={{ uri: volunteer.avatarUrl }} style={styles.recommendedAvatar} />
                  ) : (
                    <View style={styles.recommendedAvatarFallback}>
                      <ThemedText style={styles.recommendedAvatarFallbackText}>
                        {toInitials(volunteer.fullName)}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.recommendedNameWrap}>
                    <ThemedText type="defaultSemiBold" style={styles.recommendedNameText}>
                      {volunteer.fullName}
                    </ThemedText>
                    <ThemedText style={styles.matchText}>{volunteer.matchPercent}% Match</ThemedText>
                  </View>
                </View>

                <View style={styles.tagRow}>
                  {volunteer.tags.length > 0 ? (
                    volunteer.tags.map((tag) => (
                      <View key={`${volunteer.userId}-${tag}`} style={styles.tagPill}>
                        <ThemedText style={styles.tagText}>{tag}</ThemedText>
                      </View>
                    ))
                  ) : (
                    <View style={styles.tagPill}>
                      <ThemedText style={styles.tagText}>General</ThemedText>
                    </View>
                  )}
                </View>

                <View style={styles.availabilityRow}>
                  <MaterialIcons name="schedule" size={13} color="#6b7280" />
                  <ThemedText style={styles.availabilityText}>{volunteer.availabilityLabel}</ThemedText>
                </View>

                <Pressable
                  style={styles.inviteButton}
                  onPress={() => Alert.alert('Invite Sent', `Invite queued for ${volunteer.fullName}.`)}
                >
                  <ThemedText style={styles.inviteButtonText}>Invite</ThemedText>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : (
          <ThemedText style={styles.emptyInlineText}>No recommendations available yet.</ThemedText>
        )}
      </ScrollView>

      <Modal
        visible={isViewAllVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsViewAllVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>All Managed Activities</ThemedText>
              <Pressable onPress={() => setIsViewAllVisible(false)} hitSlop={6}>
                <MaterialIcons name="close" size={22} color="#374151" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {allActivities.length > 0 ? (
                allActivities.map((item) => (
                  <View key={`all-${item.activityId}`} style={styles.modalActivityCard}>
                    <View style={styles.activityIconWrap}>
                      <MaterialIcons
                        name={getActivityIcon(item.title)}
                        size={20}
                        color="#0f766e"
                      />
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
                              item.badge === 'open'
                                ? styles.badgeOpenText
                                : styles.badgeClosedText,
                            ]}
                          >
                            {formatBadgeLabel(item)}
                          </ThemedText>
                        </View>
                      </View>
                      <View style={styles.volunteerMetaRow}>
                        <MaterialIcons name="groups" size={14} color="#6b7280" />
                        <ThemedText style={styles.volunteerMetaText}>
                          {item.joinedVolunteers}/{item.capacity} Volunteers Joined
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                ))
              ) : (
                <ThemedText style={styles.emptyInlineText}>
                  No activities found for this organizer.
                </ThemedText>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },
  statusText: {
    marginTop: 12,
    opacity: 0.7,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 12,
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  profileCard: {
    marginTop: 18,
    borderRadius: 20,
    backgroundColor: '#f8faf9',
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eef2f2',
  },
  avatar: {
    width: 98,
    height: 98,
    borderRadius: 49,
    borderWidth: 2,
    borderColor: '#0f766e',
  },
  avatarFallback: {
    width: 98,
    height: 98,
    borderRadius: 49,
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
    marginTop: 12,
    fontSize: 38,
    lineHeight: 42,
    color: '#111827',
  },
  roleBadge: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#d6efea',
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  editButton: {
    marginTop: 16,
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#0f8a8a',
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
  },
  statsRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f8faf9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eef2f2',
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: {
    color: '#0f8a8a',
    fontSize: 34,
    fontWeight: '700',
  },
  statLabel: {
    marginTop: 2,
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '700',
  },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  sectionAction: {
    fontSize: 15,
    color: '#0f8a8a',
    fontWeight: '700',
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
  volunteerMetaRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  volunteerMetaText: {
    fontSize: 14,
    color: '#4b5563',
  },
  aiHeaderRow: {
    marginTop: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recommendedRow: {
    paddingBottom: 8,
    gap: 10,
  },
  recommendedCard: {
    width: 190,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eceff1',
    backgroundColor: '#f8faf9',
    padding: 10,
  },
  recommendedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recommendedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  recommendedAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendedAvatarFallbackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f766e',
  },
  recommendedNameWrap: {
    flex: 1,
  },
  recommendedNameText: {
    fontSize: 15,
    color: '#1f2937',
  },
  matchText: {
    fontSize: 12,
    color: '#22c55e',
    fontWeight: '600',
  },
  tagRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    borderRadius: 999,
    backgroundColor: '#dff0ef',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    color: '#4b5563',
  },
  availabilityRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  availabilityText: {
    fontSize: 12,
    color: '#4b5563',
  },
  inviteButton: {
    marginTop: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#9bcfd0',
    backgroundColor: '#cbe7e8',
    paddingVertical: 8,
    alignItems: 'center',
  },
  inviteButtonText: {
    color: '#0f8a8a',
    fontWeight: '700',
  },
  emptyInlineText: {
    fontSize: 14,
    color: '#6b7280',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '78%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  modalActivityCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eceff1',
    backgroundColor: '#f8faf9',
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
});
