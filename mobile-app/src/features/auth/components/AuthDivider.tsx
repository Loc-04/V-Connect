import { StyleSheet, Text, View } from 'react-native';

import { AuthTokens } from '../styles/tokens';

type Props = {
  label: string;
};

export function AuthDivider({ label }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: AuthTokens.spacing.lg,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: AuthTokens.colors.divider,
  },
  label: {
    marginHorizontal: AuthTokens.spacing.mdm,
    color: AuthTokens.colors.textMuted,
    fontSize: AuthTokens.typography.divider.fontSize,
    lineHeight: AuthTokens.typography.divider.lineHeight,
    fontWeight: AuthTokens.typography.divider.fontWeight,
    textTransform: 'uppercase',
  },
});
