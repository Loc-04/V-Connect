import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthTokens } from '../styles/tokens';

type Props = {
  value: boolean;
  label: string;
  onChange: (nextValue: boolean) => void;
};

export function AuthCheckboxRow({ value, label, onChange }: Props) {
  return (
    <Pressable
      style={styles.container}
      onPress={() => onChange(!value)}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
    >
      <View style={[styles.box, value && styles.boxChecked]}>
        {value ? <MaterialIcons name="check" size={13} color={AuthTokens.colors.white} /> : null}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AuthTokens.spacing.sm,
  },
  box: {
    width: 18,
    height: 18,
    borderRadius: AuthTokens.radius.pill,
    borderWidth: AuthTokens.borderWidth.thin,
    borderColor: AuthTokens.colors.inputBorder,
    backgroundColor: AuthTokens.colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: AuthTokens.colors.brandBlue,
    borderColor: AuthTokens.colors.brandBlue,
  },
  label: {
    color: AuthTokens.colors.textSecondary,
    fontSize: AuthTokens.typography.body.fontSize,
    lineHeight: AuthTokens.typography.body.lineHeight,
  },
});
