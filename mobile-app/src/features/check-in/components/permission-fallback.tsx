import { Pressable, StyleSheet, View } from 'react-native';

import { CHECK_IN_COPY } from '../constants/check-in.constants';
import { ThemedText } from '@/src/shared/ui/themed-text';

type PermissionFallbackProps = {
  onRequestPermission: () => void;
};

export function PermissionFallback({ onRequestPermission }: PermissionFallbackProps) {
  return (
    <View style={styles.container}>
      <ThemedText darkColor="#FFFFFF" lightColor="#FFFFFF" style={styles.title}>
        {CHECK_IN_COPY.permissionTitle}
      </ThemedText>
      <ThemedText darkColor="#A8C2DB" lightColor="#A8C2DB" style={styles.description}>
        {CHECK_IN_COPY.permissionDescription}
      </ThemedText>
      <Pressable onPress={onRequestPermission} style={styles.button}>
        <ThemedText darkColor="#FFFFFF" lightColor="#FFFFFF" style={styles.buttonLabel}>
          {CHECK_IN_COPY.permissionButton}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 30,
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#07B5FF',
    borderRadius: 999,
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
});
