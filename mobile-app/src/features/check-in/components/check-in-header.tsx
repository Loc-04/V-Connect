import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/src/shared/ui/themed-text';

type CheckInHeaderProps = {
  title: string;
};

export function CheckInHeader({ title }: CheckInHeaderProps) {
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel="Go back"
        hitSlop={10}
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Ionicons color="#FFFFFF" name="arrow-back" size={22} />
      </Pressable>
      <ThemedText darkColor="#FFFFFF" lightColor="#FFFFFF" style={styles.title}>
        {title}
      </ThemedText>
      <View style={styles.placeholder} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
  },
  placeholder: {
    height: 44,
    width: 44,
  },
});
