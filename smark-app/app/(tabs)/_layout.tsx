import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';

type IonName = ComponentProps<typeof Ionicons>['name'];

/** 选中实心、未选中同形描边（`-outline`），颜色仍由 tabBar tint 提供。 */
function tabIcon(solid: IonName, outline: IonName) {
  return ({ color, focused, size }: { color: string; focused: boolean; size: number }) => (
    <Ionicons name={focused ? solid : outline} size={Math.round(size)} color={color} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e5e7eb',
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarLabel: '首页',
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: '复习',
          tabBarLabel: '复习',
          tabBarIcon: tabIcon('book', 'book-outline'),
        }}
      />
      <Tabs.Screen
        name="perses"
        options={{
          title: 'Perses',
          tabBarLabel: 'Perses',
          tabBarIcon: tabIcon('sparkles', 'sparkles-outline'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarLabel: '我的',
          tabBarIcon: tabIcon('person', 'person-outline'),
        }}
      />
    </Tabs>
  );
}
