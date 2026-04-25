import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/src/shared/ui/themed-text';

import {
  sortTimelineEntries,
  type ActivityTimelineEntry,
} from '../activity-timeline';

export interface ActivityTimelineListProps {
  entries: ActivityTimelineEntry[];
  multiDay?: boolean;
  accentColor?: string;
}

const DEFAULT_ACCENT = '#00AEEF';

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function ActivityTimelineList({
  entries,
  multiDay = false,
  accentColor = DEFAULT_ACCENT,
}: ActivityTimelineListProps) {
  const sorted = sortTimelineEntries(entries);
  if (sorted.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {sorted.map((entry, index) => {
        const isLast = index === sorted.length - 1;
        const dateLine = multiDay ? formatDateLabel(entry.at) : '';
        const timeLine = formatTimeLabel(entry.at);
        return (
          <View key={entry.id} style={styles.row}>
            <View style={styles.railCol}>
              <View style={[styles.dot, { borderColor: accentColor }]}>
                <MaterialIcons name="circle" size={10} color={accentColor} />
              </View>
              {!isLast ? <View style={[styles.rail, { backgroundColor: accentColor }]} /> : null}
            </View>

            <View style={styles.content}>
              <View style={styles.timeRow}>
                <ThemedText type="defaultSemiBold" style={[styles.timeText, { color: accentColor }]}>
                  {timeLine}
                </ThemedText>
                {dateLine ? (
                  <ThemedText style={styles.dateText}>{dateLine}</ThemedText>
                ) : null}
              </View>
              <ThemedText style={styles.titleText}>{entry.title}</ThemedText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  railCol: {
    width: 24,
    alignItems: 'center',
    paddingTop: 4,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  rail: {
    width: 2,
    flex: 1,
    marginTop: 2,
    opacity: 0.35,
  },
  content: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 14,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  timeText: {
    fontSize: 14,
  },
  dateText: {
    fontSize: 12,
    color: '#64748b',
  },
  titleText: {
    fontSize: 15,
    color: '#0f172a',
    lineHeight: 20,
  },
});
