import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
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
  createActivity,
  saveTimelinePlaceholder,
  updateActivityCoverImageUrl,
  fetchSkillOptions,
  fetchProvinceOptions,
  fetchWardOptions,
  validateActivityTimeline,
  type ActivityPayload,
  type ActivityStatus,
  type ActivityTimelineEntry,
  type SkillOption,
  type ProvinceOption,
  type WardOption,
} from '@/src/features/organizer-activities';
import { pickImageFromLibrary, compressImage, assertUnderMaxBytes, uploadJpegAndGetPublicUrl } from '@/src/shared/lib/image-upload';
import { ThemedText } from '@/src/shared/ui/themed-text';

const STATUS_OPTIONS: ActivityStatus[] = ['draft', 'published'];

type PickerField = 'startDate' | 'startTime' | 'endDate' | 'endTime';

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

export default function CreateActivityScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDateTime, setStartDateTime] = useState<Date | null>(null);
  const [endDateTime, setEndDateTime] = useState<Date | null>(null);
  const [capacity, setCapacity] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [provinceCode, setProvinceCode] = useState<string | null>(null);
  const [wardCode, setWardCode] = useState<string | null>(null);
  const [status, setStatus] = useState<ActivityStatus>('draft');
  const [pendingCoverUri, setPendingCoverUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [timelineEntries, setTimelineEntries] = useState<ActivityTimelineEntry[]>([]);

  const [skillOptions, setSkillOptions] = useState<SkillOption[]>([]);
  const [provinceOptions, setProvinceOptions] = useState<ProvinceOption[]>([]);
  const [wardOptions, setWardOptions] = useState<WardOption[]>([]);

  const [skillsOpen, setSkillsOpen] = useState(false);
  const [provinceOpen, setProvinceOpen] = useState(false);
  const [wardOpen, setWardOpen] = useState(false);

  const [activePicker, setActivePicker] = useState<PickerField | null>(null);

  useEffect(() => {
    void fetchSkillOptions().then(setSkillOptions).catch(() => {});
    void fetchProvinceOptions().then(setProvinceOptions).catch(() => {});
  }, []);

  useEffect(() => {
    if (provinceCode) {
      void fetchWardOptions(provinceCode).then(setWardOptions).catch(() => {});
    } else {
      setWardOptions([]);
    }
    setWardCode(null);
  }, [provinceCode]);

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
          const base = prev ?? new Date();
          const next = new Date(base);
          next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
          return next;
        });
      } else if (field === 'startTime') {
        setStartDateTime((prev) => {
          const base = prev ?? new Date();
          const next = new Date(base);
          next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
          return next;
        });
      } else if (field === 'endDate') {
        setEndDateTime((prev) => {
          const base = prev ?? new Date();
          const next = new Date(base);
          next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
          return next;
        });
      } else if (field === 'endTime') {
        setEndDateTime((prev) => {
          const base = prev ?? new Date();
          const next = new Date(base);
          next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
          return next;
        });
      }
    },
    [],
  );

  const validate = useCallback((): string | null => {
    if (!title.trim()) return 'Title is required.';
    if (!location.trim()) return 'Location is required.';
    if (!startDateTime) return 'Start date and time are required.';
    if (!endDateTime) return 'End date and time are required.';
    if (endDateTime <= startDateTime) return 'End time must be later than start time.';

    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap <= 0) return 'Capacity must be a positive integer.';

    if (timelineEntries.length > 0) {
      const tlError = validateActivityTimeline(timelineEntries, startDateTime!, endDateTime!);
      if (tlError) return tlError;
    }

    return null;
  }, [title, location, startDateTime, endDateTime, capacity, timelineEntries]);

  const handleSubmit = useCallback(async () => {
    const error = validate();
    if (error) {
      Alert.alert('Validation Error', error);
      return;
    }

    const payload: ActivityPayload = {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      startTime: startDateTime!.toISOString(),
      endTime: endDateTime!.toISOString(),
      capacity: Number(capacity),
      requiredSkills: selectedSkills,
      status,
      provinceCode: provinceCode ?? undefined,
      wardCode: wardCode ?? undefined,
      // timeline: not sent — TODO(backend) wire organizer timeline into API payload
    };

    setSubmitting(true);
    try {
      const activity = await createActivity(payload);

      // TODO(backend): remove placeholder persistence once timeline lives on the API.
      try {
        await saveTimelinePlaceholder(activity.id, timelineEntries);
      } catch {
        // Ignored: placeholder persistence is best-effort.
      }

      if (pendingCoverUri) {
        try {
          const compressed = await compressImage(pendingCoverUri);
          await assertUnderMaxBytes(compressed);
          const objectPath = `${activity.id}_${Date.now()}.jpg`;
          const publicUrl = await uploadJpegAndGetPublicUrl('activity_covers', objectPath, compressed);
          await updateActivityCoverImageUrl(activity.id, publicUrl);
        } catch (coverErr) {
          Alert.alert('Cover Upload Failed', coverErr instanceof Error ? coverErr.message : 'Activity was created but cover upload failed.');
        }
      }

      Alert.alert('Success', 'Activity created successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create activity.');
    } finally {
      setSubmitting(false);
    }
  }, [validate, title, description, location, startDateTime, endDateTime, capacity, selectedSkills, status, provinceCode, wardCode, pendingCoverUri, timelineEntries]);

  const selectedProvinceName = provinceOptions.find((p) => p.code === provinceCode)?.name;
  const selectedWardName = wardOptions.find((w) => w.code === wardCode)?.name;

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
        <FieldLabel label="Cover Image" />
        <Pressable style={styles.coverPicker} onPress={() => void handlePickCover()}>
          {pendingCoverUri ? (
            <Image source={{ uri: pendingCoverUri }} style={styles.coverPreview} />
          ) : (
            <View style={styles.coverPlaceholder}>
              <MaterialIcons name="add-photo-alternate" size={32} color="#9ca3af" />
              <ThemedText style={styles.coverPlaceholderText}>Tap to add cover image</ThemedText>
            </View>
          )}
        </Pressable>

        <FieldLabel label="Title" required />
        <TextInput
          style={styles.input}
          placeholder="Activity title"
          placeholderTextColor="#9ca3af"
          value={title}
          onChangeText={setTitle}
        />

        <FieldLabel label="Description" />
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe the activity..."
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={4}
          value={description}
          onChangeText={setDescription}
        />

        <FieldLabel label="Location" required />
        <TextInput
          style={styles.input}
          placeholder="Address or location name"
          placeholderTextColor="#9ca3af"
          value={location}
          onChangeText={setLocation}
        />

        {/* Province / Ward */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <FieldLabel label="Province" />
            <Pressable style={styles.dropdown} onPress={() => setProvinceOpen((v) => !v)}>
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
              style={[styles.dropdown, !provinceCode && styles.dropdownDisabled]}
              onPress={() => provinceCode && setWardOpen((v) => !v)}
              disabled={!provinceCode}
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
            <Pressable style={styles.pickerTrigger} onPress={() => setActivePicker('startDate')}>
              <MaterialIcons name="calendar-today" size={18} color="#6b7280" />
              <ThemedText style={startDateTime ? styles.pickerValue : styles.pickerPlaceholder}>
                {startDateTime ? formatDate(startDateTime) : 'Select date'}
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.halfField}>
            <FieldLabel label="Start Time" required />
            <Pressable style={styles.pickerTrigger} onPress={() => setActivePicker('startTime')}>
              <MaterialIcons name="access-time" size={18} color="#6b7280" />
              <ThemedText style={startDateTime ? styles.pickerValue : styles.pickerPlaceholder}>
                {startDateTime ? formatTime(startDateTime) : 'Select time'}
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* End Date / Time pickers */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <FieldLabel label="End Date" required />
            <Pressable style={styles.pickerTrigger} onPress={() => setActivePicker('endDate')}>
              <MaterialIcons name="calendar-today" size={18} color="#6b7280" />
              <ThemedText style={endDateTime ? styles.pickerValue : styles.pickerPlaceholder}>
                {endDateTime ? formatDate(endDateTime) : 'Select date'}
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.halfField}>
            <FieldLabel label="End Time" required />
            <Pressable style={styles.pickerTrigger} onPress={() => setActivePicker('endTime')}>
              <MaterialIcons name="access-time" size={18} color="#6b7280" />
              <ThemedText style={endDateTime ? styles.pickerValue : styles.pickerPlaceholder}>
                {endDateTime ? formatTime(endDateTime) : 'Select time'}
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {activePicker && (
          <DateTimePicker
            value={
              activePicker === 'startDate' || activePicker === 'startTime'
                ? (startDateTime ?? new Date())
                : (endDateTime ?? new Date())
            }
            mode={activePicker === 'startDate' || activePicker === 'endDate' ? 'date' : 'time'}
            is24Hour
            minimumDate={activePicker === 'startDate' || activePicker === 'endDate' ? new Date() : undefined}
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
        />

        <FieldLabel label="Capacity" required />
        <TextInput
          style={styles.input}
          placeholder="e.g. 30"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          value={capacity}
          onChangeText={setCapacity}
        />

        {/* Required Skills multi-select */}
        <FieldLabel label="Required Skills" />
        <Pressable style={styles.dropdown} onPress={() => setSkillsOpen((v) => !v)}>
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
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((opt) => {
            const active = opt === status;
            return (
              <Pressable
                key={opt}
                style={[styles.statusChip, active && styles.statusChipActive]}
                onPress={() => setStatus(opt)}
              >
                <ThemedText style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={() => void handleSubmit()}
          disabled={submitting}
        >
          <MaterialIcons name="check" size={18} color="#ffffff" />
          <ThemedText style={styles.submitButtonText}>
            {submitting ? 'Creating...' : 'Create Activity'}
          </ThemedText>
        </Pressable>
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
    flexDirection: 'row',
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
  statusChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
  },
  statusChipTextActive: {
    color: '#ffffff',
  },
  submitButton: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0f8a8a',
    borderRadius: 14,
    paddingVertical: 15,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
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
});
