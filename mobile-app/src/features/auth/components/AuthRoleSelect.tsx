import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RegistrationRole } from '../types';
import { AuthTokens } from '../styles/tokens';

type RoleOption = {
  value: RegistrationRole;
  label: string;
};

type Props = {
  label: string;
  value: RegistrationRole;
  onChange: (value: RegistrationRole) => void;
  error?: string;
};

const OPTIONS: RoleOption[] = [
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'organizer', label: 'Organizer' },
];

export function AuthRoleSelect({ label, value, onChange, error }: Props) {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(
    () => OPTIONS.find((option) => option.value === value)?.label ?? 'Select your role',
    [value],
  );

  const borderColor = error
    ? AuthTokens.colors.error
    : open
      ? AuthTokens.colors.inputBorderFocus
      : AuthTokens.colors.inputBorder;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.trigger, { borderColor }]}
        onPress={() => setOpen((prev) => !prev)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.triggerLeft}>
          <MaterialIcons name="badge" size={18} color={AuthTokens.colors.iconDefault} />
          <Text style={styles.triggerText}>{selectedLabel}</Text>
        </View>
        <MaterialIcons
          name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={22}
          color={AuthTokens.colors.textMuted}
        />
      </Pressable>
      {open ? (
        <View style={styles.dropdown}>
          {OPTIONS.map((option, index) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                style={[styles.option, index !== OPTIONS.length - 1 && styles.optionBorder]}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {option.label}
                </Text>
                {selected ? (
                  <MaterialIcons
                    name="check"
                    size={18}
                    color={AuthTokens.colors.brandBlue}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

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
  trigger: {
    minHeight: AuthTokens.controlHeights.input,
    borderRadius: AuthTokens.radius.xl,
    borderWidth: AuthTokens.borderWidth.thin,
    paddingHorizontal: AuthTokens.spacing.mdm,
    backgroundColor: AuthTokens.colors.inputBackground,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AuthTokens.spacing.sm,
  },
  triggerText: {
    color: AuthTokens.colors.textPrimary,
    fontSize: AuthTokens.typography.inputValue.fontSize,
    lineHeight: AuthTokens.typography.inputValue.lineHeight,
  },
  dropdown: {
    marginTop: AuthTokens.spacing.xs,
    borderWidth: AuthTokens.borderWidth.thin,
    borderColor: AuthTokens.colors.inputBorderFocus,
    borderRadius: AuthTokens.radius.xl,
    overflow: 'hidden',
    backgroundColor: AuthTokens.colors.backgroundSecondary,
  },
  option: {
    minHeight: 50,
    paddingHorizontal: AuthTokens.spacing.mdm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionBorder: {
    borderBottomWidth: AuthTokens.borderWidth.thin,
    borderBottomColor: AuthTokens.colors.divider,
  },
  optionText: {
    color: AuthTokens.colors.textSecondary,
    fontSize: AuthTokens.typography.body.fontSize,
    lineHeight: AuthTokens.typography.body.lineHeight,
  },
  optionTextSelected: {
    color: AuthTokens.colors.brandBlue,
    fontWeight: '600',
  },
  error: {
    fontSize: AuthTokens.fontSize.xs,
    color: AuthTokens.colors.error,
    marginTop: AuthTokens.spacing.sm,
  },
});
