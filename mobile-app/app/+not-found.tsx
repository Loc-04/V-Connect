import { Link, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/src/shared/ui/themed-text';
import { ThemedView } from '@/src/shared/ui/themed-view';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <ThemedView style={styles.container}>
        <ThemedText type="title">Page not found</ThemedText>
        <Link href="/" style={styles.link}>
          <ThemedText type="link">Go to home</ThemedText>
        </Link>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
