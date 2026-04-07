import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useState } from 'react';
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
  fetchPendingRegistrationsForOrganizer,
  rejectRegistration,
  type OrganizerRegistrationItem,
} from '@/src/features/participations';
import { ThemedText } from '@/src/shared/ui/themed-text';

type LoadState = 'loading' | 'ready' | 'error';

function getVolunteerName(item: OrganizerRegistrationItem): string {
  const name = item.volunteer?.full_name?.trim();
  return name && name.length > 0 ? name : 'Unnamed volunteer';
}

export default function RegisterManagementScreen() {
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<OrganizerRegistrationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadPendingRegistrations = useCallback(async () => {
    setState('loading');
    setErrorMessage(null);

    try {
      const registrations = await fetchPendingRegistrationsForOrganizer(100);
      setItems(registrations);
      setState('ready');
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load pending registrations.');
    }
  }, []);

  useEffect(() => {
    void loadPendingRegistrations();
  }, [loadPendingRegistrations]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const registrations = await fetchPendingRegistrationsForOrganizer(100);
      setItems(registrations);
      setState('ready');
      setErrorMessage(null);
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh pending registrations.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleApprove = useCallback(async (item: OrganizerRegistrationItem) => {
    setProcessingId(item.id);
    try {
      const result = await approveRegistration(item.id);
      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
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
            setItems((prev) => prev.filter((entry) => entry.id !== item.id));
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

  if (state === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f8a8a" />
        <ThemedText style={styles.statusText}>Loading pending registrations...</ThemedText>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.centered}>
        <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
        <Pressable style={styles.retryButton} onPress={() => void loadPendingRegistrations()}>
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
          Review pending volunteer requests. Approve to confirm participation or reject to decline.
        </ThemedText>

        {items.length > 0 ? (
          items.map((item) => {
            const isProcessing = processingId === item.id;
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <MaterialIcons name="event-note" size={18} color="#0f766e" />
                  <ThemedText type="defaultSemiBold" style={styles.activityName}>
                    {item.activityName ?? 'Untitled activity'}
                  </ThemedText>
                </View>

                <View style={styles.metaRow}>
                  <MaterialIcons name="person" size={14} color="#6b7280" />
                  <ThemedText style={styles.metaText}>{getVolunteerName(item)}</ThemedText>
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
                  <Pressable
                    style={[styles.actionButton, styles.approveButton, isProcessing ? styles.actionDisabled : null]}
                    disabled={isProcessing}
                    onPress={() => void handleApprove(item)}
                  >
                    <ThemedText style={styles.approveText}>
                      {isProcessing ? 'Processing...' : 'Approve'}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.rejectButton, isProcessing ? styles.actionDisabled : null]}
                    disabled={isProcessing}
                    onPress={() => void handleReject(item)}
                  >
                    <ThemedText style={styles.rejectText}>Reject</ThemedText>
                  </Pressable>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyWrap}>
            <ThemedText style={styles.emptyText}>No pending registrations.</ThemedText>
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
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eceff1',
    backgroundColor: '#f8faf9',
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activityName: {
    flex: 1,
    fontSize: 17,
    color: '#1f2937',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: '#4b5563',
  },
  actionsRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 10,
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
