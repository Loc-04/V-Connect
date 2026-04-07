import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { StyleSheet, View } from 'react-native';

import { CHECK_IN_COPY } from '../constants/check-in.constants';
import { PermissionFallback } from './permission-fallback';
import { ScannerActions } from './scanner-actions';
import { ScannerFrameOverlay } from './scanner-frame-overlay';
import { ThemedText } from '@/src/shared/ui/themed-text';

type ScannerViewportProps = {
  hasPermission: boolean;
  isPermissionLoading: boolean;
  isFlashOn: boolean;
  onRequestPermission: () => void;
  onToggleFlash: () => void;
  onGalleryPress: () => void;
  onBarcodeScanned: (event: BarcodeScanningResult) => void;
};

export function ScannerViewport({
  hasPermission,
  isPermissionLoading,
  isFlashOn,
  onRequestPermission,
  onToggleFlash,
  onGalleryPress,
  onBarcodeScanned,
}: ScannerViewportProps) {
  return (
    <View style={styles.container}>
      <ThemedText darkColor="#DCEAFF" lightColor="#DCEAFF" style={styles.instruction}>
        {CHECK_IN_COPY.instruction}
      </ThemedText>

      <View style={styles.frameContainer}>
        {hasPermission ? (
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            flash={isFlashOn ? 'on' : 'off'}
            onBarcodeScanned={onBarcodeScanned}
            style={styles.camera}
          />
        ) : (
          <View style={styles.cameraFallback}>
            {isPermissionLoading ? (
              <ThemedText darkColor="#A8C2DB" lightColor="#A8C2DB" style={styles.loadingLabel}>
                Requesting camera permission...
              </ThemedText>
            ) : (
              <PermissionFallback onRequestPermission={onRequestPermission} />
            )}
          </View>
        )}
        <View pointerEvents="none" style={styles.overlay} />
        <View style={styles.frameWrap}>
          <ScannerFrameOverlay />
        </View>
      </View>

      <ScannerActions flashOn={isFlashOn} onFlashPress={onToggleFlash} onGalleryPress={onGalleryPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  instruction: {
    fontSize: 19,
    lineHeight: 28,
    marginBottom: 22,
    maxWidth: 340,
    textAlign: 'center',
  },
  frameContainer: {
    alignItems: 'center',
    height: 320,
    justifyContent: 'center',
    width: '100%',
  },
  camera: {
    borderRadius: 24,
    height: 320,
    overflow: 'hidden',
    width: '100%',
  },
  cameraFallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 17, 36, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    borderWidth: 1,
    height: 320,
    justifyContent: 'center',
    width: '100%',
  },
  loadingLabel: {
    fontSize: 15,
    lineHeight: 22,
  },
  overlay: {
    backgroundColor: 'rgba(0, 20, 38, 0.45)',
    borderRadius: 24,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  frameWrap: {
    position: 'absolute',
  },
});
