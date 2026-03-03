import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';

import { AuthTokens } from '../styles/tokens';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  loading?: boolean;
};

export function AuthPrimaryButton({ title, loading, disabled, style, ...rest }: Props) {
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
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={AuthTokens.colors.white} />
      ) : (
        <Text style={styles.text}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: AuthTokens.radius.md,
    backgroundColor: AuthTokens.colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: AuthTokens.spacing.sm,
  },
  pressed: {
    backgroundColor: AuthTokens.colors.brandBlueDark,
  },
  disabled: {
    backgroundColor: AuthTokens.colors.disabled,
  },
  text: {
    color: AuthTokens.colors.white,
    fontSize: AuthTokens.fontSize.lg,
    fontWeight: '600',
  },
});
