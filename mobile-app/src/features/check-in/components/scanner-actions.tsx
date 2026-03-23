import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/src/shared/ui/themed-text';

type ScannerActionsProps = {
  flashOn: boolean;
  onGalleryPress: () => void;
  onFlashPress: () => void;
};

function ActionButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <View style={styles.actionItem}>
      <Pressable onPress={onPress} style={styles.actionButton}>
        <Ionicons color="#FFFFFF" name={icon} size={20} />
      </Pressable>
      <ThemedText darkColor="#E9F2FF" lightColor="#E9F2FF" style={styles.actionLabel}>
        {label}
      </ThemedText>
    </View>
  );
}

export function ScannerActions({ flashOn, onGalleryPress, onFlashPress }: ScannerActionsProps) {
  return (
    <View style={styles.container}>
      <ActionButton icon="images-outline" label="Gallery" onPress={onGalleryPress} />
      <ActionButton icon={flashOn ? 'flash' : 'flash-outline'} label="Flash" onPress={onFlashPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 30,
    justifyContent: 'center',
    marginTop: 26,
  },
  actionItem: {
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  actionLabel: {
    fontSize: 18,
    lineHeight: 24,
  },
});
