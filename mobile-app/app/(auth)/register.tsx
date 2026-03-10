import { useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  AuthScreenContainer,
  AuthTextInput,
  AuthPrimaryButton,
  AuthDivider,
  AuthRoleSelect,
  AuthSocialButton,
  AuthSwitchLink,
  AuthTokens,
  type RegistrationRole,
  signUpWithEmail,
} from '@/src/features/auth';
import { ROUTES } from '@/src/shared/constants/route-constants';

interface FormErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  role?: string;
}

export default function RegisterScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<RegistrationRole>('volunteer');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  function normalizePhone(value: string): string {
    const trimmed = value.trim().replace(/[\s-]/g, '');
    if (trimmed.startsWith('+')) {
      return `+${trimmed.slice(1).replace(/\D/g, '')}`;
    }
    return trimmed.replace(/\D/g, '');
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (!fullName.trim()) next.fullName = 'Full name is required';
    if (!email.trim()) {
      next.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      next.email = 'Invalid email format';
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      next.phone = 'Phone number is required';
    } else if (!/^\+?\d{8,15}$/.test(normalizedPhone)) {
      next.phone = 'Invalid phone number format';
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
    const normalizedPhone = normalizePhone(phone);
    setLoading(true);
    try {
      const { data: session, error } = await signUpWithEmail(
        email.trim(),
        password,
        { fullName: fullName.trim(), role, phone: normalizedPhone },
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
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.replace(ROUTES.AUTH.LOGIN)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to sign in"
        >
          <MaterialIcons name="arrow-back" size={22} color={AuthTokens.colors.textPrimary} />
        </Pressable>
        <View style={styles.brandMini}>
          <MaterialIcons name="volunteer-activism" size={18} color={AuthTokens.colors.brandBlue} />
          <Text style={styles.brandMiniText}>V-Connect</Text>
        </View>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join our community of volunteers</Text>
      </View>

      <AuthTextInput
        label="Full Name"
        placeholder="Enter your full name"
        value={fullName}
        onChangeText={(t) => { setFullName(t); clearError('fullName'); }}
        error={errors.fullName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        leadingIcon={<MaterialIcons name="person-outline" size={18} color={AuthTokens.colors.iconDefault} />}
      />

      <AuthTextInput
        label="Email Address"
        placeholder="example@domain.com"
        value={email}
        onChangeText={(t) => { setEmail(t); clearError('email'); }}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        leadingIcon={<MaterialIcons name="mail-outline" size={18} color={AuthTokens.colors.iconDefault} />}
      />

      <AuthTextInput
        label="Phone Number"
        placeholder="Enter your phone number"
        value={phone}
        onChangeText={(t) => { setPhone(t); clearError('phone'); }}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        leadingIcon={<MaterialIcons name="call" size={18} color={AuthTokens.colors.iconDefault} />}
      />

      <AuthRoleSelect
        label="Select Role"
        value={role}
        error={errors.role}
        onChange={(nextRole) => {
          setRole(nextRole);
          clearError('role');
        }}
      />

      <AuthTextInput
        label="Password"
        placeholder="........"
        value={password}
        onChangeText={(t) => { setPassword(t); clearError('password'); }}
        error={errors.password}
        secureTextEntry={!showPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        leadingIcon={<MaterialIcons name="lock-outline" size={18} color={AuthTokens.colors.iconDefault} />}
        trailingIcon={
          <MaterialIcons
            name={showPassword ? 'visibility-off' : 'visibility'}
            size={20}
            color={AuthTokens.colors.iconDefault}
          />
        }
        onTrailingPress={() => setShowPassword((prev) => !prev)}
        trailingAccessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
      />

      <AuthTextInput
        label="Confirm Password"
        placeholder="........"
        value={confirmPassword}
        onChangeText={(t) => { setConfirmPassword(t); clearError('confirmPassword'); }}
        error={errors.confirmPassword}
        secureTextEntry={!showConfirmPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        leadingIcon={<MaterialIcons name="history-toggle-off" size={18} color={AuthTokens.colors.iconDefault} />}
        trailingIcon={
          <MaterialIcons
            name={showConfirmPassword ? 'visibility-off' : 'visibility'}
            size={20}
            color={AuthTokens.colors.iconDefault}
          />
        }
        onTrailingPress={() => setShowConfirmPassword((prev) => !prev)}
        trailingAccessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
      />

      <AuthPrimaryButton
        title="Sign Up"
        loading={loading}
        onPress={handleRegister}
        rightIcon={<MaterialIcons name="arrow-forward" size={18} color={AuthTokens.colors.white} />}
      />

      <AuthDivider label="Or" />

      <AuthSocialButton
        title="Sign up with Google"
        onPress={() => Alert.alert('Coming Soon', 'Google sign-up is not implemented yet.')}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AuthTokens.spacing.mdm,
    marginBottom: AuthTokens.spacing.lgm,
    marginTop: AuthTokens.spacing.sm,
  },
  brandMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AuthTokens.spacing.xs,
  },
  brandMiniText: {
    color: AuthTokens.colors.brandBlue,
    fontSize: AuthTokens.fontSize.lg,
    fontWeight: '700',
  },
  header: {
    marginBottom: AuthTokens.spacing.lg,
  },
  title: {
    fontSize: AuthTokens.typography.formTitle.fontSize,
    lineHeight: AuthTokens.typography.formTitle.lineHeight,
    fontWeight: AuthTokens.typography.formTitle.fontWeight,
    color: AuthTokens.colors.textPrimary,
  },
  subtitle: {
    fontSize: AuthTokens.typography.subtitle.fontSize,
    lineHeight: AuthTokens.typography.subtitle.lineHeight,
    color: AuthTokens.colors.textSecondary,
    marginTop: AuthTokens.spacing.ssm,
  },
});
