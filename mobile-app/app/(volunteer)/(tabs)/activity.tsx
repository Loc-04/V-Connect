import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ROUTES } from '@/src/shared/constants/route-constants';
import { ThemedText } from '@/src/shared/ui/themed-text';
import { ThemedView } from '@/src/shared/ui/themed-view';

export default function ActivityScreen() {
  const handleActivityDetailPress = () => {
    Alert.alert('Placeholder', 'Activity Detail button is placeholder for now.');
  };

  const handleCheckInPress = () => {
    router.push(ROUTES.VOLUNTEER.ACTIVITY_CHECK_IN);
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title} type="title">
        Activity
      </ThemedText>

      <View style={styles.buttonGroup}>
        <Pressable onPress={handleActivityDetailPress} style={[styles.button, styles.secondaryButton]}>
          <ThemedText style={styles.secondaryButtonLabel}>Activity Detail</ThemedText>
        </Pressable>

        <Pressable onPress={handleCheckInPress} style={[styles.button, styles.primaryButton]}>
          <ThemedText darkColor="#FFFFFF" lightColor="#FFFFFF" style={styles.primaryButtonLabel}>
            Check In
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    marginBottom: 20,
  },
  buttonGroup: {
    gap: 12,
    width: '100%',
  },
  button: {
    alignItems: 'center',
    borderRadius: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#07B5FF',
  },
  secondaryButton: {
    backgroundColor: '#EAF1F8',
  },
  primaryButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  secondaryButtonLabel: {
    color: '#0A1A2F',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
});
