import { Modal, Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/src/shared/ui/themed-text';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  fullName: string;
}

export function UserQrCodeModal({ visible, onClose, userId, fullName }: Props) {
  const qrValue = JSON.stringify({ id: userId, name: fullName });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <ThemedText type="subtitle" style={styles.title}>
            My QR Code
          </ThemedText>

          <View style={styles.qrWrapper}>
            <QRCode value={qrValue} size={260} backgroundColor="#ffffff" />
          </View>

          <ThemedText style={styles.nameLabel}>{fullName}</ThemedText>

          <Pressable style={styles.closeButton} onPress={onClose}>
            <ThemedText style={styles.closeButtonText}>Close</ThemedText>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 320,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  title: {
    marginBottom: 18,
  },
  qrWrapper: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  nameLabel: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  closeButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 10,
    backgroundColor: '#0f766e',
  },
  closeButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
