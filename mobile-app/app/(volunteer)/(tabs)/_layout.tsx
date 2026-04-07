import { Tabs } from 'expo-router';
import { Image } from 'react-native';

import { HapticTab } from '@/src/shared/ui/haptic-tab';
import { Colors } from '@/src/shared/constants/theme';
import { useColorScheme } from '@/src/shared/hooks/use-color-scheme';

const homeIcon = require('@/assets/home_icon.png');
const exploreIcon = require('@/assets/Explore_Icon.png');
const aiMatchIcon = require('@/assets/AI_icon.png');
const activityIcon = require('@/assets/activity_icon.png');
const profileIcon = require('@/assets/pro5_icon.png');

export default function VolunteerTabLayout() {
  const colorScheme = useColorScheme();

  function renderTabIcon(source: number, color: string) {
    return (
      <Image
        source={source}
        style={{
          width: 28,
          height: 28,
          tintColor: color,
        }}
        resizeMode="contain"
      />
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => renderTabIcon(homeIcon, color),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => renderTabIcon(exploreIcon, color),
        }}
      />
      <Tabs.Screen
        name="ai-match"
        options={{
          title: 'AI Match',
          tabBarIcon: ({ color }) => renderTabIcon(aiMatchIcon, color),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color }) => renderTabIcon(activityIcon, color),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => renderTabIcon(profileIcon, color),
        }}
      />
    </Tabs>
  );
}
