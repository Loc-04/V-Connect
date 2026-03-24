import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { CHECK_IN_COPY } from '../constants/check-in.constants';
import { ThemedText } from '@/src/shared/ui/themed-text';

type HelpSheetProps = {
  onManualCodePress: () => void;
  onWhereCodePress: () => void;
};

export function HelpSheet({ onManualCodePress, onWhereCodePress }: HelpSheetProps) {
  return (
    <View style={styles.container}>
      <View style={styles.handle} />

      <ThemedText darkColor="#0A1A2F" lightColor="#0A1A2F" style={styles.title}>
        {CHECK_IN_COPY.helpTitle}
      </ThemedText>
      <ThemedText darkColor="#6C84A5" lightColor="#6C84A5" style={styles.description}>
        {CHECK_IN_COPY.helpDescription}
      </ThemedText>

      <Pressable onPress={onManualCodePress} style={styles.manualButton}>
        <Ionicons color="#FFFFFF" name="keypad-outline" size={18} />
        <ThemedText darkColor="#FFFFFF" lightColor="#FFFFFF" style={styles.manualLabel}>
          {CHECK_IN_COPY.manualCodeButton}
        </ThemedText>
      </Pressable>

      <Pressable onPress={onWhereCodePress}>
        <ThemedText darkColor="#07B5FF" lightColor="#07B5FF" style={styles.link}>
          {CHECK_IN_COPY.whereCodeLabel}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingBottom: 30,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  handle: {
    backgroundColor: '#D0DCE8',
    borderRadius: 999,
    height: 6,
    marginBottom: 16,
    width: 54,
  },
  title: {
    fontSize: 39,
    fontWeight: '700',
    lineHeight: 48,
    marginBottom: 6,
    textAlign: 'center',
  },
  description: {
    fontSize: 17,
    lineHeight: 24,
    marginBottom: 20,
    maxWidth: 340,
    textAlign: 'center',
  },
  manualButton: {
    alignItems: 'center',
    backgroundColor: '#07B5FF',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 10,
    height: 52,
    justifyContent: 'center',
    marginBottom: 14,
    paddingHorizontal: 22,
    width: '100%',
  },
  manualLabel: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  link: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
});
