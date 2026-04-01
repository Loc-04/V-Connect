import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, Image } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { router } from 'expo-router';

import { useAuth } from '@/src/features/auth';
import {
  getCoreSkills,
  getRecentParticipations,
  getVolunteerProfile,
  getVolunteerStats,
  updateVolunteerSkills,
  type CoreSkillOption,
  type RecentParticipationItem,
  type VolunteerProfileView,
  type ProfileStats,
} from '@/src/features/profile';
import { ROUTES } from '@/src/shared/constants/route-constants';
import { ThemedText } from '@/src/shared/ui/themed-text';
import { ThemedView } from '@/src/shared/ui/themed-view';

type LoadState = 'loading' | 'ready' | 'empty' | 'error';


const PICKER_PLACEHOLDER = '__placeholder__';

export default function ProfileScreen() {
  const { user, role, signOut } = useAuth();
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<VolunteerProfileView | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [recentItems, setRecentItems] = useState<RecentParticipationItem[]>([]);
  const [availableSkills, setAvailableSkills] = useState<CoreSkillOption[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [pickerValue, setPickerValue] = useState<string>(PICKER_PLACEHOLDER);
  const [isSavingSkills, setIsSavingSkills] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const initials = useMemo(() => {
    if (!profile?.fullName) return '?';
    const parts = profile.fullName.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join('');
  }, [profile?.fullName]);

  const toggleSkill = useCallback((skillName: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillName) ? prev.filter((value) => value !== skillName) : [...prev, skillName],
    );
  }, []);

  const handleSaveSkills = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Save Failed', 'Please sign in again.');
      return;
    }

    if (isSavingSkills) return;
    setIsSavingSkills(true);
    try {
      await updateVolunteerSkills(user.id, selectedSkills);
      setProfile((prev) => (prev ? { ...prev, skills: selectedSkills } : prev));
      Alert.alert('Saved', 'Your core skills were updated.');
    } catch (error) {
      Alert.alert(
        'Save Failed',
        error instanceof Error ? error.message : 'Unable to save your skills right now.',
      );
    } finally {
      setIsSavingSkills(false);
    }
  }, [isSavingSkills, selectedSkills, user?.id]);

  const loadProfileData = useCallback(async () => {
    if (!user?.id) {
      setState('error');
      setErrorMessage('Please sign in again to load your profile.');
      return;
    }

    setState('loading');
    setErrorMessage(null);

    try {
      const [nextProfile, nextStats, nextRecent, nextSkillOptions] = await Promise.all([
        getVolunteerProfile(user.id),
        getVolunteerStats(user.id),
        getRecentParticipations(user.id, 5),
        getCoreSkills(),
      ]);

      if (!nextProfile) {
        setProfile(null);
        setStats(null);
        setRecentItems([]);
        setAvailableSkills(nextSkillOptions);
        setSelectedSkills([]);
        setPickerValue(PICKER_PLACEHOLDER);
        setState('empty');
        return;
      }

      setProfile(nextProfile);
      setStats(nextStats);
      setRecentItems(nextRecent);
      setAvailableSkills(nextSkillOptions);
      setSelectedSkills(nextProfile.skills);
      setPickerValue(PICKER_PLACEHOLDER);
      setState('ready');
    } catch (error) {
      setState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to load profile data right now.',
      );
    }
  }, [user?.id]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

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
        <ThemedText style={styles.signOutText}>
          {isSigningOut ? 'Signing Out...' : 'Sign Out'}
        </ThemedText>
      </Pressable>
    );
  }

  if (state === 'loading') {
    return (
      <ThemedView style={styles.centeredContainer}>
        <ThemedText type="title">Volunteer Profile</ThemedText>
        <ThemedText style={styles.statusText}>Loading your profile...</ThemedText>
      </ThemedView>
    );
  }

  if (state === 'error') {
    return (
      <ThemedView style={styles.centeredContainer}>
        <ThemedText type="title">Volunteer Profile</ThemedText>
        <ThemedText style={styles.errorText}>{errorMessage ?? 'Unable to load profile.'}</ThemedText>
        <Pressable style={styles.retryButton} onPress={() => void loadProfileData()}>
          <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(ROUTES.VOLUNTEER.AVAILABILITY)}
          style={({ pressed }) => [styles.availabilityNavButton, pressed && styles.availabilityNavButtonPressed]}>
          <ThemedText style={styles.availabilityNavButtonText}>Manage Availability</ThemedText>
        </Pressable>
        {renderSignOutButton()}
      </ThemedView>
    );
  }

  if (state === 'empty' || !profile || !stats) {
    return (
      <ThemedView style={styles.centeredContainer}>
        <ThemedText type="title">Volunteer Profile</ThemedText>
        <ThemedText style={styles.statusText}>
          We could not find your volunteer profile yet. Complete onboarding or contact support.
        </ThemedText>
        <Pressable style={styles.retryButton} onPress={() => void loadProfileData()}>
          <ThemedText style={styles.retryButtonText}>Refresh</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(ROUTES.VOLUNTEER.AVAILABILITY)}
          style={({ pressed }) => [styles.availabilityNavButton, pressed && styles.availabilityNavButtonPressed]}>
          <ThemedText style={styles.availabilityNavButtonText}>Manage Availability</ThemedText>
        </Pressable>
        {renderSignOutButton()}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedText type="title" style={styles.pageTitle}>
          Volunteer Profile
        </ThemedText>

        <View style={styles.headerCard}>
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
          <View style={styles.metaRow}>
            <ThemedText style={styles.badgeText}>
              {(role ?? profile.role).toUpperCase()}
            </ThemedText>
            <ThemedText style={styles.memberSinceText}>Member since {profile.memberSince}</ThemedText>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <ThemedText style={styles.statLabel}>Activities</ThemedText>
            <ThemedText style={styles.statValue}>{stats.activitiesCount}</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statLabel}>Hours</ThemedText>
            <ThemedText style={styles.statValue}>{stats.totalHours}h</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statLabel}>Impact</ThemedText>
            <ThemedText style={styles.statValue}>{stats.impactScore}%</ThemedText>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open availability settings"
          onPress={() => router.push(ROUTES.VOLUNTEER.AVAILABILITY)}
          style={({ pressed }) => [styles.availabilityNavButton, pressed && styles.availabilityNavButtonPressed]}>
          <ThemedText style={styles.availabilityNavButtonText}>Manage Availability</ThemedText>
        </Pressable>

        <ThemedText style={styles.sectionTitle}>CORE SKILLS</ThemedText>
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={pickerValue}
            onValueChange={(value) => {
              const nextValue = String(value);
              setPickerValue(nextValue);
              if (nextValue !== PICKER_PLACEHOLDER) {
                toggleSkill(nextValue);
                setPickerValue(PICKER_PLACEHOLDER);
              }
            }}
            style={styles.picker}
          >
            <Picker.Item label="Select a skill..." value={PICKER_PLACEHOLDER} />
            {availableSkills.map((option) => (
              <Picker.Item key={option.id} label={option.skillName} value={option.skillName} />
            ))}
          </Picker>
        </View>

        <View style={styles.chipRow}>
          {selectedSkills.length > 0 ? (
            selectedSkills.map((skill) => (
              <Pressable key={skill} style={styles.chip} onPress={() => toggleSkill(skill)}>
                <ThemedText style={styles.chipText}>{skill} ×</ThemedText>
              </Pressable>
            ))
          ) : (
            <ThemedText style={styles.emptyInlineText}>No skills added yet.</ThemedText>
          )}
        </View>
        <Pressable
          style={[styles.saveSkillsButton, isSavingSkills && styles.saveSkillsButtonDisabled]}
          onPress={() => void handleSaveSkills()}
          disabled={isSavingSkills}
        >
          <ThemedText style={styles.saveSkillsButtonText}>
            {isSavingSkills ? 'Saving...' : 'Save Skills'}
          </ThemedText>
        </Pressable>

        <ThemedText style={styles.sectionTitle}>INTERESTS</ThemedText>
        <View style={styles.chipRow}>
          {profile.interests.length > 0 ? (
            profile.interests.map((interest) => (
              <View key={interest} style={styles.chip}>
                <ThemedText style={styles.chipText}>#{interest}</ThemedText>
              </View>
            ))
          ) : (
            <ThemedText style={styles.emptyInlineText}>No interests added yet.</ThemedText>
          )}
        </View>



        <View style={styles.recentHeaderRow}>
          <ThemedText style={styles.sectionTitle}>RECENT PARTICIPATION</ThemedText>
        </View>
        {recentItems.length > 0 ? (
          recentItems.map((item) => (
            <View key={item.participationId} style={styles.participationCard}>
              <View style={styles.participationTopRow}>
                <ThemedText type="defaultSemiBold" style={styles.participationTitle}>
                  {item.title}
                </ThemedText>
                <ThemedText style={styles.participationDate}>{item.dateLabel}</ThemedText>
              </View>
              <ThemedText style={styles.participationSubtitle}>
                {item.organizerName ?? 'Community organizer'}
              </ThemedText>
              <View style={styles.participationMetaRow}>
                <ThemedText style={styles.participationMetaText}>{item.hoursLabel}</ThemedText>
                {item.isTopRated && (
                  <View style={styles.topRatedBadge}>
                    <ThemedText style={styles.topRatedText}>Top Rated</ThemedText>
                  </View>
                )}
              </View>
            </View>
          ))
        ) : (
          <ThemedText style={styles.emptyInlineText}>No recent participation yet.</ThemedText>
        )}

        {renderSignOutButton()}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  pageTitle: {
    fontSize: 26,
    lineHeight: 30,
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
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#0f766e',
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  headerCard: {
    marginTop: 18,
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 14,
    backgroundColor: '#f6f8f8',
    alignItems: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d1fae5',
    borderWidth: 2,
    borderColor: '#0f766e',
  },
  avatarFallbackText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f766e',
  },
  nameText: {
    marginTop: 12,
  },
  metaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeText: {
    backgroundColor: '#cdeee9',
    color: '#0f766e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
  },
  memberSinceText: {
    opacity: 0.7,
    fontSize: 13,
  },
  statsRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
  },
  availabilityNavButton: {
    marginTop: 14,
    alignSelf: 'stretch',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF6FE',
    borderWidth: 1,
    borderColor: '#B8E6FF',
  },
  availabilityNavButtonPressed: {
    opacity: 0.88,
  },
  availabilityNavButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#07B5FF',
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f6f8f8',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
  statValue: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: '700',
    color: '#0f766e',
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 13,
    letterSpacing: 0.8,
    fontWeight: '700',
    opacity: 0.7,
  },
  pickerWrapper: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7e0e0',
    backgroundColor: '#f6f8f8',
    overflow: 'hidden',
  },
  picker: {
    height: 52,
  },
  chipRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#eef2f2',
  },
  chipText: {
    fontSize: 13,
    opacity: 0.9,
  },
  emptyInlineText: {
    fontSize: 14,
    opacity: 0.65,
  },
  saveSkillsButton: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#0f766e',
  },
  saveSkillsButtonDisabled: {
    opacity: 0.7,
  },
  saveSkillsButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },

  recentHeaderRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participationCard: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f6f8f8',
    marginBottom: 10,
  },
  participationTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  participationTitle: {
    flex: 1,
    fontSize: 18,
    lineHeight: 22,
  },
  participationDate: {
    fontSize: 12,
    color: '#0f766e',
    fontWeight: '700',
  },
  participationSubtitle: {
    marginTop: 4,
    fontSize: 13,
    opacity: 0.65,
  },
  participationMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participationMetaText: {
    fontSize: 13,
    opacity: 0.75,
  },
  topRatedBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#d1fae5',
  },
  topRatedText: {
    fontSize: 11,
    color: '#0f766e',
    fontWeight: '700',
  },
  signOutButton: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    backgroundColor: '#dc2626',
  },
  signOutButtonDisabled: {
    opacity: 0.7,
  },
  signOutText: {
    color: '#fff',
    fontWeight: '600',
  },
});
