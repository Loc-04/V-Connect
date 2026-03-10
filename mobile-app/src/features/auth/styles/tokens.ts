export const AuthTokens = {
  // Use semantic colors instead of hard-coded values in screens/components.
  colors: {
    brandBlue: '#0f8b8d',
    brandBlueDark: '#0b7375',
    brandBlueSoft: '#0f8b8d1f',
    white: '#ffffff',
    black: '#101828',
    backgroundPrimary: '#f5f7fa',
    backgroundSecondary: '#ffffff',
    cardBackground: '#ffffff',
    textPrimary: '#111827',
    textSecondary: '#475467',
    textMuted: '#667085',
    textPlaceholder: '#98a2b3',
    inputBackground: '#f9fafb',
    inputBorder: '#d0d5dd',
    inputBorderFocus: '#0f8b8d',
    divider: '#e4e7ec',
    iconDefault: '#98a2b3',
    error: '#d93025',
    success: '#067647',
    disabled: '#c4c9cc',
  },
  // Shared spacing/radius primitives used by all auth surfaces.
  spacing: {
    xxs: 2,
    xs: 4,
    ssm: 6,
    sm: 8,
    mdm: 12,
    md: 16,
    lgm: 20,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
    xl: 20,
    pill: 999,
  },
  borderWidth: {
    thin: 1,
    thick: 1.5,
  },
  // Legacy fontSize tokens are kept for backward compatibility.
  fontSize: {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 28,
  },
  // Prefer these typography roles in new auth UI.
  typography: {
    screenTitle: {
      fontSize: 42,
      lineHeight: 48,
      fontWeight: '700',
    },
    formTitle: {
      fontSize: 42,
      lineHeight: 48,
      fontWeight: '700',
    },
    subtitle: {
      fontSize: 17,
      lineHeight: 26,
      fontWeight: '400',
    },
    inputLabel: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
    },
    inputValue: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '400',
    },
    button: {
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '700',
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '400',
    },
    link: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
    },
    legal: {
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '400',
    },
    divider: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
    },
  },
  controlHeights: {
    input: 52,
    button: 56,
    social: 52,
  },
  shadows: {
    button: {
      shadowColor: '#101828',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 5,
    },
    card: {
      shadowColor: '#101828',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 20,
      elevation: 3,
    },
  },
} as const;
