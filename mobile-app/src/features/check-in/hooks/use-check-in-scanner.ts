import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';

import { CHECK_IN_SCAN_LOCK_MS } from '../constants/check-in.constants';
import type { CheckInScannerState } from '../types/check-in.types';

type UseCheckInScannerOptions = {
  onCodeScanned?: (code: string) => void;
};

export function useCheckInScanner(options: UseCheckInScannerOptions = {}) {
  const { onCodeScanned } = options;
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanLocked, setIsScanLocked] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unlockScanner = useCallback(() => {
    if (lockTimeoutRef.current) {
      clearTimeout(lockTimeoutRef.current);
      lockTimeoutRef.current = null;
    }

    lockTimeoutRef.current = setTimeout(() => {
      setIsScanLocked(false);
      lockTimeoutRef.current = null;
    }, CHECK_IN_SCAN_LOCK_MS);
  }, []);

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      const normalized = String(data ?? '').trim();
      if (!normalized || isScanLocked) {
        return;
      }

      setIsScanLocked(true);
      onCodeScanned?.(normalized);
      unlockScanner();
    },
    [isScanLocked, onCodeScanned, unlockScanner]
  );

  const toggleFlash = useCallback(() => {
    setIsFlashOn((prev) => !prev);
  }, []);

  useEffect(() => {
    return () => {
      if (lockTimeoutRef.current) {
        clearTimeout(lockTimeoutRef.current);
      }
    };
  }, []);

  const state: CheckInScannerState = useMemo(
    () => ({
      hasPermission: permission?.granted ?? false,
      isPermissionLoading: !permission,
      isScanLocked,
      isFlashOn,
    }),
    [isFlashOn, isScanLocked, permission]
  );

  return {
    state,
    requestPermission,
    handleBarcodeScanned,
    toggleFlash,
  };
}
