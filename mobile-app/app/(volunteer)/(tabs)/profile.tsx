import { useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { useAuth } from '@/src/features/auth';
import { ThemedText } from '@/src/shared/ui/themed-text';
import { ThemedView } from '@/src/shared/ui/themed-view';

export default function ProfileScreen() {
  const { user, role, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          if (isSigningOut) return;
          setIsSigningOut(true);
          try {
            const { error } = await signOut();
            if (error) {
              Alert.alert('Sign Out Failed', error);
            }
          } finally {
            setIsSigningOut(false);
          }
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Profile</ThemedText>
      {user?.email && (
        <ThemedText style={styles.email}>{user.email}</ThemedText>
      )}
      {role && (
        <ThemedText style={styles.role}>Role: {role}</ThemedText>
      )}
      <Pressable
        style={[styles.signOutButton, isSigningOut && styles.signOutButtonDisabled]}
        onPress={handleSignOut}
        disabled={isSigningOut}
      >
        <ThemedText style={styles.signOutText}>
          {isSigningOut ? 'Signing Out...' : 'Sign Out'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  email: {
    marginTop: 8,
    opacity: 0.6,
  },
  role: {
    marginTop: 6,
    opacity: 0.75,
    textTransform: 'capitalize',
  },
  signOutButton: {
    marginTop: 32,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    backgroundColor: '#dc2626',
  },
  signOutButtonDisabled: {
    opacity: 0.7,
  },
  signOutText: {
    color: '#fff',
    fontWeight: '600',
  },
});
