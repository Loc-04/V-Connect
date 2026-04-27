import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/shared/ui/themed-text';

/**
 * Placeholder: organizer check-in management for a single activity.
 * Wire to shared-backend check-in flows when product is ready.
 */
export default function OrganizerActivityCheckInScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <ThemedText type="title" style={styles.title}>
        Check-in
      </ThemedText>
      <ThemedText style={styles.placeholder}>Placeholder</ThemedText>
      {id ? (
        <ThemedText type="defaultSemiBold" style={styles.muted} numberOfLines={2}>
          Activity id: {id}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
  },
  title: {
    marginBottom: 8,
  },
  placeholder: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 12,
  },
  muted: {
    fontSize: 12,
    color: '#9ca3af',
  },
});
