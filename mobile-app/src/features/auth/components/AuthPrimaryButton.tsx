import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import type { ReactNode } from 'react';

import { AuthTokens } from '../styles/tokens';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  loading?: boolean;
  rightIcon?: ReactNode;
};

export function AuthPrimaryButton({
  title,
  loading,
  disabled,
  rightIcon,
  style,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style as object,
      ]}
      disabled={isDisabled}
      accessibilityRole="button"
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={AuthTokens.colors.white} />
      ) : (
        <View style={styles.row}>
          <Text style={styles.text}>{title}</Text>
          {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: AuthTokens.controlHeights.button,
    borderRadius: AuthTokens.radius.pill,
    backgroundColor: AuthTokens.colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: AuthTokens.spacing.md,
    ...AuthTokens.shadows.button,
  },
  pressed: {
    backgroundColor: AuthTokens.colors.brandBlueDark,
  },
  disabled: {
    backgroundColor: AuthTokens.colors.disabled,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AuthTokens.spacing.sm,
  },
  text: {
    color: AuthTokens.colors.white,
    fontSize: AuthTokens.typography.button.fontSize,
    lineHeight: AuthTokens.typography.button.lineHeight,
    fontWeight: AuthTokens.typography.button.fontWeight,
  },
  icon: {
    marginTop: 1,
  },
});
