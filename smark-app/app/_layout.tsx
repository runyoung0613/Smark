import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDb } from '../services/db';

export default function RootLayout() {
  useEffect(() => {
    void initDb();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="import" options={{ title: '导入' }} />
        <Stack.Screen name="read/[id]" options={{ title: '阅读' }} />
        <Stack.Screen name="edit/[id]" options={{ title: '矫正正文' }} />
        <Stack.Screen name="highlights/[id]" options={{ title: '划线' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
