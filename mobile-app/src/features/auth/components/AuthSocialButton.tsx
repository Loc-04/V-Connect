import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';

import { AuthTokens } from '../styles/tokens';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  iconName?: ComponentProps<typeof MaterialIcons>['name'];
};

export function AuthSocialButton({ title, iconName = 'g-translate', style, ...rest }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style as object]}
      accessibilityRole="button"
      {...rest}
    >
      <View style={styles.row}>
        <MaterialIcons name={iconName} size={20} color={AuthTokens.colors.textSecondary} />
        <Text style={styles.text}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: AuthTokens.controlHeights.social,
    borderRadius: AuthTokens.radius.xl,
    borderWidth: AuthTokens.borderWidth.thin,
    borderColor: AuthTokens.colors.inputBorder,
    backgroundColor: AuthTokens.colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AuthTokens.spacing.sm,
  },
  text: {
    color: AuthTokens.colors.textSecondary,
    fontSize: AuthTokens.typography.body.fontSize,
    lineHeight: AuthTokens.typography.body.lineHeight,
    fontWeight: '600',
  },
});
