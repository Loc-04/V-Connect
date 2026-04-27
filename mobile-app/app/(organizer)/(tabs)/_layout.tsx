import { Tabs } from 'expo-router';
import { Image } from 'react-native';

import { Colors } from '@/src/shared/constants/theme';
import { useColorScheme } from '@/src/shared/hooks/use-color-scheme';
import { HapticTab } from '@/src/shared/ui/haptic-tab';

const homeIcon = require('@/assets/home_icon.png');
const activitiesIcon = require('@/assets/activity_icon.png');
const messagesIcon = require('@/assets/msg_icon.png');
const profileIcon = require('@/assets/pro5_icon.png');

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

export default function OrganizerTabsLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => renderTabIcon(homeIcon, color),
        }}
      />
      <Tabs.Screen
        name="activities"
        options={{
          title: 'Activities',
          tabBarIcon: ({ color }) => renderTabIcon(activitiesIcon, color),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => renderTabIcon(messagesIcon, color),
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
