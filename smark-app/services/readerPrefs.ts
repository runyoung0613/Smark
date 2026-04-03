import AsyncStorage from '@react-native-async-storage/async-storage';

const READER_PREFS_KEY = 'reader_prefs';

export type ReaderTheme = 'light' | 'dark';

export type ReaderPrefs = {
  fontSize: number;
  theme: ReaderTheme;
  /** Unitless line-height multiplier */
  lineHeight: number;
};

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  fontSize: 17,
  theme: 'light',
  lineHeight: 1.7,
};

export const FONT_SIZE_MIN = 14;
export const FONT_SIZE_MAX = 22;

export function scrollStorageKey(articleId: string) {
  return `reader_scroll:${articleId}`;
}

export async function loadReaderPrefs(): Promise<ReaderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(READER_PREFS_KEY);
    if (!raw) return { ...DEFAULT_READER_PREFS };
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>;
    return {
      fontSize:
        typeof parsed.fontSize === 'number' && parsed.fontSize >= FONT_SIZE_MIN && parsed.fontSize <= FONT_SIZE_MAX
          ? parsed.fontSize
          : DEFAULT_READER_PREFS.fontSize,
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      lineHeight:
        typeof parsed.lineHeight === 'number' && parsed.lineHeight >= 1.5 && parsed.lineHeight <= 2
          ? parsed.lineHeight
          : DEFAULT_READER_PREFS.lineHeight,
    };
  } catch {
    return { ...DEFAULT_READER_PREFS };
  }
}

export async function saveReaderPrefs(prefs: ReaderPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(READER_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export async function loadScrollY(articleId: string): Promise<number> {
  if (!articleId) return 0;
  try {
    const raw = await AsyncStorage.getItem(scrollStorageKey(articleId));
    if (raw == null) return 0;
    const y = Number(raw);
    return Number.isFinite(y) && y >= 0 ? y : 0;
  } catch {
    return 0;
  }
}

export async function saveScrollY(articleId: string, y: number): Promise<void> {
  if (!articleId) return;
  try {
    const n = Math.max(0, Math.round(y));
    await AsyncStorage.setItem(scrollStorageKey(articleId), String(n));
  } catch {
    // ignore
  }
}
