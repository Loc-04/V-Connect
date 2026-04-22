import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/src/shared/ui/themed-text';

import {
  createTimelineEntryId,
  type ActivityTimelineEntry,
} from '../activity-timeline-placeholder';

type PickerMode = 'date' | 'time';

interface ActivePicker {
  entryId: string;
  mode: PickerMode;
}

export interface ActivityTimelineEditorProps {
  entries: ActivityTimelineEntry[];
  onChange: (next: ActivityTimelineEntry[]) => void;
  activityStart: Date | null;
  activityEnd: Date | null;
  disabled?: boolean;
}

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

function parseEntryDate(entry: ActivityTimelineEntry): Date | null {
  const d = new Date(entry.at);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ActivityTimelineEditor({
  entries,
  onChange,
  activityStart,
  activityEnd,
  disabled = false,
}: ActivityTimelineEditorProps) {
  const [activePicker, setActivePicker] = useState<ActivePicker | null>(null);

  const boundsReady = !!activityStart && !!activityEnd && activityEnd > activityStart;

  const handleAdd = useCallback(() => {
    if (!boundsReady || !activityStart) return;
    const seed = new Date(activityStart);
    const next: ActivityTimelineEntry = {
      id: createTimelineEntryId(),
      title: '',
      at: seed.toISOString(),
    };
    onChange([...entries, next]);
  }, [boundsReady, activityStart, entries, onChange]);

  const handleRemove = useCallback(
    (entryId: string) => {
      onChange(entries.filter((e) => e.id !== entryId));
    },
    [entries, onChange],
  );

  const handleTitleChange = useCallback(
    (entryId: string, title: string) => {
      onChange(entries.map((e) => (e.id === entryId ? { ...e, title } : e)));
    },
    [entries, onChange],
  );

  const handlePickerChange = useCallback(
    (entryId: string, mode: PickerMode) =>
      (_event: DateTimePickerEvent, selected?: Date) => {
        setActivePicker(null);
        if (!selected) return;
        onChange(
          entries.map((e) => {
            if (e.id !== entryId) return e;
            const base = parseEntryDate(e) ?? activityStart ?? new Date();
            const next = new Date(base);
            if (mode === 'date') {
              next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
            } else {
              next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
            }
            return { ...e, at: next.toISOString() };
          }),
        );
      },
    [activityStart, entries, onChange],
  );

  const activeEntry = activePicker ? entries.find((e) => e.id === activePicker.entryId) : null;
  const activeEntryDate = activeEntry ? parseEntryDate(activeEntry) : null;

  return (
    <View style={styles.wrap}>
      {!boundsReady ? (
        <View style={styles.helperBox}>
          <MaterialIcons name="info-outline" size={16} color="#6b7280" />
          <ThemedText style={styles.helperText}>
            Set the activity start and end first, then add timeline entries.
          </ThemedText>
        </View>
      ) : null}

      {entries.length === 0 && boundsReady ? (
        <View style={styles.emptyBox}>
          <ThemedText style={styles.emptyText}>
            No timeline yet. Add slots so volunteers can see what happens and when.
          </ThemedText>
        </View>
      ) : null}

      {entries.map((entry, index) => {
        const date = parseEntryDate(entry);
        return (
          <View key={entry.id} style={styles.entryCard}>
            <View style={styles.entryHeader}>
              <ThemedText style={styles.entryIndex}>Slot {index + 1}</ThemedText>
              <Pressable
                hitSlop={8}
                disabled={disabled}
                onPress={() => handleRemove(entry.id)}
                style={styles.removeBtn}
                accessibilityLabel={`Remove slot ${index + 1}`}
              >
                <MaterialIcons name="close" size={16} color="#b91c1c" />
              </Pressable>
            </View>

            <TextInput
              style={[styles.input, disabled && styles.inputDisabled]}
              editable={!disabled}
              placeholder="What happens here? (e.g. Opening remarks)"
              placeholderTextColor="#9ca3af"
              value={entry.title}
              onChangeText={(t) => handleTitleChange(entry.id, t)}
            />

            <View style={styles.row}>
              <Pressable
                style={[styles.pickerTrigger, disabled && styles.pickerDisabled]}
                disabled={disabled || !boundsReady}
                onPress={() => setActivePicker({ entryId: entry.id, mode: 'date' })}
              >
                <MaterialIcons name="calendar-today" size={16} color="#6b7280" />
                <ThemedText style={date ? styles.pickerValue : styles.pickerPlaceholder}>
                  {date ? formatDate(date) : 'Select date'}
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.pickerTrigger, disabled && styles.pickerDisabled]}
                disabled={disabled || !boundsReady}
                onPress={() => setActivePicker({ entryId: entry.id, mode: 'time' })}
              >
                <MaterialIcons name="access-time" size={16} color="#6b7280" />
                <ThemedText style={date ? styles.pickerValue : styles.pickerPlaceholder}>
                  {date ? formatTime(date) : 'Select time'}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Pressable
        style={[styles.addBtn, (!boundsReady || disabled) && styles.addBtnDisabled]}
        onPress={handleAdd}
        disabled={!boundsReady || disabled}
      >
        <MaterialIcons name="add" size={18} color="#0f8a8a" />
        <ThemedText style={styles.addBtnText}>Add timeline slot</ThemedText>
      </Pressable>

      {activePicker && activeEntry ? (
        <DateTimePicker
          value={activeEntryDate ?? activityStart ?? new Date()}
          mode={activePicker.mode}
          is24Hour
          minimumDate={activePicker.mode === 'date' ? activityStart ?? undefined : undefined}
          maximumDate={activePicker.mode === 'date' ? activityEnd ?? undefined : undefined}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handlePickerChange(activePicker.entryId, activePicker.mode)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 2,
    gap: 10,
  },
  helperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  helperText: {
    fontSize: 13,
    color: '#4b5563',
    flex: 1,
  },
  emptyBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#fafafa',
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  entryCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#ffffff',
    gap: 10,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entryIndex: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f8a8a',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  pickerTrigger: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pickerDisabled: {
    opacity: 0.5,
  },
  pickerValue: {
    fontSize: 14,
    color: '#1f2937',
  },
  pickerPlaceholder: {
    fontSize: 14,
    color: '#9ca3af',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#0f8a8a',
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: '#ecfeff',
  },
  addBtnDisabled: {
    opacity: 0.5,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f8a8a',
  },
});
