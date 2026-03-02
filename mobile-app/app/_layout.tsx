import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/src/shared/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // TODO: Add auth state resolution here
  // TODO: Redirect based on role:
  //   - unauthenticated -> (auth)
  //   - volunteer -> (volunteer)
  //   - organizer -> (organizer)

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(volunteer)" />
        <Stack.Screen name="(organizer)" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
