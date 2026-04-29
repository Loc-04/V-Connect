import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  approveRegistration,
  cancelOrganizerRegistration,
  fetchOrganizerParticipations,
  rejectRegistration,
  type OrganizerRegistrationItem,
} from '@/src/features/participations';
import { ThemedText } from '@/src/shared/ui/themed-text';

type LoadState = 'loading' | 'ready' | 'error';

function getVolunteerName(item: OrganizerRegistrationItem): string {
  const name = item.volunteer?.full_name?.trim();
  return name && name.length > 0 ? name : 'Unnamed volunteer';
}

function normalizeStatus(status: string | undefined | null): string {
  return String(status ?? '').trim().toLowerCase();
}

function canOrganizerCancelStatus(status: string | undefined | null): boolean {
  const s = normalizeStatus(status);
  // checked-in is the only hard-blocked state for cancellation.
  return s !== 'checked_in' && s !== 'cancelled';
}

const STATUS_STYLES: Record<
  string,
  {
    bg: string;
    fg: string;
    label: string;
  }
> = {
  pending: { bg: '#fef3c7', fg: '#b45309', label: 'Pending' },
  approved: { bg: '#d1fae5', fg: '#047857', label: 'Approved' },
  assigned: { bg: '#e0f2fe', fg: '#0369a1', label: 'Assigned' },
  rejected: { bg: '#fee2e2', fg: '#b91c1c', label: 'Rejected' },
  cancelled: { bg: '#f3f4f6', fg: '#4b5563', label: 'Cancelled' },
  checked_in: { bg: '#dbeafe', fg: '#1d4ed8', label: 'Checked in' },
};

function getStatusStyle(status: string | undefined | null) {
  const s = normalizeStatus(status);
  return STATUS_STYLES[s] ?? { bg: '#eef2f2', fg: '#374151', label: 'Unknown' };
}

export default function RegisterManagementScreen() {
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<OrganizerRegistrationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);

  const loadRegistrations = useCallback(async () => {
    setState('loading');
    setErrorMessage(null);

    try {
      const registrations = await fetchOrganizerParticipations(300);
      setItems(registrations.filter((r) => normalizeStatus(r.status) !== 'cancelled'));
      setState('ready');
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load registrations.');
    }
  }, []);

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const registrations = await fetchOrganizerParticipations(300);
      setItems(registrations.filter((r) => normalizeStatus(r.status) !== 'cancelled'));
      setState('ready');
      setErrorMessage(null);
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh registrations.');
    } finally {
      setRefreshing(false);
    }
  }, [loadRegistrations]);

  const handleApprove = useCallback(async (item: OrganizerRegistrationItem) => {
    setProcessingId(item.id);
    try {
      const result = await approveRegistration(item.id);
      setItems((prev) => prev.map((entry) => (entry.id === item.id ? result.registration : entry)));
      Alert.alert('Approved', result.message ?? `${getVolunteerName(item)} was approved successfully.`);
    } catch (error) {
      Alert.alert('Approve failed', error instanceof Error ? error.message : 'Unable to approve registration.');
    } finally {
      setProcessingId(null);
    }
  }, []);

  const handleReject = useCallback(async (item: OrganizerRegistrationItem) => {
    Alert.alert('Reject registration', `Reject ${getVolunteerName(item)} for ${item.activityName ?? 'this activity'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setProcessingId(item.id);
          try {
            const result = await rejectRegistration(item.id);
            setItems((prev) => prev.map((entry) => (entry.id === item.id ? result.registration : entry)));
            Alert.alert('Rejected', result.message ?? `${getVolunteerName(item)} was rejected.`);
          } catch (error) {
            Alert.alert(
              'Reject failed',
              error instanceof Error ? error.message : 'Unable to reject registration.',
            );
          } finally {
            setProcessingId(null);
          }
        },
      },
    ]);
  }, []);

  const handleCancelRegistration = useCallback(async (item: OrganizerRegistrationItem) => {
    if (!canOrganizerCancelStatus(item.status)) return;

    Alert.alert(
      'Cancel registration',
      `Cancel ${getVolunteerName(item)} on "${item.activityName ?? 'this activity'}"?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancel registration',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(item.id);
            try {
              const result = await cancelOrganizerRegistration(item.id);
              setItems((prev) => prev.filter((entry) => entry.id !== item.id));
              Alert.alert('Cancelled', result.message ?? 'Registration cancelled.');
            } catch (error) {
              Alert.alert(
                'Cancel failed',
                error instanceof Error ? error.message : 'Unable to cancel this registration.',
              );
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  }, []);

  const groups = useMemo(() => {
    type Group = {
      activityId: string;
      activityName: string;
      registrations: OrganizerRegistrationItem[];
    };

    const map = new Map<string, Group>();
    for (const r of items) {
      const activityId = r.activity_id;
      const existing = map.get(activityId);
      if (existing) {
        existing.registrations.push(r);
      } else {
        map.set(activityId, {
          activityId,
          activityName: r.activityName ?? 'Untitled activity',
          registrations: [r],
        });
      }
    }

    const statusPriority: Record<string, number> = {
      pending: 0,
      approved: 1,
      assigned: 2,
      rejected: 3,
      checked_in: 4,
    };

    const toTs = (v: string | null | undefined) => {
      if (!v) return 0;
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : 0;
    };

    const result: Group[] = Array.from(map.values()).map((g) => {
      g.registrations.sort((a, b) => {
        const sa = normalizeStatus(a.status);
        const sb = normalizeStatus(b.status);
        const pa = statusPriority[sa] ?? 999;
        const pb = statusPriority[sb] ?? 999;
        if (pa !== pb) return pa - pb;
        return getVolunteerName(a).localeCompare(getVolunteerName(b));
      });
      return g;
    });

    result.sort((a, b) => {
      const ta = toTs(a.registrations[0]?.date ?? null);
      const tb = toTs(b.registrations[0]?.date ?? null);
      return tb - ta;
    });

    return result;
  }, [items]);

  if (state === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f8a8a" />
        <ThemedText style={styles.statusText}>Loading registrations...</ThemedText>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.centered}>
        <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
        <Pressable style={styles.retryButton} onPress={() => void loadRegistrations()}>
          <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText style={styles.helperText}>
          Manage registrations for your activities. Approve/reject pending requests, or cancel any volunteer registration.
        </ThemedText>

        {groups.length > 0 ? (
          groups.map((group) => {
            const expanded = expandedActivityId === group.activityId;
            const pendingCount = group.registrations.filter((r) => normalizeStatus(r.status) === 'pending').length;
            const approvedCount = group.registrations.filter((r) => normalizeStatus(r.status) === 'approved').length;
            return (
              <View key={group.activityId} style={styles.activityWrap}>
                <Pressable
                  onPress={() => setExpandedActivityId(expanded ? null : group.activityId)}
                  style={styles.activityCard}
                >
                  <View style={styles.activityHeaderRow}>
                    <MaterialIcons name="event-note" size={18} color="#0f766e" />
                    <ThemedText type="defaultSemiBold" style={styles.activityName}>
                      {group.activityName}
                    </ThemedText>
                    <View style={styles.activityCounts}>
                      <ThemedText style={styles.activityCountText}>{pendingCount} pending</ThemedText>
                      <ThemedText style={styles.activityCountText}>{approvedCount} approved</ThemedText>
                    </View>
                    <MaterialIcons
                      name={expanded ? 'expand-less' : 'expand-more'}
                      size={20}
                      color="#94a3b8"
                    />
                  </View>
                </Pressable>

                {expanded ? (
                  <View style={styles.activityRegistrations}>
                    {group.registrations.map((item) => {
                      const statusKey = normalizeStatus(item.status);
                      const isProcessing = processingId === item.id;
                      const statusStyle = getStatusStyle(item.status);
                      const showApproveReject = statusKey === 'pending';
                      const canCancel = canOrganizerCancelStatus(item.status);

                      return (
                        <View key={item.id} style={styles.registrationCard}>
                          <View style={styles.registrationTopRow}>
                            <View style={styles.volunteerRow}>
                              <MaterialIcons name="person" size={14} color="#6b7280" />
                              <ThemedText style={styles.volunteerText}>{getVolunteerName(item)}</ThemedText>
                            </View>
                            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                              <ThemedText style={[styles.statusBadgeText, { color: statusStyle.fg }]}>
                                {statusStyle.label}
                              </ThemedText>
                            </View>
                          </View>

                          {typeof item.ai_match_score === 'number' ? (
                            <View style={styles.metaRow}>
                              <MaterialIcons name="auto-awesome" size={14} color="#6b7280" />
                              <ThemedText style={styles.metaText}>
                                Match score: {Math.round(item.ai_match_score * 100)}%
                              </ThemedText>
                            </View>
                          ) : null}

                          <View style={styles.actionsRow}>
                            {showApproveReject ? (
                              <>
                                <Pressable
                                  style={[
                                    styles.actionButton,
                                    styles.approveButton,
                                    isProcessing ? styles.actionDisabled : null,
                                  ]}
                                  disabled={isProcessing}
                                  onPress={() => void handleApprove(item)}
                                >
                                  <ThemedText style={styles.approveText}>
                                    {isProcessing ? 'Processing...' : 'Approve'}
                                  </ThemedText>
                                </Pressable>
                                <Pressable
                                  style={[
                                    styles.actionButton,
                                    styles.rejectButton,
                                    isProcessing ? styles.actionDisabled : null,
                                  ]}
                                  disabled={isProcessing}
                                  onPress={() => void handleReject(item)}
                                >
                                  <ThemedText style={styles.rejectText}>Reject</ThemedText>
                                </Pressable>
                              </>
                            ) : (
                              <View style={styles.actionsPlaceholder} />
                            )}

                            <Pressable
                              style={[
                                styles.binButton,
                                (!canCancel || isProcessing) ? styles.binButtonDisabled : null,
                              ]}
                              disabled={!canCancel || isProcessing}
                              onPress={() => void handleCancelRegistration(item)}
                              accessibilityRole="button"
                              accessibilityLabel="Cancel volunteer registration"
                            >
                              <MaterialIcons
                                name="delete"
                                size={20}
                                color={!canCancel || isProcessing ? '#ef4444' : '#b91c1c'}
                              />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })
        ) : (
          <View style={styles.emptyWrap}>
            <ThemedText style={styles.emptyText}>No registrations found.</ThemedText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#ffffff',
  },
  statusText: {
    marginTop: 12,
    opacity: 0.7,
  },
  errorText: {
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
  helperText: {
    marginBottom: 12,
    color: '#4b5563',
    fontSize: 13,
  },
  activityWrap: {
    marginBottom: 12,
  },
  activityCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eceff1',
    backgroundColor: '#f8faf9',
    padding: 12,
  },
  activityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activityName: {
    flex: 1,
    fontSize: 17,
    color: '#1f2937',
  },
  activityCounts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activityCountText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  activityRegistrations: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  registrationCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 12,
    marginBottom: 10,
  },
  registrationTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  volunteerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  volunteerText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'none',
  },
  metaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: '#4b5563',
  },
  actionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionsPlaceholder: {
    flex: 1,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#0f8a8a',
  },
  rejectButton: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  approveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  rejectText: {
    color: '#b91c1c',
    fontWeight: '700',
  },
  actionDisabled: {
    opacity: 0.6,
  },
  binButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fff5f5',
  },
  binButtonDisabled: {
    opacity: 0.55,
  },
  emptyWrap: {
    marginTop: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eceff1',
    paddingVertical: 20,
    paddingHorizontal: 12,
    backgroundColor: '#f8faf9',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
  },
});
