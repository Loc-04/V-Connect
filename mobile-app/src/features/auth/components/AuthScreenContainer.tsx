import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthTokens } from '../styles/tokens';

type Props = ViewProps & {
  children: React.ReactNode;
  contentMode?: 'centeredCard' | 'form';
};

export function AuthScreenContainer({
  children,
  style,
  contentMode = 'form',
  ...rest
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      {...rest}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            contentMode === 'centeredCard' ? styles.scrollCentered : styles.scrollForm,
            style,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AuthTokens.colors.backgroundPrimary,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: AuthTokens.spacing.lg,
    paddingVertical: AuthTokens.spacing.lg,
  },
  scrollCentered: {
    justifyContent: 'center',
  },
  scrollForm: {
    justifyContent: 'flex-start',
  },
});
