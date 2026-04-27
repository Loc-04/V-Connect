import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  ActivityTimelineEditor,
  createActivityTimelineItem,
  deleteActivity,
  deleteActivityTimelineItem,
  getActivity,
  listActivityTimeline,
  mapServerRowsToEntries,
  sortTimelineEntries,
  updateActivity,
  updateActivityCoverImageUrl,
  updateActivityTimelineItem,
  fetchSkillOptions,
  fetchProvinceOptions,
  fetchWardOptions,
  validateActivityTimeline,
  type ActivityRecord,
  type ActivityStatus,
  type ActivityTimelineEntry,
  type SkillOption,
  type ProvinceOption,
  type WardOption,
} from '@/src/features/organizer-activities';
import { pickImageFromLibrary, compressImage, assertUnderMaxBytes, uploadJpegAndGetPublicUrl } from '@/src/shared/lib/image-upload';
import { ThemedText } from '@/src/shared/ui/themed-text';

type LoadState = 'loading' | 'ready' | 'error';
type PickerField = 'startDate' | 'startTime' | 'endDate' | 'endTime';

const ALL_STATUSES: ActivityStatus[] = ['draft', 'published', 'completed', 'cancelled'];

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function locationToString(loc: ActivityRecord['location']): string {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  return loc.address ?? '';
}

export default function EditActivityScreen() {
  const { id, readOnly } = useLocalSearchParams<{ id: string; readOnly?: string }>();
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [original, setOriginal] = useState<ActivityRecord | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDateTime, setStartDateTime] = useState<Date>(new Date());
  const [endDateTime, setEndDateTime] = useState<Date>(new Date());
  const [capacity, setCapacity] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [provinceCode, setProvinceCode] = useState<string | null>(null);
  const [wardCode, setWardCode] = useState<string | null>(null);
  const [status, setStatus] = useState<ActivityStatus>('draft');
  const [pendingCoverUri, setPendingCoverUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [timelineEntries, setTimelineEntries] = useState<ActivityTimelineEntry[]>([]);
  const [originalTimelineEntries, setOriginalTimelineEntries] = useState<ActivityTimelineEntry[]>([]);

  const [skillOptions, setSkillOptions] = useState<SkillOption[]>([]);
  const [provinceOptions, setProvinceOptions] = useState<ProvinceOption[]>([]);
  const [wardOptions, setWardOptions] = useState<WardOption[]>([]);

  const [skillsOpen, setSkillsOpen] = useState(false);
  const [provinceOpen, setProvinceOpen] = useState(false);
  const [wardOpen, setWardOpen] = useState(false);

  const [activePicker, setActivePicker] = useState<PickerField | null>(null);
  const [initialWardLoaded, setInitialWardLoaded] = useState(false);

  useEffect(() => {
    void fetchSkillOptions().then(setSkillOptions).catch(() => { });
    void fetchProvinceOptions().then(setProvinceOptions).catch(() => { });
  }, []);

  useEffect(() => {
    if (provinceCode) {
      void fetchWardOptions(provinceCode)
        .then((opts) => {
          setWardOptions(opts);
          if (initialWardLoaded) {
            setWardCode(null);
          } else {
            setInitialWardLoaded(true);
          }
        })
        .catch(() => {
          setWardOptions([]);
        });
    } else {
      setWardOptions([]);
      if (initialWardLoaded) {
        setWardCode(null);
      }
    }
  }, [provinceCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePickCover = useCallback(async () => {
    const uri = await pickImageFromLibrary();
    if (uri) setPendingCoverUri(uri);
  }, []);

  const toggleSkill = useCallback((skillName: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName],
    );
  }, []);

  const handlePickerChange = useCallback(
    (field: PickerField) => (_event: DateTimePickerEvent, selected?: Date) => {
      setActivePicker(null);
      if (!selected) return;

      if (field === 'startDate') {
        setStartDateTime((prev) => {
          const next = new Date(prev);
          next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
          return next;
        });
      } else if (field === 'startTime') {
        setStartDateTime((prev) => {
          const next = new Date(prev);
          next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
          return next;
        });
      } else if (field === 'endDate') {
        setEndDateTime((prev) => {
          const next = new Date(prev);
          next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
          return next;
        });
      } else if (field === 'endTime') {
        setEndDateTime((prev) => {
          const next = new Date(prev);
          next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
          return next;
        });
      }
    },
    [],
  );

  const loadActivity = useCallback(async () => {
    if (!id) return;
    setState('loading');
    setErrorMsg(null);
    try {
      const data = await getActivity(id);
      setOriginal(data);
      setTitle(data.title);
      setDescription(data.description);
      setLocation(locationToString(data.location));
      setStartDateTime(new Date(data.start_time));
      setEndDateTime(new Date(data.end_time));
      setCapacity(String(data.capacity));
      setSelectedSkills(data.required_skills ?? []);
      setProvinceCode(data.province_code ?? null);
      setWardCode(data.ward_code ?? null);
      setStatus(data.status);

      try {
        const rows = await listActivityTimeline(id);
        const mapped = mapServerRowsToEntries(rows);
        setTimelineEntries(mapped);
        setOriginalTimelineEntries(mapped);
      } catch {
        setTimelineEntries([]);
        setOriginalTimelineEntries([]);
      }

      setState('ready');
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load activity.');
    }
  }, [id]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const buildPatch = useCallback(() => {
    if (!original) return {};
    const patch: Record<string, unknown> = {};
    if (title.trim() !== original.title) patch.title = title.trim();
    if (description.trim() !== original.description) patch.description = description.trim();
    if (location.trim() !== locationToString(original.location)) patch.location = location.trim();

    if (startDateTime.toISOString() !== original.start_time) {
      patch.startTime = startDateTime.toISOString();
    }
    if (endDateTime.toISOString() !== original.end_time) {
      patch.endTime = endDateTime.toISOString();
    }

    const cap = Number(capacity);
    if (Number.isInteger(cap) && cap > 0 && cap !== original.capacity) {
      patch.capacity = cap;
    }

    if (JSON.stringify(selectedSkills) !== JSON.stringify(original.required_skills ?? [])) {
      patch.requiredSkills = selectedSkills;
    }

    if (status !== original.status) patch.status = status;

    const origProvince = original.province_code ?? null;
    if (provinceCode !== origProvince) {
      patch.provinceCode = provinceCode ?? null;
    }

    const origWard = original.ward_code ?? null;
    if (wardCode !== origWard) {
      patch.wardCode = wardCode ?? null;
    }

    return patch;
  }, [original, title, description, location, startDateTime, endDateTime, capacity, selectedSkills, status, provinceCode, wardCode]);

  const handleSave = useCallback(async () => {
    if (!id) return;
    const patch = buildPatch();

    const edited = sortTimelineEntries(timelineEntries);
    const originalTl = sortTimelineEntries(originalTimelineEntries);
    const originalById = new Map(
      originalTl.filter((e) => e.serverId).map((e) => [e.serverId as string, e] as const),
    );
    const editedServerIds = new Set(
      edited.filter((e) => e.serverId).map((e) => e.serverId as string),
    );
    const toDelete = originalTl.filter(
      (e) => e.serverId && !editedServerIds.has(e.serverId),
    );
    const toCreate = edited.filter((e) => !e.serverId);
    const toUpdate = edited.filter((e) => {
      if (!e.serverId) return false;
      const prev = originalById.get(e.serverId);
      if (!prev) return false;
      return (
        prev.title !== e.title ||
        prev.at !== e.at ||
        (prev.description ?? '') !== (e.description ?? '')
      );
    });
    const timelineChanged =
      toCreate.length > 0 || toUpdate.length > 0 || toDelete.length > 0;

    const isPublished = original?.status === 'published';
    const hasDraftFieldOrCover =
      original?.status === 'draft' &&
      (Object.keys(patch).length > 0 || Boolean(pendingCoverUri));

    if (!hasDraftFieldOrCover && !timelineChanged) {
      Alert.alert('No changes', 'Nothing to update.');
      return;
    }

    if (original?.status === 'draft' && patch.startTime && patch.endTime) {
      if (new Date(patch.endTime as string) <= new Date(patch.startTime as string)) {
        Alert.alert('Validation', 'End time must be later than start time.');
        return;
      }
    }

    if (timelineEntries.length > 0) {
      const tlError = validateActivityTimeline(timelineEntries, startDateTime, endDateTime);
      if (tlError) {
        Alert.alert('Timeline invalid', tlError);
        return;
      }
    }

    setSaving(true);
    try {
      const isPublishedTimelineOnly = isPublished;
      if (original?.status === 'draft' && Object.keys(patch).length > 0) {
        await updateActivity(id, patch);
      }
      // Published: only timeline is sent; ignore spurious buildPatch() drift (e.g. date ISO strings).

      if (original?.status === 'draft' && pendingCoverUri) {
        try {
          const compressed = await compressImage(pendingCoverUri);
          await assertUnderMaxBytes(compressed);
          const objectPath = `${id}_${Date.now()}.jpg`;
          const publicUrl = await uploadJpegAndGetPublicUrl('activity_covers', objectPath, compressed);
          await updateActivityCoverImageUrl(id, publicUrl);
        } catch (coverErr) {
          Alert.alert('Cover Upload Failed', coverErr instanceof Error ? coverErr.message : 'Activity was saved but cover upload failed.');
        }
      }

      let timelineSyncFailed = false;

      for (const entry of toDelete) {
        try {
          await deleteActivityTimelineItem(id, entry.serverId as string);
        } catch {
          timelineSyncFailed = true;
        }
      }

      for (const entry of toUpdate) {
        try {
          await updateActivityTimelineItem(id, entry.serverId as string, {
            title: entry.title.trim(),
            description: entry.description ?? '',
            timelineChoice: entry.at,
          });
        } catch {
          timelineSyncFailed = true;
        }
      }

      for (const entry of toCreate) {
        try {
          await createActivityTimelineItem(id, {
            title: entry.title.trim(),
            description: entry.description ?? '',
            timelineChoice: entry.at,
          });
        } catch {
          timelineSyncFailed = true;
        }
      }

      if (timelineChanged) {
        try {
          const refreshed = await listActivityTimeline(id);
          const mapped = mapServerRowsToEntries(refreshed);
          setTimelineEntries(mapped);
          setOriginalTimelineEntries(mapped);
        } catch {
          timelineSyncFailed = true;
        }
      }

      if (timelineSyncFailed) {
        Alert.alert(
          'Timeline partially saved',
          'Some timeline changes could not be saved. Please reopen the activity and try again.',
          [{ text: 'OK' }],
        );
      } else {
        const successMessage = isPublishedTimelineOnly
          ? 'Timeline updated successfully.'
          : 'Activity updated successfully.';
        Alert.alert('Saved', successMessage, [{ text: 'OK', onPress: () => router.back() }]);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSaving(false);
    }
  }, [id, buildPatch, pendingCoverUri, timelineEntries, originalTimelineEntries, startDateTime, endDateTime, original]);

  const handleDelete = useCallback(() => {
    if (!id || !original) return;
    Alert.alert('Delete Activity', `Delete "${original.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteActivity(id);
            Alert.alert('Deleted', 'Activity removed.', [
              { text: 'OK', onPress: () => router.back() },
            ]);
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Delete failed.');
          }
        },
      },
    ]);
  }, [id, original]);

  if (state === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f8a8a" />
        <ThemedText style={styles.statusText}>Loading activity...</ThemedText>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.centered}>
        <ThemedText style={styles.errorText}>{errorMsg}</ThemedText>
        <Pressable style={styles.retryButton} onPress={() => void loadActivity()}>
          <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
        </Pressable>
      </View>
    );
  }

  const isReadOnlyView = readOnly === '1';
  const isDraft = !isReadOnlyView && original?.status === 'draft';
  const canEditTimeline =
    !isReadOnlyView && (original?.status === 'draft' || original?.status === 'published');
  const shouldDimReadOnly = !isDraft && !isReadOnlyView;
  const selectedProvinceName = provinceOptions.find((p) => p.code === provinceCode)?.name;
  const selectedWardName = wardOptions.find((w) => w.code === wardCode)?.name;
  const showSaveButton = isDraft || (original?.status === 'published' && !isReadOnlyView);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!isReadOnlyView && original?.status === 'published' && (
          <View style={styles.publishedTimelineInfoBanner}>
            <MaterialIcons name="event-note" size={16} color="#0f766e" />
            <ThemedText style={styles.publishedTimelineInfoText}>
              Published: you can update the schedule timeline below. Other details are read-only.
            </ThemedText>
          </View>
        )}

        {!isDraft && !isReadOnlyView && original?.status !== 'published' && (
          <View style={styles.readOnlyBanner}>
            <MaterialIcons name="lock-outline" size={16} color="#b45309" />
            <ThemedText style={styles.readOnlyBannerText}>
              {`This activity is ${original?.status}. Only draft activities can be fully edited.`}
            </ThemedText>
          </View>
        )}

        <FieldLabel label="Cover Image" />
        <Pressable
          style={[styles.coverPicker, shouldDimReadOnly && styles.coverPickerDisabled]}
          onPress={() => isDraft && void handlePickCover()}
          disabled={!isDraft}
        >
          {pendingCoverUri || original?.cover_image_url ? (
            <Image
              source={{ uri: pendingCoverUri ?? original!.cover_image_url! }}
              style={styles.coverPreview}
            />
          ) : (
            <View style={styles.coverPlaceholder}>
              <MaterialIcons name="add-photo-alternate" size={32} color="#9ca3af" />
              <ThemedText style={styles.coverPlaceholderText}>
                {isDraft ? 'Tap to add cover image' : 'No cover image'}
              </ThemedText>
            </View>
          )}
        </Pressable>

        <FieldLabel label="Title" required />
        <TextInput
          style={[styles.input, shouldDimReadOnly && styles.inputDisabled]}
          value={title}
          onChangeText={setTitle}
          placeholderTextColor="#9ca3af"
          editable={isDraft}
        />

        <FieldLabel label="Description" />
        <TextInput
          style={[styles.input, styles.textArea, shouldDimReadOnly && styles.inputDisabled]}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholderTextColor="#9ca3af"
          editable={isDraft}
        />

        <FieldLabel label="Location" required />
        <TextInput
          style={[styles.input, shouldDimReadOnly && styles.inputDisabled]}
          value={location}
          onChangeText={setLocation}
          placeholderTextColor="#9ca3af"
          editable={isDraft}
        />

        {/* Province / Ward */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <FieldLabel label="Province" />
            <Pressable style={[styles.dropdown, shouldDimReadOnly && styles.dropdownDisabled]} onPress={() => isDraft && setProvinceOpen((v) => !v)} disabled={!isDraft}>
              <ThemedText style={provinceCode ? styles.dropdownText : styles.dropdownPlaceholder}>
                {selectedProvinceName ?? 'Select province'}
              </ThemedText>
              <MaterialIcons name={provinceOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color="#6b7280" />
            </Pressable>
            {provinceOpen && (
              <View style={styles.dropdownList}>
                <Pressable
                  style={styles.dropdownOption}
                  onPress={() => { setProvinceCode(null); setProvinceOpen(false); }}
                >
                  <ThemedText style={styles.dropdownOptionText}>-- None --</ThemedText>
                </Pressable>
                {provinceOptions.map((p) => (
                  <Pressable
                    key={p.code}
                    style={styles.dropdownOption}
                    onPress={() => { setProvinceCode(p.code); setProvinceOpen(false); }}
                  >
                    <ThemedText style={[styles.dropdownOptionText, p.code === provinceCode && styles.dropdownOptionSelected]}>
                      {p.name}
                    </ThemedText>
                    {p.code === provinceCode && <MaterialIcons name="check" size={16} color="#0f8a8a" />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          <View style={styles.halfField}>
            <FieldLabel label="Ward" />
            <Pressable
              style={[styles.dropdown, (!provinceCode || shouldDimReadOnly) && styles.dropdownDisabled]}
              onPress={() => isDraft && provinceCode && setWardOpen((v) => !v)}
              disabled={!isDraft || !provinceCode}
            >
              <ThemedText style={wardCode ? styles.dropdownText : styles.dropdownPlaceholder}>
                {selectedWardName ?? 'Select ward'}
              </ThemedText>
              <MaterialIcons name={wardOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color="#6b7280" />
            </Pressable>
            {wardOpen && (
              <View style={styles.dropdownList}>
                <Pressable
                  style={styles.dropdownOption}
                  onPress={() => { setWardCode(null); setWardOpen(false); }}
                >
                  <ThemedText style={styles.dropdownOptionText}>-- None --</ThemedText>
                </Pressable>
                {wardOptions.map((w) => (
                  <Pressable
                    key={w.code}
                    style={styles.dropdownOption}
                    onPress={() => { setWardCode(w.code); setWardOpen(false); }}
                  >
                    <ThemedText style={[styles.dropdownOptionText, w.code === wardCode && styles.dropdownOptionSelected]}>
                      {w.name}
                    </ThemedText>
                    {w.code === wardCode && <MaterialIcons name="check" size={16} color="#0f8a8a" />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Start Date / Time pickers */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <FieldLabel label="Start Date" required />
            <Pressable style={[styles.pickerTrigger, shouldDimReadOnly && styles.pickerDisabled]} onPress={() => isDraft && setActivePicker('startDate')} disabled={!isDraft}>
              <MaterialIcons name="calendar-today" size={18} color="#6b7280" />
              <ThemedText style={styles.pickerValue}>{formatDate(startDateTime)}</ThemedText>
            </Pressable>
          </View>
          <View style={styles.halfField}>
            <FieldLabel label="Start Time" required />
            <Pressable style={[styles.pickerTrigger, shouldDimReadOnly && styles.pickerDisabled]} onPress={() => isDraft && setActivePicker('startTime')} disabled={!isDraft}>
              <MaterialIcons name="access-time" size={18} color="#6b7280" />
              <ThemedText style={styles.pickerValue}>{formatTime(startDateTime)}</ThemedText>
            </Pressable>
          </View>
        </View>

        {/* End Date / Time pickers */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <FieldLabel label="End Date" required />
            <Pressable style={[styles.pickerTrigger, shouldDimReadOnly && styles.pickerDisabled]} onPress={() => isDraft && setActivePicker('endDate')} disabled={!isDraft}>
              <MaterialIcons name="calendar-today" size={18} color="#6b7280" />
              <ThemedText style={styles.pickerValue}>{formatDate(endDateTime)}</ThemedText>
            </Pressable>
          </View>
          <View style={styles.halfField}>
            <FieldLabel label="End Time" required />
            <Pressable style={[styles.pickerTrigger, shouldDimReadOnly && styles.pickerDisabled]} onPress={() => isDraft && setActivePicker('endTime')} disabled={!isDraft}>
              <MaterialIcons name="access-time" size={18} color="#6b7280" />
              <ThemedText style={styles.pickerValue}>{formatTime(endDateTime)}</ThemedText>
            </Pressable>
          </View>
        </View>

        {activePicker && (
          <DateTimePicker
            value={
              activePicker === 'startDate' || activePicker === 'startTime'
                ? startDateTime
                : endDateTime
            }
            mode={activePicker === 'startDate' || activePicker === 'endDate' ? 'date' : 'time'}
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handlePickerChange(activePicker)}
          />
        )}

        <FieldLabel label="Timeline" />
        <ActivityTimelineEditor
          entries={timelineEntries}
          onChange={setTimelineEntries}
          activityStart={startDateTime}
          activityEnd={endDateTime}
          disabled={!canEditTimeline}
        />

        <FieldLabel label="Capacity" required />
        <TextInput
          style={[styles.input, shouldDimReadOnly && styles.inputDisabled]}
          value={capacity}
          onChangeText={setCapacity}
          keyboardType="number-pad"
          placeholderTextColor="#9ca3af"
          editable={isDraft}
        />

        {/* Required Skills multi-select */}
        <FieldLabel label="Required Skills" />
        <Pressable style={[styles.dropdown, shouldDimReadOnly && styles.dropdownDisabled]} onPress={() => isDraft && setSkillsOpen((v) => !v)} disabled={!isDraft}>
          <ThemedText style={selectedSkills.length > 0 ? styles.dropdownText : styles.dropdownPlaceholder}>
            {selectedSkills.length > 0 ? selectedSkills.join(', ') : 'Select skills'}
          </ThemedText>
          <MaterialIcons name={skillsOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color="#6b7280" />
        </Pressable>
        {skillsOpen && (
          <View style={styles.dropdownList}>
            {skillOptions.map((opt) => {
              const checked = selectedSkills.includes(opt.skillName);
              return (
                <Pressable key={opt.id} style={styles.dropdownOption} onPress={() => toggleSkill(opt.skillName)}>
                  <ThemedText style={[styles.dropdownOptionText, checked && styles.dropdownOptionSelected]}>
                    {opt.skillName}
                  </ThemedText>
                  {checked && <MaterialIcons name="check" size={16} color="#0f8a8a" />}
                </Pressable>
              );
            })}
            {skillOptions.length === 0 && (
              <ThemedText style={styles.dropdownEmpty}>No skills available</ThemedText>
            )}
          </View>
        )}

        <FieldLabel label="Status" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusRow}
        >
          {ALL_STATUSES.map((opt) => {
            const active = opt === status;
            return (
              <Pressable
                key={opt}
                style={[styles.statusChip, active && styles.statusChipActive, shouldDimReadOnly && styles.statusChipDisabled]}
                onPress={() => isDraft && setStatus(opt)}
                disabled={!isDraft}
              >
                <ThemedText style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {showSaveButton && (
          <Pressable
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={() => void handleSave()}
            disabled={saving}
          >
            <MaterialIcons name="save" size={18} color="#ffffff" />
            <ThemedText style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Save Changes'}
            </ThemedText>
          </Pressable>
        )}

        {isDraft && (
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <MaterialIcons name="delete-outline" size={18} color="#dc2626" />
            <ThemedText style={styles.deleteButtonText}>Delete Activity</ThemedText>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <ThemedText style={styles.label}>
      {label}
      {required ? <ThemedText style={styles.required}> *</ThemedText> : null}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
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
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 14,
  },
  required: {
    color: '#dc2626',
  },
  input: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  inputDisabled: {
    opacity: 0.5,
    backgroundColor: '#e5e7eb',
  },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
    marginTop: 8,
  },
  readOnlyBannerText: {
    fontSize: 13,
    color: '#92400e',
    flex: 1,
  },
  publishedTimelineInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#dff3ef',
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#a7d7cf',
  },
  publishedTimelineInfoText: {
    fontSize: 13,
    color: '#115e59',
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  halfField: {
    flex: 1,
  },
  pickerTrigger: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerValue: {
    fontSize: 15,
    color: '#1f2937',
  },
  pickerPlaceholder: {
    fontSize: 15,
    color: '#9ca3af',
  },
  pickerDisabled: {
    opacity: 0.5,
  },
  dropdown: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownDisabled: {
    opacity: 0.5,
  },
  dropdownText: {
    fontSize: 15,
    color: '#1f2937',
    flex: 1,
  },
  dropdownPlaceholder: {
    fontSize: 15,
    color: '#9ca3af',
    flex: 1,
  },
  dropdownList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    maxHeight: 200,
    overflow: 'hidden',
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  dropdownOptionSelected: {
    color: '#0f8a8a',
    fontWeight: '600',
  },
  dropdownEmpty: {
    fontSize: 14,
    color: '#9ca3af',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusRow: {
    gap: 10,
    marginTop: 2,
  },
  statusChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  statusChipActive: {
    backgroundColor: '#0f8a8a',
  },
  statusChipDisabled: {
    opacity: 0.5,
  },
  statusChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
  },
  statusChipTextActive: {
    color: '#ffffff',
  },
  saveButton: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0f8a8a',
    borderRadius: 14,
    paddingVertical: 15,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  coverPicker: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  coverPickerDisabled: {
    opacity: 0.5,
  },
  coverPreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  coverPlaceholder: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  coverPlaceholderText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  deleteButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    paddingVertical: 15,
  },
  deleteButtonText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '700',
  },
});
