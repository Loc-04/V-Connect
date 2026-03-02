import { StyleSheet } from 'react-native';

import { ThemedText } from '@/src/shared/ui/themed-text';
import { ThemedView } from '@/src/shared/ui/themed-view';

export default function ActivitiesScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Activities</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
