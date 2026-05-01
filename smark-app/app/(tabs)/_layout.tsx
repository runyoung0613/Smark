import { Feather, Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';

type IonName = ComponentProps<typeof Ionicons>['name'];
type FeatherName = ComponentProps<typeof Feather>['name'];

/** 未选中用 Feather 细线描边，选中仍用 Ionicons 实心，避免 Ionicons outline 笔画偏粗。 */
function tabIcon(feather: FeatherName, ionSolid: IonName) {
  return ({ color, focused, size }: { color: string; focused: boolean; size: number }) => {
    const s = Math.round(size);
    return focused ? (
      <Ionicons name={ionSolid} size={s} color={color} />
    ) : (
      <Feather name={feather} size={s} color={color} />
    );
  };
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
          tabBarIcon: tabIcon('home', 'home'),
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: '复习',
          tabBarLabel: '复习',
          tabBarIcon: tabIcon('book-open', 'book'),
        }}
      />
      <Tabs.Screen
        name="perses"
        options={{
          title: 'Perses',
          tabBarLabel: 'Perses',
          tabBarIcon: tabIcon('star', 'sparkles'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarLabel: '我的',
          tabBarIcon: tabIcon('user', 'person'),
        }}
      />
    </Tabs>
  );
}
