import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadPersistedConnectionSettings } from './appSettings';

const envSupabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const envSupabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/** 本机「我的」中保存的覆盖项（启动时由 hydrateSupabaseFromStorage 填入） */
let storedSupabaseUrl = '';
let storedSupabaseAnonKey = '';

/** 形如 https://<project-ref>.supabase.co（非 Dashboard / Functions 链接） */
export function isSupabaseProjectUrl(url: string) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url.trim());
}

function effectiveSupabaseUrl() {
  return storedSupabaseUrl || envSupabaseUrl;
}

function effectiveSupabaseAnonKey() {
  return storedSupabaseAnonKey || envSupabaseAnonKey;
}

let client: SupabaseClient | null = null;

/** 从 AsyncStorage 读取覆盖配置并清空客户端缓存（应在启动与「我的」保存后调用） */
export async function hydrateSupabaseFromStorage(): Promise<void> {
  const s = await loadPersistedConnectionSettings();
  storedSupabaseUrl = s.supabaseUrl;
  storedSupabaseAnonKey = s.supabaseAnonKey;
  client = null;
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const supabaseUrl = effectiveSupabaseUrl();
  const supabaseAnonKey = effectiveSupabaseAnonKey();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase config: 请在「我的」或 .env 中配置 URL 与 anon key');
  }
  if (!isSupabaseProjectUrl(supabaseUrl)) {
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
  const u = effectiveSupabaseUrl();
  const k = effectiveSupabaseAnonKey();
  return Boolean(u && k && isSupabaseProjectUrl(u));
}

function parseAuthCallbackParams(url: string): { accessToken?: string; refreshToken?: string; code?: string } {
  try {
    // Supabase magic link often redirects with tokens in URL fragment:
    // smark://profile#access_token=...&refresh_token=...
    // Some setups use code param (PKCE):
    // smark://profile?code=...
    const u = new URL(url);
    const out: { accessToken?: string; refreshToken?: string; code?: string } = {};

    const code = u.searchParams.get('code');
    if (code) out.code = code;

    const hash = (u.hash || '').startsWith('#') ? u.hash.slice(1) : '';
    if (hash) {
      const hp = new URLSearchParams(hash);
      const at = hp.get('access_token') || undefined;
      const rt = hp.get('refresh_token') || undefined;
      if (at) out.accessToken = at;
      if (rt) out.refreshToken = rt;
      const codeInHash = hp.get('code') || undefined;
      if (codeInHash && !out.code) out.code = codeInHash;
    }

    return out;
  } catch {
    return {};
  }
}

export async function tryHandleSupabaseAuthCallback(url: string): Promise<boolean> {
  if (!hasSupabaseConfig()) return false;
  const supabase = getSupabase();
  const p = parseAuthCallbackParams(url);

  try {
    if (p.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(p.code);
      return !error;
    }
    if (p.accessToken && p.refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: p.accessToken,
        refresh_token: p.refreshToken,
      });
      return !error;
    }
  } catch {
    // ignore
  }
  return false;
}

