import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthGate } from '@/components/auth-gate';

const ACTIVE_COLOR = '#a3e635'; // lime-400 – primary accent
const INACTIVE_COLOR = '#52525b'; // zinc-600

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabIconProps {
  name: IconName;
  activeName: IconName;
  color: string;
  focused: boolean;
}

function TabIcon({ name, activeName, color, focused }: TabIconProps) {
  return <Ionicons name={focused ? activeName : name} size={24} color={color} />;
}

export default function TabLayout() {
  return (
    <AuthGate>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: {
          backgroundColor: '#09090b', // zinc-950
          borderTopColor: '#27272a', // zinc-800
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home-outline" activeName="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="templates"
        options={{
          title: 'Templates',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="list-outline" activeName="list" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="time-outline" activeName="time" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="trending-up-outline"
              activeName="trending-up"
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="person-outline"
              activeName="person"
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
    </AuthGate>
  );
}
