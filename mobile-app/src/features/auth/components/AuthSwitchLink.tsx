import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthTokens } from '../styles/tokens';

type Props = {
  message: string;
  linkText: string;
  href: string;
};

export function AuthSwitchLink({ message, linkText, href }: Props) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        onPress={() => router.replace(href as never)}
        hitSlop={8}
        accessibilityRole="button"
      >
        <Text style={styles.link}>{linkText}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: AuthTokens.spacing.lg,
    gap: AuthTokens.spacing.ssm,
  },
  message: {
    fontSize: AuthTokens.typography.body.fontSize,
    lineHeight: AuthTokens.typography.body.lineHeight,
    color: AuthTokens.colors.textMuted,
  },
  link: {
    fontSize: AuthTokens.typography.link.fontSize,
    lineHeight: AuthTokens.typography.link.lineHeight,
    fontWeight: AuthTokens.typography.link.fontWeight,
    color: AuthTokens.colors.brandBlue,
  },
});
