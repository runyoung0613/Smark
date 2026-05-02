import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { ActivityIndicator, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDb } from '../services/db';
import { hydrateSupabaseFromStorage, tryHandleSupabaseAuthCallback } from '../services/supabase';

export default function RootLayout() {
  const [bootReady, setBootReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        await initDb();
        await hydrateSupabaseFromStorage();
      } finally {
        if (mounted) setBootReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!bootReady) return;
    let mounted = true;

    async function handle(url: string) {
      if (!url) return;
      await tryHandleSupabaseAuthCallback(url);
    }

    void (async () => {
      const initial = await Linking.getInitialURL();
      if (!mounted) return;
      if (initial) await handle(initial);
    })();

    const sub = Linking.addEventListener('url', (evt) => {
      void handle(evt.url);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [bootReady]);

  if (!bootReady) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
            <ActivityIndicator size="large" />
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={Platform.OS === 'android' ? { statusBarStyle: 'dark' } : {}}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="import" options={{ headerShown: false }} />
        <Stack.Screen name="read/[id]" options={{ title: '阅读' }} />
        <Stack.Screen name="edit/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="highlights/[id]" options={{ title: '划线' }} />
        <Stack.Screen name="quick-cards" options={{ headerShown: false }} />
        <Stack.Screen name="review-search" options={{ headerShown: false }} />
        <Stack.Screen name="perses-memory" options={{ title: '记忆与人设' }} />
      </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
