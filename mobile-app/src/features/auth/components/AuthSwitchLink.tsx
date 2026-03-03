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
      <Pressable onPress={() => router.replace(href as never)}>
        <Text style={styles.link}>{linkText}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: AuthTokens.spacing.lg,
    gap: AuthTokens.spacing.xs,
  },
  message: {
    fontSize: AuthTokens.fontSize.md,
    color: AuthTokens.colors.textSecondary,
  },
  link: {
    fontSize: AuthTokens.fontSize.md,
    fontWeight: '600',
    color: AuthTokens.colors.brandBlue,
  },
});
