import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, canAccessRouteGroup, getHomeRouteForRole, useAuth } from '@/src/features/auth';
import { ROUTES } from '@/src/shared/constants/route-constants';
import { useColorScheme } from '@/src/shared/hooks/use-color-scheme';

function RouteGuard() {
  const { status, role } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    const currentGroup = segments[0];
    const inAuthGroup = currentGroup === '(auth)';

    if (status === 'unauthenticated' && !inAuthGroup) {
      router.replace(ROUTES.AUTH.LOGIN as never);
      return;
    }

    if (status !== 'authenticated' || !role) return;

    if (inAuthGroup) {
      router.replace(getHomeRouteForRole(role) as never);
      return;
    }

    if (!canAccessRouteGroup(role, currentGroup)) {
      router.replace(getHomeRouteForRole(role) as never);
    }
  }, [status, role, segments, router]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(volunteer)" />
      <Stack.Screen name="(organizer)" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RouteGuard />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
