import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getActivity, type ActivityRecord } from '@/src/features/organizer-activities';
import {
  checkInByVolunteer,
  getRegistrationByVolunteer,
  parseVolunteerIdFromQrPayload,
} from '@/src/features/organizer-check-in';
import { ThemedText } from '@/src/shared/ui/themed-text';

type LookupState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'result'; volunteerId: string; participation: Record<string, unknown> | null };

function volunteerName(participation: Record<string, unknown> | null): string {
  if (!participation) return '';
  const v = participation.volunteer as { full_name?: string } | undefined;
  return typeof v?.full_name === 'string' ? v.full_name : '';
}

export default function OrganizerActivityCheckInScreen() {
  const insets = useSafeAreaInsets();
  const { id: activityId } = useLocalSearchParams<{ id: string }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [activity, setActivity] = useState<ActivityRecord | null>(null);
  const [manualId, setManualId] = useState('');
  const [lookup, setLookup] = useState<LookupState>({ kind: 'idle' });
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    void (async () => {
      try {
        const a = await getActivity(activityId);
        if (!cancelled) setActivity(a);
      } catch {
        // title optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  const runLookup = useCallback(
    async (volunteerIdRaw: string) => {
      const volunteerId = parseVolunteerIdFromQrPayload(volunteerIdRaw);
      if (!volunteerId || !activityId) {
        Alert.alert('Invalid QR', 'Could not read a volunteer id from the code.');
        return;
      }

      setLookup({ kind: 'loading' });
      try {
        const res = await getRegistrationByVolunteer(activityId, volunteerId);
        setLookup({ kind: 'result', volunteerId, participation: res.participation });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Lookup failed.';
        setLookup({ kind: 'error', message });
      }
    },
    [activityId],
  );

  const onBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      const t = String(data ?? '').trim();
      if (t) void runLookup(t);
    },
    [runLookup],
  );

  const onCheckIn = useCallback(async () => {
    if (lookup.kind !== 'result' || !activityId) return;
    const { volunteerId, participation } = lookup;
    if (!participation || String(participation.status) !== 'approved') {
      Alert.alert('Cannot check in', 'Registration must be approved before check-in.');
      return;
    }

    setCheckInBusy(true);
    try {
      await checkInByVolunteer(activityId, volunteerId);
      Alert.alert('Checked in', 'Attendance recorded.', [
        {
          text: 'OK',
          onPress: () => {
            setLookup({ kind: 'idle' });
            router.back();
          },
        },
      ]);
    } catch (e) {
      Alert.alert('Check-in failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setCheckInBusy(false);
    }
  }, [activityId, lookup]);

  const scanEnabled = Boolean(permission?.granted && activityId);

  const statusHint = useMemo(() => {
    if (lookup.kind !== 'result') return null;
    const p = lookup.participation;
    if (!p) {
      return <ThemedText style={styles.warn}>No registration found for this activity.</ThemedText>;
    }
    const st = String(p.status ?? '');
    const name = volunteerName(p);
    return (
      <View style={styles.statusBox}>
        {name ? (
          <ThemedText type="defaultSemiBold" style={styles.statusName}>
            {name}
          </ThemedText>
        ) : null}
        <ThemedText style={styles.statusLine}>Status: {st}</ThemedText>
        {st === 'approved' ? (
          <Pressable
            style={[styles.primaryBtn, checkInBusy && styles.btnDisabled]}
            disabled={checkInBusy}
            onPress={() => void onCheckIn()}
          >
            {checkInBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.primaryBtnText}>Check in now</ThemedText>
            )}
          </Pressable>
        ) : (
          <ThemedText style={styles.warn}>
            {st === 'checked_in'
              ? 'Already checked in.'
              : 'Volunteer cannot be checked in with this registration status.'}
          </ThemedText>
        )}
      </View>
    );
  }, [lookup, checkInBusy, onCheckIn]);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
      style={styles.root}
    >
      {activity?.title ? (
        <ThemedText type="defaultSemiBold" style={styles.activityTitle} numberOfLines={2}>
          {activity.title}
        </ThemedText>
      ) : null}

      <ThemedText style={styles.helper}>Scan the volunteer&apos;s QR (volunteer user id).</ThemedText>

      <View style={styles.cameraWrap}>
        {scanEnabled ? (
          <>
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              flash={flashOn ? 'on' : 'off'}
              onBarcodeScanned={onBarcodeScanned}
              style={styles.camera}
            />
            <Pressable
              style={styles.flashBtn}
              onPress={() => setFlashOn((f) => !f)}
              hitSlop={10}
              accessibilityLabel="Toggle flash"
            >
              <MaterialIcons name={flashOn ? 'flash-on' : 'flash-off'} size={22} color="#0f766e" />
            </Pressable>
          </>
        ) : (
          <View style={styles.permissionBox}>
            {permission?.granted === false ? (
              <>
                <ThemedText style={styles.muted}>Camera permission is needed to scan QR codes.</ThemedText>
                <Pressable style={styles.secondaryBtn} onPress={() => void requestPermission()}>
                  <ThemedText style={styles.secondaryBtnText}>Grant camera access</ThemedText>
                </Pressable>
              </>
            ) : (
              <ActivityIndicator color="#0f8a8a" />
            )}
          </View>
        )}
      </View>

      <View style={styles.manualBlock}>
        <ThemedText type="defaultSemiBold" style={styles.manualLabel}>
          Or paste volunteer UUID
        </ThemedText>
        <TextInput
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          placeholderTextColor="#9ca3af"
          style={styles.input}
          value={manualId}
          onChangeText={setManualId}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={styles.secondaryBtn} onPress={() => void runLookup(manualId)}>
          <ThemedText style={styles.secondaryBtnText}>Look up registration</ThemedText>
        </Pressable>
      </View>

      {lookup.kind === 'loading' ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color="#0f8a8a" />
          <ThemedText style={styles.muted}>Looking up...</ThemedText>
        </View>
      ) : null}
      {lookup.kind === 'error' ? (
        <ThemedText style={styles.errorText}>{lookup.message}</ThemedText>
      ) : null}
      {statusHint}

      <Pressable onPress={() => router.back()} style={styles.backLink}>
        <ThemedText style={styles.backLinkText}>Back to activities</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scroll: {
    paddingHorizontal: 16,
  },
  activityTitle: {
    fontSize: 18,
    color: '#111827',
    marginBottom: 6,
  },
  helper: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 12,
  },
  cameraWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#f3f4f6',
    minHeight: 240,
    position: 'relative',
  },
  camera: {
    height: 260,
    width: '100%',
  },
  flashBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: '#ffffffee',
    borderRadius: 20,
    padding: 8,
  },
  permissionBox: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  muted: {
    color: '#6b7280',
    fontSize: 14,
  },
  manualBlock: {
    marginBottom: 16,
    gap: 8,
  },
  manualLabel: {
    fontSize: 14,
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  secondaryBtnText: {
    color: '#0f766e',
    fontWeight: '600',
  },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: '#0f8a8a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  errorText: {
    color: '#dc2626',
    marginBottom: 8,
  },
  statusBox: {
    marginTop: 4,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f8faf9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eceff1',
  },
  statusName: {
    fontSize: 17,
    marginBottom: 4,
    color: '#111827',
  },
  statusLine: {
    fontSize: 14,
    color: '#4b5563',
  },
  warn: {
    marginTop: 8,
    color: '#b45309',
    fontSize: 14,
  },
  backLink: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  backLinkText: {
    color: '#0f766e',
    fontWeight: '600',
  },
});
