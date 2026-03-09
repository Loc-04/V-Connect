import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AuthScreenContainer,
  AuthTextInput,
  AuthPrimaryButton,
  AuthSwitchLink,
  AuthTokens,
  type RegistrationRole,
  signUpWithEmail,
} from '@/src/features/auth';
import { ROUTES } from '@/src/shared/constants/route-constants';

interface FormErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  role?: string;
}

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<RegistrationRole>('volunteer');
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
    if (!role) {
      next.role = 'Role is required';
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
        { fullName: fullName.trim(), role },
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
        <Text style={styles.subtitle}>Create your V-Connect account</Text>
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

      <View style={styles.roleSection}>
        <Text style={styles.roleLabel}>Role</Text>
        <View style={styles.roleOptions}>
          {(['volunteer', 'organizer'] as const).map((option) => {
            const selected = role === option;
            return (
              <Pressable
                key={option}
                style={[styles.roleButton, selected && styles.roleButtonSelected]}
                onPress={() => {
                  setRole(option);
                  clearError('role');
                }}
              >
                <Text style={[styles.roleButtonText, selected && styles.roleButtonTextSelected]}>
                  {option === 'volunteer' ? 'Volunteer' : 'Organizer'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {errors.role ? <Text style={styles.roleError}>{errors.role}</Text> : null}
      </View>

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
  roleSection: {
    marginTop: AuthTokens.spacing.sm,
    marginBottom: AuthTokens.spacing.sm,
  },
  roleLabel: {
    marginBottom: AuthTokens.spacing.xs,
    color: AuthTokens.colors.textPrimary,
    fontSize: AuthTokens.fontSize.sm,
    fontWeight: '600',
  },
  roleOptions: {
    flexDirection: 'row',
    gap: AuthTokens.spacing.sm,
  },
  roleButton: {
    flex: 1,
    borderRadius: AuthTokens.radius.md,
    borderWidth: 1,
    borderColor: AuthTokens.colors.inputBorder,
    paddingVertical: AuthTokens.spacing.md,
    alignItems: 'center',
    backgroundColor: AuthTokens.colors.backgroundSecondary,
  },
  roleButtonSelected: {
    borderColor: AuthTokens.colors.brandBlue,
    backgroundColor: 'rgba(10, 126, 164, 0.12)',
  },
  roleButtonText: {
    color: AuthTokens.colors.textSecondary,
    fontWeight: '600',
  },
  roleButtonTextSelected: {
    color: AuthTokens.colors.brandBlue,
  },
  roleError: {
    marginTop: AuthTokens.spacing.xs,
    color: AuthTokens.colors.error,
    fontSize: AuthTokens.fontSize.sm,
  },
});
