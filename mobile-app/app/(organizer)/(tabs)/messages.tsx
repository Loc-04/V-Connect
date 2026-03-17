import { StyleSheet } from 'react-native';

import { ThemedText } from '@/src/shared/ui/themed-text';
import { ThemedView } from '@/src/shared/ui/themed-view';

export default function OrganizerMessagesScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Organizer Messages</ThemedText>
      <ThemedText style={styles.subText}>Messages tab scaffold is ready.</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  subText: {
    marginTop: 8,
    opacity: 0.7,
  },
});
