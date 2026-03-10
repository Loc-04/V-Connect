import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';

import {
  AuthScreenContainer,
  AuthTextInput,
  AuthPrimaryButton,
  AuthCheckboxRow,
  AuthDivider,
  AuthSocialButton,
  AuthSwitchLink,
  AuthTokens,
  signInWithEmail,
  useAuth,
} from '@/src/features/auth';
import { ROUTES } from '@/src/shared/constants/route-constants';

export default function LoginScreen() {
  const { authError } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authError) return;
    Alert.alert('Authentication Issue', authError);
  }, [authError]);

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
    try {
      const { error } = await signInWithEmail(email.trim(), password);
      if (error) {
        Alert.alert('Login Failed', error);
      }
    } catch {
      Alert.alert('Login Failed', 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreenContainer contentMode="centeredCard">
      <View style={styles.brand}>
        <View style={styles.brandIconShell}>
          <MaterialIcons name="volunteer-activism" size={30} color={AuthTokens.colors.brandBlue} />
        </View>
        <Text style={styles.brandTitle}>V-Connect</Text>
        <Text style={styles.brandSubtitle}>Connect volunteers with meaningful activities</Text>
      </View>

      <View style={styles.card}>
        <AuthTextInput
          label="Email Address"
          placeholder="name@example.com"
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
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          leadingIcon={<MaterialIcons name="mail-outline" size={18} color={AuthTokens.colors.iconDefault} />}
        />

        <View style={styles.passwordHeader}>
          <Text style={styles.passwordLabel}>Password</Text>
          <Pressable
            onPress={() => Alert.alert('Coming Soon', 'Forgot password flow is not implemented yet.')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
          >
            <Text style={styles.forgotLink}>Forgot Password?</Text>
          </Pressable>
        </View>
        <AuthTextInput
          label=""
          placeholder="........"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
          }}
          error={errors.password}
          secureTextEntry={!showPassword}
          autoComplete="password"
          textContentType="password"
          ref={passwordRef}
          returnKeyType="go"
          onSubmitEditing={handleLogin}
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

        <View style={styles.rowTopGap}>
          <AuthCheckboxRow
            value={rememberMe}
            onChange={setRememberMe}
            label="Remember me for 30 days"
          />
        </View>

        <AuthPrimaryButton
          title="Sign In"
          loading={loading}
          onPress={handleLogin}
          rightIcon={<MaterialIcons name="login" size={18} color={AuthTokens.colors.white} />}
        />

        <AuthDivider label="Or continue with" />

        <AuthSocialButton
          title="Google"
          onPress={() => Alert.alert('Coming Soon', 'Google sign-in is not implemented yet.')}
        />

        <AuthSwitchLink
          message="Don’t have an account?"
          linkText="Sign up for free"
          href={ROUTES.AUTH.REGISTER}
        />
      </View>

      <View style={styles.legalFooter}>
        <Pressable
          hitSlop={8}
          onPress={() => Alert.alert('Info', 'Privacy Policy placeholder.')}
          accessibilityRole="button"
          accessibilityLabel="Privacy Policy"
        >
          <Text style={styles.legalLink}>Privacy Policy</Text>
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={() => Alert.alert('Info', 'Terms of Service placeholder.')}
          accessibilityRole="button"
          accessibilityLabel="Terms of Service"
        >
          <Text style={styles.legalLink}>Terms of Service</Text>
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={() => Alert.alert('Info', 'Help Center placeholder.')}
          accessibilityRole="button"
          accessibilityLabel="Help Center"
        >
          <Text style={styles.legalLink}>Help Center</Text>
        </Pressable>
      </View>
    </AuthScreenContainer>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignItems: 'center',
    marginBottom: AuthTokens.spacing.xl,
    gap: AuthTokens.spacing.sm,
  },
  brandIconShell: {
    width: 72,
    height: 72,
    borderRadius: AuthTokens.radius.pill,
    backgroundColor: AuthTokens.colors.brandBlueSoft,
    borderWidth: AuthTokens.borderWidth.thin,
    borderColor: '#77ced0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: AuthTokens.typography.screenTitle.fontSize,
    lineHeight: AuthTokens.typography.screenTitle.lineHeight,
    fontWeight: AuthTokens.typography.screenTitle.fontWeight,
    color: '#0f172a',
  },
  brandSubtitle: {
    fontSize: AuthTokens.typography.subtitle.fontSize,
    lineHeight: AuthTokens.typography.subtitle.lineHeight,
    color: AuthTokens.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 290,
  },
  card: {
    borderRadius: 24,
    borderWidth: AuthTokens.borderWidth.thin,
    borderColor: '#dbe4ea',
    backgroundColor: AuthTokens.colors.cardBackground,
    paddingHorizontal: AuthTokens.spacing.lg,
    paddingVertical: AuthTokens.spacing.lg,
    ...AuthTokens.shadows.card,
  },
  passwordHeader: {
    marginBottom: AuthTokens.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passwordLabel: {
    fontSize: AuthTokens.typography.inputLabel.fontSize,
    lineHeight: AuthTokens.typography.inputLabel.lineHeight,
    fontWeight: AuthTokens.typography.inputLabel.fontWeight,
    color: AuthTokens.colors.textPrimary,
  },
  forgotLink: {
    color: AuthTokens.colors.brandBlue,
    fontSize: AuthTokens.fontSize.sm,
    fontWeight: '600',
  },
  rowTopGap: {
    marginTop: AuthTokens.spacing.ssm,
  },
  legalFooter: {
    marginTop: AuthTokens.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: AuthTokens.spacing.sm,
  },
  legalLink: {
    color: '#98a2b3',
    fontSize: AuthTokens.typography.legal.fontSize,
    lineHeight: AuthTokens.typography.legal.lineHeight,
  },
});
