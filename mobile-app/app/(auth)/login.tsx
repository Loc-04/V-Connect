import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  AuthScreenContainer,
  AuthTextInput,
  AuthPrimaryButton,
  AuthSwitchLink,
  AuthTokens,
} from '@/src/features/auth';
import { ROUTES } from '@/src/shared/constants/route-constants';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const next: typeof errors = {};
    if (!email.trim()) {
      next.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      next.email = 'Invalid email format';
    }
    if (!password) {
      next.password = 'Password is required';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleLogin() {
    if (!validate()) return;
    setLoading(true);
    // TODO: integrate auth service
    Alert.alert('Login', `Submit: ${email}`);
    setLoading(false);
  }

  return (
    <AuthScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>
      </View>

      <AuthTextInput
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
        }}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />

      <AuthTextInput
        label="Password"
        placeholder="Enter your password"
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
        }}
        error={errors.password}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
      />

      <AuthPrimaryButton
        title="Sign In"
        loading={loading}
        onPress={handleLogin}
      />

      <AuthSwitchLink
        message="Don't have an account?"
        linkText="Register"
        href={ROUTES.AUTH.REGISTER}
      />
    </AuthScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: AuthTokens.spacing.xl,
  },
  title: {
    fontSize: AuthTokens.fontSize.xl,
    fontWeight: '700',
    color: AuthTokens.colors.textPrimary,
  },
  subtitle: {
    fontSize: AuthTokens.fontSize.md,
    color: AuthTokens.colors.textSecondary,
    marginTop: AuthTokens.spacing.xs,
  },
});
