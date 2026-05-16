import { useCallback, useEffect, useMemo, useState } from 'react';
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
  listActivityTimeline,
  mapServerRowsToEntries,
} from '@/src/features/organizer-activities';
import type { ActivityRecord, ActivityTimelineEntry } from '@/src/features/organizer-activities';
import {
  fetchActiveParticipationsForConflict,
  fetchMyParticipationStatusForActivity,
  findTimeConflict,
  isActiveParticipationStatus,
  registerForActivity,
  type ActiveParticipationForConflict,
  type ParticipationRow,
} from '@/src/features/participations';
import {
  categoryFromSkills,
  fetchVolunteerRecommendations,
  formatDateRangeLine,
  formatLocationLine,
  resolveExploreCoverUrl,
} from '@/src/features/volunteer-explore';
import { getOrganizerProfile, type OrganizerProfileView } from '@/src/features/profile';
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
  const { id, recommendationItemId } = useLocalSearchParams<{ id: string; recommendationItemId?: string }>();
  const activityId = typeof id === 'string' ? id : '';
  const routeRecItemId = typeof recommendationItemId === 'string' ? recommendationItemId : null;
  const insets = useSafeAreaInsets();
  const { user, role } = useAuth();

  const [activity, setActivity] = useState<ActivityRecord | null>(null);
  const [timeline, setTimeline] = useState<ActivityTimelineEntry[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [organizer, setOrganizer] = useState<OrganizerProfileView | null>(null);
  const [organizerNameFromRec, setOrganizerNameFromRec] = useState<string | null>(null);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [matchExplanation, setMatchExplanation] = useState<string | null>(null);
  const [recItemIdState, setRecItemIdState] = useState<string | null>(routeRecItemId);
  const [participation, setParticipation] = useState<ParticipationRow | null>(null);
  const [priorParticipation, setPriorParticipation] = useState<ParticipationRow | null>(null);
  const [conflictCandidates, setConflictCandidates] = useState<ActiveParticipationForConflict[]>([]);
  const [participationLoading, setParticipationLoading] = useState(false);
  const [committedElsewhere, setCommittedElsewhere] = useState(false);
  const [registering, setRegistering] = useState(false);

  const timeConflict = useMemo(() => {
    if (!activity || conflictCandidates.length === 0) return null;
    return findTimeConflict(
      { id: activity.id, start_time: activity.start_time, end_time: activity.end_time },
      conflictCandidates,
    );
  }, [activity, conflictCandidates]);

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

      try {
        const rows = await listActivityTimeline(activityId);
        setTimeline(mapServerRowsToEntries(rows));
      } catch {
        setTimeline([]);
      }

      if (data?.organizer_id) {
        try {
          const profile = await getOrganizerProfile(data.organizer_id);
          setOrganizer(profile);
        } catch {
          setOrganizer(null);
        }
      } else {
        setOrganizer(null);
      }

      if (user?.id) {
        try {
          const rec = await fetchVolunteerRecommendations(user.id, 80);
          const hit = rec.activities?.find((a) => a.activityId === activityId);
          if (hit) {
            setOrganizerNameFromRec(hit.organizerName);
            setMatchScore(hit.matchScore);
            setMatchExplanation(hit.explanation);
            setRecItemIdState(prev => prev || hit.recommendation_item_id || null);
          } else {
            setOrganizerNameFromRec(null);
            setMatchScore(null);
            setMatchExplanation(null);
          }
        } catch {
          setOrganizerNameFromRec(null);
          setMatchScore(null);
          setMatchExplanation(null);
        }
      } else {
        setOrganizerNameFromRec(null);
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
      setPriorParticipation(null);
      setCommittedElsewhere(false);
      setConflictCandidates([]);
      return;
    }
    setParticipationLoading(true);
    try {
      const [statusResult, allActive] = await Promise.all([
        fetchMyParticipationStatusForActivity(activityId),
        fetchActiveParticipationsForConflict(),
      ]);
      setParticipation(statusResult.active);
      setPriorParticipation(statusResult.prior);
      // Derive "committed elsewhere": approved/checked_in on a different activity
      const committed = allActive.some(
        (p) =>
          p.activityId !== activityId &&
          (p.status === 'approved' || p.status === 'checked_in'),
      );
      setCommittedElsewhere(committed);
      // Store candidates excluding current activity (current activity status is tracked separately)
      setConflictCandidates(allActive.filter((p) => p.activityId !== activityId));
    } catch {
      setParticipation(null);
      setPriorParticipation(null);
      setCommittedElsewhere(false);
      setConflictCandidates([]);
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
    if (timeConflict !== null) {
      Alert.alert(
        'Schedule conflict',
        `This activity overlaps with "${timeConflict.conflicting.activityName}". Cancel that registration first to join this one.`,
      );
      return;
    }
    setRegistering(true);
    try {
      const result = await registerForActivity(activityId, recItemIdState);
      const msg = result.message ?? (result.created ? 'Registration submitted.' : 'You are already registered.');
      Alert.alert('Registration', msg);
      await loadParticipation();
    } catch (err) {
      Alert.alert('Registration failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRegistering(false);
    }
  }, [activityId, activity?.status, role, timeConflict, loadParticipation]);

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
  const heroUri = resolveExploreCoverUrl(activity.id, activity.cover_image_url);
  const hostLabel = organizer?.fullName ?? organizerNameFromRec ?? 'Organizer';
  const canOpenOrganizer = Boolean(activity.organizer_id);
  const onOpenOrganizer = () => {
    if (!activity.organizer_id) return;
    router.push(`/(volunteer)/organizer/${activity.organizer_id}`);
  };
  const statusLabel = (() => {
    switch (activity.status) {
      case 'published':
        return 'Open for registration';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      case 'draft':
        return 'Draft';
      default:
        return null;
    }
  })();
  const hasActiveRegistration = participation != null && isActiveParticipationStatus(participation.status);
  const registerBlockedByOtherApproval =
    committedElsewhere && !hasActiveRegistration && canRegisterRole(role) && activity.status === 'published';
  const registerBlockedByConflict =
    timeConflict !== null && !hasActiveRegistration && canRegisterRole(role) && activity.status === 'published';

  const registerDisabled =
    registering ||
    activity.status !== 'published' ||
    !canRegisterRole(role) ||
    hasActiveRegistration ||
    registerBlockedByOtherApproval ||
    registerBlockedByConflict;

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
              {statusLabel ? (
                <ThemedText style={styles.statusHint}>• {statusLabel}</ThemedText>
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

            <Pressable
              style={({ pressed }) => [styles.hostRow, pressed && styles.hostRowPressed]}
              onPress={canOpenOrganizer ? onOpenOrganizer : undefined}
              disabled={!canOpenOrganizer}
              accessibilityRole={canOpenOrganizer ? 'button' : undefined}
              accessibilityLabel={`Open organizer ${hostLabel} profile`}>
              <View style={styles.hostAvatar}>
                {organizer?.avatarUrl ? (
                  <Image
                    source={{ uri: organizer.avatarUrl }}
                    style={styles.hostAvatarImage}
                    contentFit="cover"
                  />
                ) : (
                  <MaterialIcons name="eco" size={20} color="#0f766e" />
                )}
              </View>
              <View style={styles.hostTextWrap}>
                <ThemedText style={styles.hostLabel}>Organizer</ThemedText>
                <ThemedText type="defaultSemiBold" style={styles.hostName} numberOfLines={1}>
                  {hostLabel}
                </ThemedText>
              </View>
              {canOpenOrganizer ? (
                <MaterialIcons name="chevron-right" size={22} color="#94a3b8" />
              ) : null}
            </Pressable>

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

            {timeline.length > 0 ? (
              <>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                  Schedule
                </ThemedText>
                <ActivityTimelineList
                  entries={timeline}
                  multiDay={
                    new Date(activity.start_time).toDateString() !==
                    new Date(activity.end_time).toDateString()
                  }
                  accentColor={PRIMARY}
                />
              </>
            ) : null}

            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              About the activity
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
            </>
          ) : (
            <>
              {priorParticipation && !hasActiveRegistration ? (
                <View style={styles.priorStatusHint}>
                  <MaterialIcons name="history" size={16} color="#64748b" />
                  <ThemedText style={styles.priorStatusHintText}>
                    Previous registration: {formatParticipationStatus(priorParticipation.status)}
                  </ThemedText>
                </View>
              ) : null}
              {registerBlockedByOtherApproval ? (
                <View style={styles.commitmentHint}>
                  <MaterialIcons name="info-outline" size={18} color="#b45309" />
                  <ThemedText style={styles.commitmentHintText}>
                    You already have an approved registration for another activity. Cancel it first to
                    join this one.
                  </ThemedText>
                </View>
              ) : registerBlockedByConflict && timeConflict ? (
                <View style={styles.conflictHint}>
                  <MaterialIcons name="schedule" size={18} color="#7c3aed" />
                  <ThemedText style={styles.conflictHintText}>
                    Schedule conflict with &quot;{timeConflict.conflicting.activityName}&quot;. Cancel
                    that registration first to join this one.
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
                          : registerBlockedByConflict
                            ? 'Schedule conflict'
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
    gap: 12,
    marginTop: 4,
    marginBottom: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  hostRowPressed: {
    opacity: 0.85,
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hostAvatarImage: {
    width: 40,
    height: 40,
  },
  hostTextWrap: {
    flex: 1,
  },
  hostLabel: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hostName: {
    fontSize: 16,
    color: '#0f172a',
    marginTop: 2,
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
  priorStatusHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  priorStatusHintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748b',
  },
  conflictHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#f5f3ff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  conflictHintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#5b21b6',
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
