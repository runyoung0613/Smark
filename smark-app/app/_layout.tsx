import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
          <ActivityIndicator size="large" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="import" options={{ title: '导入' }} />
        <Stack.Screen name="read/[id]" options={{ title: '阅读' }} />
        <Stack.Screen name="edit/[id]" options={{ title: '矫正正文' }} />
        <Stack.Screen name="highlights/[id]" options={{ title: '划线' }} />
        <Stack.Screen name="perses-memory" options={{ title: '记忆与人设' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
