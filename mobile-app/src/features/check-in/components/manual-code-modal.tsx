import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CHECK_IN_COPY } from '../constants/check-in.constants';
import { ThemedText } from '@/src/shared/ui/themed-text';

type ManualCodeModalProps = {
  visible: boolean;
  code: string;
  onChangeCode: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ManualCodeModal({
  visible,
  code,
  onChangeCode,
  onCancel,
  onConfirm,
}: ManualCodeModalProps) {
  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ThemedText darkColor="#0A1A2F" lightColor="#0A1A2F" style={styles.title}>
            {CHECK_IN_COPY.manualCodeTitle}
          </ThemedText>

          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onChangeCode}
            placeholder={CHECK_IN_COPY.manualCodePlaceholder}
            placeholderTextColor="#95A7BD"
            style={styles.input}
            value={code}
          />

          <View style={styles.actionRow}>
            <Pressable onPress={onCancel} style={[styles.actionButton, styles.cancelButton]}>
              <ThemedText darkColor="#0A1A2F" lightColor="#0A1A2F" style={styles.cancelLabel}>
                {CHECK_IN_COPY.manualCodeCancel}
              </ThemedText>
            </Pressable>
            <Pressable onPress={onConfirm} style={[styles.actionButton, styles.confirmButton]}>
              <ThemedText darkColor="#FFFFFF" lightColor="#FFFFFF" style={styles.confirmLabel}>
                {CHECK_IN_COPY.manualCodeConfirm}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.44)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    width: '100%',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#F4F8FC',
    borderColor: '#D7E3EF',
    borderRadius: 12,
    borderWidth: 1,
    color: '#0A1A2F',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelButton: {
    backgroundColor: '#EAF1F8',
  },
  confirmButton: {
    backgroundColor: '#07B5FF',
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  confirmLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
});
