import AsyncStorage from '@react-native-async-storage/async-storage';

/** 与历史版本 Perses 页共用，勿改键名（旧版：用户粘贴的直连 POST 完整 URL） */
export const STORAGE_KEY_PERSES_API_URL = 'smark_perses_api_url';
const STORAGE_KEY_PERSES_API_KEY = 'smark_perses_api_key';
const STORAGE_KEY_PERSES_DASHSCOPE_MODEL = 'smark_perses_dashscope_model';
const STORAGE_KEY_SUPABASE_URL = 'smark_settings_supabase_url';
const STORAGE_KEY_SUPABASE_ANON = 'smark_settings_supabase_anon_key';

export type PersistedConnectionSettings = {
  /** 开发者工具或旧版「我的」写入；正式发布包通常仅用 env */
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** 旧版直连：完整 HTTP POST 地址 */
  persesApiUrl: string;
  /** 用户在本机填入的 Perses Key（与 EXPO_PUBLIC_PERSES_HTTP_URL 配对） */
  persesApiKey: string;
  /** 百炼 OpenAI 兼容模式下的 `model` 字段；空则走 EXPO_PUBLIC_PERSES_DASHSCOPE_MODEL / qwen-turbo */
  persesDashScopeModel: string;
};

/** 构建时内置的 Perses 网关地址；与用户填入的 Key 组成 Bearer 直连 */
export function getExpoPersesHttpUrl(): string {
  return (process.env.EXPO_PUBLIC_PERSES_HTTP_URL ?? '').trim();
}

export async function loadPersistedConnectionSettings(): Promise<PersistedConnectionSettings> {
  const [url, anon, persesUrl, persesKey, persesModel] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY_SUPABASE_URL),
    AsyncStorage.getItem(STORAGE_KEY_SUPABASE_ANON),
    AsyncStorage.getItem(STORAGE_KEY_PERSES_API_URL),
    AsyncStorage.getItem(STORAGE_KEY_PERSES_API_KEY),
    AsyncStorage.getItem(STORAGE_KEY_PERSES_DASHSCOPE_MODEL),
  ]);
  return {
    supabaseUrl: (url ?? '').trim(),
    supabaseAnonKey: (anon ?? '').trim(),
    persesApiUrl: (persesUrl ?? '').trim(),
    persesApiKey: (persesKey ?? '').trim(),
    persesDashScopeModel: (persesModel ?? '').trim(),
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
    p.persesApiUrl
      ? AsyncStorage.setItem(STORAGE_KEY_PERSES_API_URL, p.persesApiUrl.trim())
      : AsyncStorage.removeItem(STORAGE_KEY_PERSES_API_URL),
    p.persesApiKey
      ? AsyncStorage.setItem(STORAGE_KEY_PERSES_API_KEY, p.persesApiKey.trim())
      : AsyncStorage.removeItem(STORAGE_KEY_PERSES_API_KEY),
    p.persesDashScopeModel?.trim()
      ? AsyncStorage.setItem(STORAGE_KEY_PERSES_DASHSCOPE_MODEL, p.persesDashScopeModel.trim())
      : AsyncStorage.removeItem(STORAGE_KEY_PERSES_DASHSCOPE_MODEL),
  ];
  await Promise.all(w);
}
