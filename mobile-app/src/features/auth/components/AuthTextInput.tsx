import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { AuthTokens } from '../styles/tokens';

type Props = TextInputProps & {
  label: string;
  error?: string;
};

export function AuthTextInput({ label, error, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? AuthTokens.colors.error
    : focused
      ? AuthTokens.colors.inputBorderFocus
      : AuthTokens.colors.inputBorder;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, { borderColor }, style]}
        placeholderTextColor={AuthTokens.colors.textPlaceholder}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: AuthTokens.spacing.md,
  },
  label: {
    fontSize: AuthTokens.fontSize.sm,
    fontWeight: '600',
    color: AuthTokens.colors.textPrimary,
    marginBottom: AuthTokens.spacing.xs,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: AuthTokens.radius.md,
    paddingHorizontal: AuthTokens.spacing.md,
    fontSize: AuthTokens.fontSize.md,
    color: AuthTokens.colors.textPrimary,
    backgroundColor: AuthTokens.colors.backgroundPrimary,
  },
  error: {
    fontSize: AuthTokens.fontSize.sm,
    color: AuthTokens.colors.error,
    marginTop: AuthTokens.spacing.xs,
  },
});
