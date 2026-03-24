export const CHECK_IN_SCAN_LOCK_MS = 1500;

export const CHECK_IN_COPY = {
  title: 'Check-In',
  instruction: "Align the organizer's QR code within the frame to log your hours",
  helpTitle: 'Having trouble scanning?',
  helpDescription: 'Make sure there is enough light and the code is clear.',
  manualCodeButton: 'Enter code manually',
  whereCodeLabel: 'Where do I find the code?',
  permissionTitle: 'Camera access required',
  permissionDescription:
    'Allow camera permission to scan the organizer QR code and complete check-in.',
  permissionButton: 'Allow camera access',
  manualCodeTitle: 'Enter code manually',
  manualCodePlaceholder: 'Paste check-in code',
  manualCodeCancel: 'Cancel',
  manualCodeConfirm: 'Confirm',
} as const;
