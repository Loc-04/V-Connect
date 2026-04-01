import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '@/src/features/auth';
import { ThemedText } from '@/src/shared/ui/themed-text';
import { ThemedView } from '@/src/shared/ui/themed-view';

import {
  collectSelectedSlotKeys,
  createEmptyWeeklyAvailabilityMatrix,
  DEFAULT_DAY_COLUMNS,
  DEFAULT_TIME_BANDS,
  matrixFromSelectedSlotKeys,
  type DayColumnKey,
  type TimeBandId,
  type WeeklyAvailabilityMatrix,
} from './availability-schedule.model';
import {
  getVolunteerAvailableChoices,
  saveVolunteerAvailableChoices,
} from './availability-supabase.service';

export type AvailabilitySketchVariant = 'tab' | 'stack';

const BLOCKED_SAMPLES = [
  {
    id: '1',
    title: 'Annual Vacation',
    range: 'Dec 20 - Jan 05',
    icon: 'calendar' as const,
    tone: 'red' as const,
  },
  {
    id: '2',
    title: 'Study Break',
    range: 'Mar 10 - Mar 14',
    icon: 'flash' as const,
    tone: 'orange' as const,
  },
];

function placeholderAction(label: string) {
  Alert.alert('Coming soon', `${label} is not wired yet.`);
}

type Props = {
  variant: AvailabilitySketchVariant;
};

export function AvailabilitySketchScreen({ variant }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, status: authStatus } = useAuth();
  const [lastMinute, setLastMinute] = useState(true);
  const [weeklyMatrix, setWeeklyMatrix] = useState<WeeklyAvailabilityMatrix>(() =>
    createEmptyWeeklyAvailabilityMatrix(),
  );
  const [slotsLoadState, setSlotsLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setSlotsLoadState('idle');
      setWeeklyMatrix(createEmptyWeeklyAvailabilityMatrix());
      setSlotsError(null);
      return;
    }

    let cancelled = false;
    setSlotsLoadState('loading');
    setSlotsError(null);

    void getVolunteerAvailableChoices(user.id)
      .then((slots) => {
        if (cancelled) return;
        setWeeklyMatrix(matrixFromSelectedSlotKeys(slots));
        setSlotsLoadState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setSlotsLoadState('error');
        setSlotsError(err instanceof Error ? err.message : 'Failed to load availability.');
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSave = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in to save your availability.');
      return;
    }

    if (isSaving) return;
    setIsSaving(true);
    try {
      const payload = collectSelectedSlotKeys(weeklyMatrix);
      await saveVolunteerAvailableChoices(user.id, payload);
      Alert.alert('Saved', 'Your availability was updated.');
    } catch (err) {
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Could not save availability. Check your connection and RLS policies.',
      );
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, user?.id, weeklyMatrix]);

  const toggleSlot = useCallback((band: TimeBandId, day: DayColumnKey) => {
    setWeeklyMatrix((prev) => ({
      ...prev,
      [band]: {
        ...prev[band],
        [day]: !prev[band][day],
      },
    }));
  }, []);

  const handleBack = useCallback(() => {
    if (variant === 'stack' && router.canGoBack()) {
      router.back();
    }
  }, [router, variant]);

  if (authStatus === 'loading') {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color="#07B5FF" />
        <ThemedText style={styles.centeredHint}>Loading session…</ThemedText>
      </ThemedView>
    );
  }

  if (authStatus === 'unauthenticated' || !user) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="defaultSemiBold" style={styles.centeredTitle}>
          Sign in required
        </ThemedText>
        <ThemedText style={styles.centeredHint}>Sign in to view and edit your weekly availability.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.headerSide}>
          {variant === 'stack' ? (
            <Pressable
              accessibilityLabel="Go back"
              hitSlop={12}
              onPress={handleBack}
              style={styles.iconButton}>
              <Ionicons name="chevron-back" size={26} color="#07B5FF" />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>
        <ThemedText type="defaultSemiBold" style={styles.headerTitle}>
          Availability
        </ThemedText>
        <View style={styles.headerSide}>
          <Pressable
            accessibilityLabel="Settings"
            hitSlop={12}
            onPress={() => placeholderAction('Settings')}
            style={styles.iconButton}>
            <Ionicons name="settings-outline" size={22} color="#0A1A2F" />
          </Pressable>
        </View>
      </View>
      <View style={styles.headerRule} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeaderRow}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Weekly Schedule
          </ThemedText>
          <View style={styles.aiBadge}>
            <ThemedText style={styles.aiBadgeText}>AI POWERED</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.sectionDesc}>
          Set your recurring availability for weekly volunteer sessions.
        </ThemedText>

        {slotsLoadState === 'loading' && (
          <View style={styles.loadRow}>
            <ActivityIndicator color="#07B5FF" />
            <ThemedText style={styles.loadRowText}>Loading your schedule…</ThemedText>
          </View>
        )}

        {slotsLoadState === 'error' && slotsError ? (
          <View style={styles.errorBanner}>
            <ThemedText style={styles.errorBannerText}>{slotsError}</ThemedText>
            <Pressable
              onPress={() => {
                if (!user?.id) return;
                setSlotsLoadState('loading');
                setSlotsError(null);
                void getVolunteerAvailableChoices(user.id)
                  .then((slots) => {
                    setWeeklyMatrix(matrixFromSelectedSlotKeys(slots));
                    setSlotsLoadState('ready');
                  })
                  .catch((err) => {
                    setSlotsLoadState('error');
                    setSlotsError(err instanceof Error ? err.message : 'Failed to load.');
                  });
              }}
              style={styles.retryLink}>
              <ThemedText style={styles.retryLinkText}>Retry</ThemedText>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.timeSlotGrid}>
          <View style={styles.timeSlotGridHeaderRow}>
            <View style={styles.timeSlotCornerCell} />
            {DEFAULT_DAY_COLUMNS.map((col) => (
              <View key={col.key} style={styles.timeSlotDayHeader}>
                <ThemedText style={styles.timeSlotDayHeaderText}>{col.shortLabel}</ThemedText>
              </View>
            ))}
          </View>
          {DEFAULT_TIME_BANDS.map((band) => (
            <View key={band.id} style={styles.timeSlotGridRow}>
              <View style={styles.timeSlotRowLabelCell}>
                <ThemedText style={styles.timeSlotRowLabel}>{band.label}</ThemedText>
              </View>
              {DEFAULT_DAY_COLUMNS.map((col) => {
                const available = weeklyMatrix[band.id][col.key];
                return (
                  <Pressable
                    key={`${band.id}-${col.key}`}
                    accessibilityLabel={`${band.label} ${col.shortLabel}, ${
                      available ? 'available' : 'unavailable'
                    }`}
                    accessibilityRole="button"
                    onPress={() => toggleSlot(band.id, col.key)}
                    disabled={slotsLoadState === 'loading'}
                    style={({ pressed }) => [
                      styles.timeSlotCell,
                      available ? styles.timeSlotCellOn : styles.timeSlotCellOff,
                      pressed && slotsLoadState !== 'loading' && styles.timeSlotCellPressed,
                    ]}>
                    {available ? (
                      <View style={styles.timeSlotCellCheck}>
                        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={styles.timeSlotCellEmpty} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        <ThemedText style={styles.gridHint}>
          Tap cells to select time slots. Save writes to your profile (available_choices).
        </ThemedText>

        <View style={styles.blockedHeaderRow}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Blocked Dates
          </ThemedText>
          <Pressable onPress={() => placeholderAction('Add blocked date')}>
            <ThemedText style={styles.addLink}>+ Add</ThemedText>
          </Pressable>
        </View>
        <ThemedText style={styles.sectionDesc}>
          Mark holidays, vacations, or specific dates you won&apos;t be available.
        </ThemedText>

        {BLOCKED_SAMPLES.map((item) => (
          <View key={item.id} style={styles.blockedCard}>
            <View
              style={[
                styles.blockedIconWrap,
                item.tone === 'red' ? styles.blockedIconRed : styles.blockedIconOrange,
              ]}>
              <Ionicons
                name={item.icon}
                size={20}
                color={item.tone === 'red' ? '#DC2626' : '#EA580C'}
              />
            </View>
            <View style={styles.blockedTextCol}>
              <ThemedText type="defaultSemiBold" style={styles.blockedTitle}>
                {item.title}
              </ThemedText>
              <ThemedText style={styles.blockedRange}>{item.range}</ThemedText>
            </View>
            <Pressable
              accessibilityLabel={`Remove ${item.title}`}
              hitSlop={10}
              onPress={() => placeholderAction(`Remove ${item.title}`)}
              style={styles.removeBtn}>
              <Ionicons name="close" size={22} color="#94A3B8" />
            </Pressable>
          </View>
        ))}

        <View style={styles.toggleRow}>
          <ThemedText style={styles.toggleLabel}>Accept Last Minute Calls</ThemedText>
          <Switch
            accessibilityLabel="Accept last minute calls"
            onValueChange={setLastMinute}
            thumbColor="#FFFFFF"
            trackColor={{ false: '#CBD5E1', true: '#07B5FF' }}
            value={lastMinute}
          />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 16),
            paddingHorizontal: 16,
          },
        ]}>
        <Pressable
          onPress={() => void handleSave()}
          disabled={isSaving || slotsLoadState === 'loading' || slotsLoadState === 'error'}
          style={({ pressed }) => [
            styles.saveButton,
            (isSaving || slotsLoadState === 'loading' || slotsLoadState === 'error') &&
              styles.saveButtonDisabled,
            pressed && !isSaving && slotsLoadState === 'ready' && styles.saveButtonPressed,
          ]}>
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Ionicons name="save-outline" size={22} color="#FFFFFF" />
          )}
          <ThemedText darkColor="#FFFFFF" lightColor="#FFFFFF" style={styles.saveButtonText}>
            {isSaving ? 'Saving…' : 'Save Changes'}
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  centeredTitle: {
    fontSize: 18,
    color: '#0A1A2F',
    marginBottom: 8,
    textAlign: 'center',
  },
  centeredHint: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  loadRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadRowText: {
    fontSize: 14,
    color: '#64748B',
  },
  errorBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorBannerText: {
    fontSize: 13,
    color: '#B91C1C',
  },
  retryLink: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  retryLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#07B5FF',
  },
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  headerSide: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  headerTitle: {
    fontSize: 18,
    color: '#0A1A2F',
  },
  iconButton: {
    padding: 8,
  },
  headerRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: 17,
    color: '#0A1A2F',
  },
  aiBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
    letterSpacing: 0.3,
  },
  sectionDesc: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
  },
  timeSlotGrid: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FAFAFA',
  },
  timeSlotGridHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  timeSlotCornerCell: {
    width: 56,
    minHeight: 36,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  timeSlotDayHeader: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  timeSlotDayHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  timeSlotGridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  timeSlotRowLabelCell: {
    width: 56,
    paddingHorizontal: 6,
    paddingVertical: 10,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  timeSlotRowLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  timeSlotCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  timeSlotCellOn: {
    backgroundColor: '#E0F2FE',
  },
  timeSlotCellOff: {
    backgroundColor: '#FFFFFF',
  },
  timeSlotCellPressed: {
    opacity: 0.85,
  },
  timeSlotCellCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#07B5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeSlotCellEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
  },
  gridHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 16,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  blockedHeaderRow: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addLink: {
    fontSize: 15,
    fontWeight: '600',
    color: '#07B5FF',
  },
  blockedCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#EEF2F7',
  },
  blockedIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedIconRed: {
    backgroundColor: '#FEE2E2',
  },
  blockedIconOrange: {
    backgroundColor: '#FFEDD5',
  },
  blockedTextCol: {
    flex: 1,
    marginLeft: 12,
  },
  blockedTitle: {
    fontSize: 16,
    color: '#0A1A2F',
  },
  blockedRange: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748B',
  },
  removeBtn: {
    padding: 6,
  },
  toggleRow: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 16,
    color: '#0A1A2F',
    flex: 1,
    paddingRight: 12,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#07B5FF',
    borderRadius: 16,
    minHeight: 52,
    paddingHorizontal: 20,
  },
  saveButtonPressed: {
    opacity: 0.9,
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700',
  },
});
