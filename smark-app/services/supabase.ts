import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function looksLikeSupabaseProjectUrl(url: string) {
  // Expected: https://<project-ref>.supabase.co
  // Avoid common mistake: pasting dashboard URL or functions URL.
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url);
}

if (!supabaseUrl || !supabaseAnonKey) {
  // 运行时再提示（避免打包期直接崩溃），Profile 页也会做 UI 提示
  // eslint-disable-next-line no-console
  console.warn('[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY');
} else if (!looksLikeSupabaseProjectUrl(supabaseUrl)) {
  // eslint-disable-next-line no-console
  console.warn(
    `[supabase] EXPO_PUBLIC_SUPABASE_URL looks invalid: "${supabaseUrl}". Expected "https://<project-ref>.supabase.co"`
  );
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase config: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }
  if (!looksLikeSupabaseProjectUrl(supabaseUrl)) {
    throw new Error(
      'Supabase URL 格式不正确：应为 https://<project-ref>.supabase.co（不要填 Dashboard/Functions 链接）'
    );
  }
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

