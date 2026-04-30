import AsyncStorage from '@react-native-async-storage/async-storage';

/** 与历史版本 Perses 页共用，勿改键名 */
export const STORAGE_KEY_PERSES_API_URL = 'smark_perses_api_url';
const STORAGE_KEY_SUPABASE_URL = 'smark_settings_supabase_url';
const STORAGE_KEY_SUPABASE_ANON = 'smark_settings_supabase_anon_key';

export type PersistedConnectionSettings = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  persesApiUrl: string;
};

export async function loadPersistedConnectionSettings(): Promise<PersistedConnectionSettings> {
  const [url, anon, perses] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY_SUPABASE_URL),
    AsyncStorage.getItem(STORAGE_KEY_SUPABASE_ANON),
    AsyncStorage.getItem(STORAGE_KEY_PERSES_API_URL),
  ]);
  return {
    supabaseUrl: (url ?? '').trim(),
    supabaseAnonKey: (anon ?? '').trim(),
    persesApiUrl: (perses ?? '').trim(),
  };
}

export async function savePersistedConnectionSettings(p: PersistedConnectionSettings): Promise<void> {
  const w = [
    p.supabaseUrl
      ? AsyncStorage.setItem(STORAGE_KEY_SUPABASE_URL, p.supabaseUrl.trim())
      : AsyncStorage.removeItem(STORAGE_KEY_SUPABASE_URL),
    p.supabaseAnonKey
      ? AsyncStorage.setItem(STORAGE_KEY_SUPABASE_ANON, p.supabaseAnonKey.trim())
      : AsyncStorage.removeItem(STORAGE_KEY_SUPABASE_ANON),
    AsyncStorage.setItem(STORAGE_KEY_PERSES_API_URL, p.persesApiUrl.trim()),
  ];
  await Promise.all(w);
}
