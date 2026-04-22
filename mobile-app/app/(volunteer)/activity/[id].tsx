import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { useAuth, type UserRole } from '@/src/features/auth';
import {
  ActivityTimelineList,
  getActivity,
  loadTimelinePlaceholder,
  mergeDisplayTimeline,
} from '@/src/features/organizer-activities';
import type { ActivityRecord, ActivityTimelineEntry } from '@/src/features/organizer-activities';
import {
  cancelActivityRegistration,
  fetchMyParticipationForActivity,
  hasApprovedParticipationElsewhere,
  isActiveParticipationStatus,
  registerForActivity,
  type ParticipationRow,
} from '@/src/features/participations';
import {
  categoryFromSkills,
  fetchVolunteerRecommendations,
  formatDateRangeLine,
  formatLocationLine,
  pickHeroImage,
} from '@/src/features/volunteer-explore';
import { ThemedText } from '@/src/shared/ui/themed-text';

const PRIMARY = '#00AEEF';
const MATCH_BG = '#E6F9F3';
const MATCH_ACCENT = '#0f766e';

function formatParticipationStatus(status: string | undefined): string {
  const s = String(status ?? '').toLowerCase();
  switch (s) {
    case 'pending':
      return 'Pending approval';
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
      return status ? String(status) : 'Unknown';
  }
}

function canRegisterRole(role: UserRole | null): boolean {
  return role === 'volunteer' || role === 'admin';
}

export default function VolunteerActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const activityId = typeof id === 'string' ? id : '';
  const insets = useSafeAreaInsets();
  const { user, role } = useAuth();

  const [activity, setActivity] = useState<ActivityRecord | null>(null);
  const [storedTimeline, setStoredTimeline] = useState<ActivityTimelineEntry[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [organizerName, setOrganizerName] = useState<string | null>(null);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [matchExplanation, setMatchExplanation] = useState<string | null>(null);
  const [participation, setParticipation] = useState<ParticipationRow | null>(null);
  const [participationLoading, setParticipationLoading] = useState(false);
  const [committedElsewhere, setCommittedElsewhere] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!activityId) {
      setLoadState('error');
      setErrorMessage('Missing activity id.');
      return;
    }

    setLoadState('loading');
    setErrorMessage(null);

    try {
      const data = await getActivity(activityId);
      setActivity(data);

      // TODO(backend): fetch timeline with activity response instead of placeholder storage.
      try {
        const tl = await loadTimelinePlaceholder(activityId);
        setStoredTimeline(tl);
      } catch {
        setStoredTimeline([]);
      }

      if (user?.id) {
        try {
          const rec = await fetchVolunteerRecommendations(user.id, 80);
          const hit = rec.activities?.find((a) => a.activityId === activityId);
          if (hit) {
            setOrganizerName(hit.organizerName);
            setMatchScore(hit.matchScore);
            setMatchExplanation(hit.explanation);
          } else {
            setOrganizerName(null);
            setMatchScore(null);
            setMatchExplanation(null);
          }
        } catch {
          setOrganizerName(null);
          setMatchScore(null);
          setMatchExplanation(null);
        }
      } else {
        setOrganizerName(null);
        setMatchScore(null);
        setMatchExplanation(null);
      }

      setLoadState('ready');
    } catch (err) {
      setActivity(null);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load activity.');
      setLoadState('error');
    }
  }, [activityId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadParticipation = useCallback(async () => {
    if (!activityId || !user?.id || role !== 'volunteer') {
      setParticipation(null);
      setCommittedElsewhere(false);
      return;
    }
    setParticipationLoading(true);
    try {
      const [row, blocked] = await Promise.all([
        fetchMyParticipationForActivity(activityId),
        hasApprovedParticipationElsewhere(activityId),
      ]);
      setParticipation(row);
      setCommittedElsewhere(blocked);
    } catch {
      setParticipation(null);
      setCommittedElsewhere(false);
    } finally {
      setParticipationLoading(false);
    }
  }, [activityId, user?.id, role]);

  useEffect(() => {
    if (loadState === 'ready' && activity) {
      void loadParticipation();
    }
  }, [loadState, activity, loadParticipation]);

  const onRegister = useCallback(async () => {
    if (!activityId || !canRegisterRole(role)) {
      Alert.alert('Registration', 'Only volunteer accounts can register for activities.');
      return;
    }
    if (activity?.status !== 'published') {
      Alert.alert('Registration', 'This activity is not open for registration.');
      return;
    }
    setRegistering(true);
    try {
      const result = await registerForActivity(activityId);
      const msg = result.message ?? (result.created ? 'Registration submitted.' : 'You are already registered.');
      Alert.alert('Registration', msg);
      await loadParticipation();
    } catch (err) {
      Alert.alert('Registration failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRegistering(false);
    }
  }, [activityId, activity?.status, role, loadParticipation]);

  const onCancelRegistration = useCallback(() => {
    if (!activityId) return;
    Alert.alert(
      'Cancel registration',
      'Cancel your registration for this activity?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, cancel',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setCancelling(true);
              try {
                const res = await cancelActivityRegistration(activityId);
                Alert.alert('Cancelled', res.message ?? 'Your registration was cancelled.');
                await loadParticipation();
              } catch (err) {
                Alert.alert('Error', err instanceof Error ? err.message : 'Could not cancel.');
              } finally {
                setCancelling(false);
              }
            })();
          },
        },
      ],
    );
  }, [activityId, loadParticipation]);

  if (loadState === 'loading' || loadState === 'error') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.fullScreen, { paddingTop: insets.top }]}>
          <Pressable
            style={[styles.backBtn, { top: insets.top + 8 }]}
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityLabel="Go back">
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          {loadState === 'loading' ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          ) : (
            <View style={styles.centered}>
              <ThemedText type="defaultSemiBold" style={styles.errorTitle}>
                Could not load activity
              </ThemedText>
              <ThemedText style={styles.errorBody}>{errorMessage}</ThemedText>
              <Pressable style={styles.retryBtn} onPress={() => void load()}>
                <ThemedText type="defaultSemiBold" style={styles.retryText}>
                  Try again
                </ThemedText>
              </Pressable>
            </View>
          )}
        </View>
      </>
    );
  }

  if (!activity) {
    return null;
  }

  const categoryLabel = categoryFromSkills(activity.required_skills ?? []);
  const dateLine = formatDateRangeLine(activity.start_time, activity.end_time);
  const locationLine = formatLocationLine(activity.location);
  const heroUri = pickHeroImage(activity.id);
  const hostLabel = organizerName ?? 'Organizer';
  const hasActiveRegistration = participation != null && isActiveParticipationStatus(participation.status);
  const canCancel =
    hasActiveRegistration && String(participation?.status ?? '').toLowerCase() !== 'checked_in';
  const registerBlockedByOtherApproval =
    committedElsewhere && !hasActiveRegistration && canRegisterRole(role) && activity.status === 'published';

  const registerDisabled =
    registering ||
    cancelling ||
    activity.status !== 'published' ||
    !canRegisterRole(role) ||
    hasActiveRegistration ||
    registerBlockedByOtherApproval;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.heroWrap}>
            <Image source={{ uri: heroUri }} style={styles.heroImage} contentFit="cover" />
            <Pressable
              style={[styles.backBtn, { top: insets.top + 8 }]}
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityLabel="Go back">
              <View style={styles.backCircle}>
                <MaterialIcons name="arrow-back" size={22} color="#fff" />
              </View>
            </Pressable>
          </View>

          <View style={styles.sheet}>
            <ThemedText type="defaultSemiBold" style={styles.title}>
              {activity.title}
            </ThemedText>

            <View style={styles.tagRow}>
              <View style={styles.categoryPill}>
                <ThemedText style={styles.categoryPillText}>{categoryLabel}</ThemedText>
              </View>
              {activity.status === 'published' ? (
                <ThemedText style={styles.statusHint}>• Open for registration</ThemedText>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaIcon}>
                <MaterialIcons name="event" size={18} color={PRIMARY} />
              </View>
              <ThemedText style={styles.metaText}>{dateLine}</ThemedText>
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaIcon}>
                <MaterialIcons name="place" size={18} color={PRIMARY} />
              </View>
              <ThemedText style={styles.metaText}>{locationLine}</ThemedText>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaIcon}>
                <MaterialIcons name="group" size={18} color={PRIMARY} />
              </View>
              <ThemedText style={styles.metaText}>
                Capacity: {activity.capacity} volunteers
              </ThemedText>
            </View>

            <View style={styles.hostRow}>
              <View style={styles.hostAvatar}>
                <MaterialIcons name="eco" size={20} color="#0f766e" />
              </View>
              <ThemedText style={styles.hostText} numberOfLines={1}>
                Hosted by <ThemedText type="defaultSemiBold">{hostLabel}</ThemedText>
              </ThemedText>
            </View>

            {matchScore != null && matchExplanation ? (
              <View style={styles.matchBox}>
                <View style={styles.matchHeader}>
                  <View style={styles.matchIconWrap}>
                    <MaterialIcons name="auto-awesome" size={18} color={MATCH_ACCENT} />
                  </View>
                  <ThemedText type="defaultSemiBold" style={styles.matchTitle}>
                    AI Match: {matchScore}%
                  </ThemedText>
                </View>
                <ThemedText style={styles.matchBody}>{matchExplanation}</ThemedText>
              </View>
            ) : null}

            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Schedule
            </ThemedText>
            <ActivityTimelineList
              entries={mergeDisplayTimeline(storedTimeline, activity)}
              multiDay={
                new Date(activity.start_time).toDateString() !==
                new Date(activity.end_time).toDateString()
              }
              accentColor={PRIMARY}
            />

            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              About the event
            </ThemedText>
            <ThemedText style={styles.description}>{activity.description || 'No description provided.'}</ThemedText>

            {(activity.required_skills?.length ?? 0) > 0 ? (
              <>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                  Skills
                </ThemedText>
                <View style={styles.skillsRow}>
                  {activity.required_skills.map((skill) => (
                    <View key={skill} style={styles.skillPill}>
                      <ThemedText style={styles.skillPillText}>{skill}</ThemedText>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {participationLoading ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : hasActiveRegistration && participation ? (
            <>
              <View style={styles.registrationBanner}>
                <MaterialIcons name="check-circle" size={20} color={MATCH_ACCENT} />
                <ThemedText style={styles.registrationBannerText}>
                  Your status: {formatParticipationStatus(participation.status)}
                </ThemedText>
              </View>
              {canCancel ? (
                <Pressable
                  style={[styles.cancelBtn, cancelling && styles.footerBtnDisabled]}
                  disabled={cancelling || registering}
                  onPress={onCancelRegistration}>
                  {cancelling ? (
                    <ActivityIndicator color="#b91c1c" />
                  ) : (
                    <ThemedText type="defaultSemiBold" style={styles.cancelBtnText}>
                      Cancel registration
                    </ThemedText>
                  )}
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              {registerBlockedByOtherApproval ? (
                <View style={styles.commitmentHint}>
                  <MaterialIcons name="info-outline" size={18} color="#b45309" />
                  <ThemedText style={styles.commitmentHintText}>
                    You already have an approved registration for another activity. Cancel it first to
                    join this one.
                  </ThemedText>
                </View>
              ) : null}
              <Pressable
                style={[styles.registerBtn, registerDisabled && styles.footerBtnDisabled]}
                disabled={registerDisabled}
                onPress={() => void onRegister()}>
                {registering ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText type="defaultSemiBold" style={styles.registerBtnText}>
                    {activity.status !== 'published'
                      ? 'Registration closed'
                      : !canRegisterRole(role)
                        ? 'Volunteer sign-in required'
                        : registerBlockedByOtherApproval
                          ? 'Already committed elsewhere'
                          : 'Register now'}
                  </ThemedText>
                )}
              </Pressable>
            </>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  fullScreen: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  heroWrap: {
    height: 240,
    width: '100%',
    backgroundColor: '#e8f4f8',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 2,
  },
  backCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    marginTop: -28,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 8,
    minHeight: 400,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
    color: '#0f172a',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 16,
  },
  categoryPill: {
    backgroundColor: '#E0F7FC',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  categoryPillText: {
    fontSize: 13,
    color: PRIMARY,
    fontWeight: '600',
  },
  statusHint: {
    fontSize: 14,
    color: PRIMARY,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  metaIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8F7FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaText: {
    flex: 1,
    fontSize: 15,
    color: '#475569',
    lineHeight: 21,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 18,
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostText: {
    flex: 1,
    fontSize: 15,
    color: '#334155',
  },
  matchBox: {
    backgroundColor: MATCH_BG,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  matchIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchTitle: {
    fontSize: 16,
    color: MATCH_ACCENT,
  },
  matchBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#115e59',
  },
  sectionTitle: {
    fontSize: 18,
    color: '#0f172a',
    marginBottom: 8,
    marginTop: 4,
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    color: '#475569',
    marginBottom: 16,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  skillPill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  skillPillText: {
    fontSize: 14,
    color: '#334155',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  registerBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  registerBtnText: {
    color: '#fff',
    fontSize: 16,
  },
  footerLoading: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  registrationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: MATCH_BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  registrationBannerText: {
    flex: 1,
    fontSize: 15,
    color: '#115e59',
    fontWeight: '600',
  },
  commitmentHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  commitmentHintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#92400e',
  },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: '#fecaca',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#b91c1c',
    fontSize: 16,
  },
  footerBtnDisabled: {
    opacity: 0.55,
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
});
