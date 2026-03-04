import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  AuthScreenContainer,
  AuthTextInput,
  AuthPrimaryButton,
  AuthSwitchLink,
  AuthTokens,
  signUpWithEmail,
} from '@/src/features/auth';
import { ROUTES } from '@/src/shared/constants/route-constants';

interface FormErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const next: FormErrors = {};
    if (!fullName.trim()) next.fullName = 'Full name is required';
    if (!email.trim()) {
      next.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      next.email = 'Invalid email format';
    }
    if (!password) {
      next.password = 'Password is required';
    } else if (password.length < 6) {
      next.password = 'Password must be at least 6 characters';
    }
    if (confirmPassword !== password) {
      next.confirmPassword = 'Passwords do not match';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleRegister() {
    if (!validate()) return;
    setLoading(true);
    try {
      const { data: session, error } = await signUpWithEmail(
        email.trim(),
        password,
        { fullName: fullName.trim() },
      );
      if (error) {
        Alert.alert('Registration Failed', error);
        return;
      }
      if (!session) {
        Alert.alert(
          'Check Your Email',
          'A confirmation link has been sent to your email. Please verify before signing in.',
        );
      }
    } catch {
      Alert.alert('Registration Failed', 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  function clearError(field: keyof FormErrors) {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  return (
    <AuthScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join V-Connect as a volunteer</Text>
      </View>

      <AuthTextInput
        label="Full Name"
        placeholder="Your full name"
        value={fullName}
        onChangeText={(t) => { setFullName(t); clearError('fullName'); }}
        error={errors.fullName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
      />

      <AuthTextInput
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={(t) => { setEmail(t); clearError('email'); }}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />

      <AuthTextInput
        label="Password"
        placeholder="At least 6 characters"
        value={password}
        onChangeText={(t) => { setPassword(t); clearError('password'); }}
        error={errors.password}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />

      <AuthTextInput
        label="Confirm Password"
        placeholder="Re-enter your password"
        value={confirmPassword}
        onChangeText={(t) => { setConfirmPassword(t); clearError('confirmPassword'); }}
        error={errors.confirmPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />

      <AuthPrimaryButton
        title="Create Account"
        loading={loading}
        onPress={handleRegister}
      />

      <AuthSwitchLink
        message="Already have an account?"
        linkText="Sign In"
        href={ROUTES.AUTH.LOGIN}
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
