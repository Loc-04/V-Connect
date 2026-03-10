import { forwardRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { AuthTokens } from '../styles/tokens';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  onTrailingPress?: () => void;
  trailingAccessibilityLabel?: string;
};

export const AuthTextInput = forwardRef<TextInput, Props>(function AuthTextInput(
  {
    label,
    error,
    style,
    leadingIcon,
    trailingIcon,
    onTrailingPress,
    trailingAccessibilityLabel,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? AuthTokens.colors.error
    : focused
      ? AuthTokens.colors.inputBorderFocus
      : AuthTokens.colors.inputBorder;

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputShell, { borderColor }]}>
        {leadingIcon ? <View style={styles.leadingIcon}>{leadingIcon}</View> : null}
        <TextInput
          ref={ref}
          style={[styles.input, style]}
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
        {trailingIcon ? (
          onTrailingPress ? (
            <Pressable
              style={styles.trailingIconPressable}
              onPress={onTrailingPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={trailingAccessibilityLabel ?? 'Toggle input visibility'}
            >
              {trailingIcon}
            </Pressable>
          ) : (
            <View style={styles.trailingIcon}>{trailingIcon}</View>
          )
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: AuthTokens.spacing.md,
  },
  label: {
    fontSize: AuthTokens.typography.inputLabel.fontSize,
    lineHeight: AuthTokens.typography.inputLabel.lineHeight,
    fontWeight: AuthTokens.typography.inputLabel.fontWeight,
    color: AuthTokens.colors.textPrimary,
    marginBottom: AuthTokens.spacing.sm,
  },
  inputShell: {
    minHeight: AuthTokens.controlHeights.input,
    borderWidth: AuthTokens.borderWidth.thin,
    borderRadius: AuthTokens.radius.xl,
    backgroundColor: AuthTokens.colors.inputBackground,
    paddingHorizontal: AuthTokens.spacing.mdm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leadingIcon: {
    marginRight: AuthTokens.spacing.sm,
  },
  trailingIcon: {
    marginLeft: AuthTokens.spacing.sm,
  },
  trailingIconPressable: {
    marginLeft: AuthTokens.spacing.sm,
    padding: AuthTokens.spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: AuthTokens.typography.inputValue.fontSize,
    lineHeight: AuthTokens.typography.inputValue.lineHeight,
    color: AuthTokens.colors.textPrimary,
    paddingVertical: AuthTokens.spacing.mdm,
  },
  error: {
    fontSize: AuthTokens.fontSize.xs,
    color: AuthTokens.colors.error,
    marginTop: AuthTokens.spacing.sm,
  },
});
