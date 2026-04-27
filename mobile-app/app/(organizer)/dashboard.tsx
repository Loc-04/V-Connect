import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/features/auth';
import {
  getOrganizerProfile,
  getOrganizerRecommendedVolunteers,
  getOrganizerTopStats,
  type OrganizerProfileView,
  type OrganizerRecommendedVolunteerItem,
  type OrganizerTopStats,
} from '@/src/features/profile';
import { AvatarWithUploadOverlay } from '@/src/features/profile/components/avatar-with-upload-overlay';
import { ROUTES } from '@/src/shared/constants/route-constants';
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

export default function DashboardScreen() {
  const { user, signOut, status: authStatus } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<OrganizerProfileView | null>(null);
  const [topStats, setTopStats] = useState<OrganizerTopStats>(EMPTY_TOP_STATS);
  const [recommendedVolunteers, setRecommendedVolunteers] = useState<
    OrganizerRecommendedVolunteerItem[]
  >([]);
  const [isSigningOut, setIsSigningOut] = useState(false);

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
      const [nextProfile, nextStats, nextRecommended] = await Promise.all([
        getOrganizerProfile(user.id),
        getOrganizerTopStats(user.id),
        getOrganizerRecommendedVolunteers(user.id, 6),
      ]);

      if (!nextProfile) {
        setProfile(null);
        setTopStats(EMPTY_TOP_STATS);
        setRecommendedVolunteers([]);
        setState('empty');
        return;
      }

      setProfile(nextProfile);
      setTopStats(nextStats);
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

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          if (isSigningOut) return;
          setIsSigningOut(true);
          try {
            const { error } = await signOut();
            if (error) {
              Alert.alert('Sign Out Failed', error);
            }
          } finally {
            setIsSigningOut(false);
          }
        },
      },
    ]);
  }

  function renderSignOutButton() {
    return (
      <Pressable
        style={[styles.signOutButton, isSigningOut && styles.signOutButtonDisabled]}
        onPress={handleSignOut}
        disabled={isSigningOut}
      >
        <ThemedText style={styles.signOutButtonText}>
          {isSigningOut ? 'Signing Out...' : 'Sign Out'}
        </ThemedText>
      </Pressable>
    );
  }

  if (authStatus === 'loading') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeTop} edges={['top']}>
          <View style={styles.centeredContainer}>
            <ThemedText type="title">Organizer Profile</ThemedText>
            <ThemedText style={styles.statusText}>Loading session...</ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (authStatus !== 'authenticated' || !user) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeTop} edges={['top']}>
          <View style={styles.centeredContainer}>
            <ThemedText style={styles.statusText}>
              {isSigningOut ? 'Signing out...' : 'You are signed out.'}
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (state === 'loading') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeTop} edges={['top']}>
          <View style={styles.centeredContainer}>
            <ThemedText type="title">Organizer Profile</ThemedText>
            <ThemedText style={styles.statusText}>Loading organizer profile...</ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (state === 'error') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeTop} edges={['top']}>
          <View style={styles.centeredContainer}>
            <ThemedText type="title">Organizer Profile</ThemedText>
            <ThemedText style={styles.errorText}>
              {errorMessage ?? 'Unable to load organizer profile.'}
            </ThemedText>
            <Pressable style={styles.retryButton} onPress={() => void loadOrganizerProfile()}>
              <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
            </Pressable>
            {renderSignOutButton()}
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (state === 'empty' || !profile) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeTop} edges={['top']}>
          <View style={styles.centeredContainer}>
            <ThemedText type="title">Organizer Profile</ThemedText>
            <ThemedText style={styles.statusText}>No organizer profile found for this account.</ThemedText>
            <Pressable style={styles.retryButton} onPress={() => void loadOrganizerProfile()}>
              <ThemedText style={styles.retryButtonText}>Refresh</ThemedText>
            </Pressable>
            {renderSignOutButton()}
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeTop} edges={['top']}>
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
          <AvatarWithUploadOverlay
            userId={user.id}
            avatarUrl={profile.avatarUrl}
            initials={initials}
            onAvatarUpdated={(url) => setProfile((prev) => (prev ? { ...prev, avatarUrl: url } : prev))}
          />
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
            <ThemedText style={styles.statLabel}>TOTAL ACTIVITIES</ThemedText>
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

        <Pressable
          style={styles.editButton}
          onPress={() => router.push(ROUTES.ORGANIZER.ACTIVITIES)}
        >
          <ThemedText style={styles.editButtonText}>My activities</ThemedText>
        </Pressable>

        <Pressable
          style={styles.editButton}
          onPress={() => router.push(ROUTES.ORGANIZER.REGISTER_MANAGEMENT)}
        >
          <ThemedText style={styles.editButtonText}>Register Management</ThemedText>
        </Pressable>

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

        {renderSignOutButton()}
      </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  safeTop: {
    flex: 1,
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
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  signOutButton: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    alignSelf: 'stretch',
  },
  signOutButtonDisabled: {
    opacity: 0.7,
  },
  signOutButtonText: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
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
