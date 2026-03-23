import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHECK_IN_COPY } from './constants/check-in.constants';
import { HelpSheet } from './components/help-sheet';
import { CheckInHeader } from './components/check-in-header';
import { ManualCodeModal } from './components/manual-code-modal';
import { ScannerViewport } from './components/scanner-viewport';
import { useCheckInScanner } from './hooks/use-check-in-scanner';

export function CheckInScreen() {
  const insets = useSafeAreaInsets();
  const [manualCode, setManualCode] = useState('');
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const { state, handleBarcodeScanned, requestPermission, toggleFlash } = useCheckInScanner({
    onCodeScanned: (code) => {
      Alert.alert('QR scanned', code);
    },
  });

  const handleGalleryPress = useCallback(() => {
    Alert.alert('Coming soon', 'Gallery QR import will be added in next iteration.');
  }, []);

  const handleWhereCodePress = useCallback(() => {
    Alert.alert('Code source', 'Ask the organizer for the activity check-in QR code.');
  }, []);

  const openManualCodeModal = useCallback(() => {
    setManualModalVisible(true);
  }, []);

  const closeManualCodeModal = useCallback(() => {
    setManualModalVisible(false);
  }, []);

  const handleManualCodeConfirm = useCallback(() => {
    const value = manualCode.trim();
    if (!value) {
      Alert.alert('Missing code', 'Please enter a valid check-in code.');
      return;
    }

    setManualModalVisible(false);
    Alert.alert('Manual code submitted', value);
  }, [manualCode]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 6 }]}>
      <CheckInHeader title={CHECK_IN_COPY.title} />

      <ScannerViewport
        hasPermission={state.hasPermission}
        isFlashOn={state.isFlashOn}
        isPermissionLoading={state.isPermissionLoading}
        onBarcodeScanned={handleBarcodeScanned}
        onGalleryPress={handleGalleryPress}
        onRequestPermission={requestPermission}
        onToggleFlash={toggleFlash}
      />

      <View style={[styles.sheetWrap, { paddingBottom: insets.bottom + 8 }]}>
        <HelpSheet onManualCodePress={openManualCodeModal} onWhereCodePress={handleWhereCodePress} />
      </View>

      <ManualCodeModal
        code={manualCode}
        onCancel={closeManualCodeModal}
        onChangeCode={setManualCode}
        onConfirm={handleManualCodeConfirm}
        visible={manualModalVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#081320',
    flex: 1,
    justifyContent: 'space-between',
  },
  sheetWrap: {
    marginTop: 22,
  },
});
