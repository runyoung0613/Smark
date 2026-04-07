import AsyncStorage from '@react-native-async-storage/async-storage';

export type FontSizePreset = 'sm' | 'md' | 'lg';
export type ReaderTheme = 'light' | 'eye' | 'dark';

export type ReaderPrefs = {
  fontSizePreset: FontSizePreset;
  readerTheme: ReaderTheme;
};

const PREFS_KEY = 'smark_reader_prefs';

const DEFAULT_PREFS: ReaderPrefs = {
  fontSizePreset: 'md',
  readerTheme: 'light',
};

export async function loadReaderPrefs(): Promise<ReaderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>;
    return {
      fontSizePreset: parsed.fontSizePreset ?? DEFAULT_PREFS.fontSizePreset,
      readerTheme: parsed.readerTheme ?? DEFAULT_PREFS.readerTheme,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function saveReaderPrefs(prefs: ReaderPrefs): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function scrollStorageKey(articleId: string) {
  return `smark_read_scroll_${articleId}`;
}

export async function saveScrollPosition(articleId: string, y: number): Promise<void> {
  await AsyncStorage.setItem(
    scrollStorageKey(articleId),
    JSON.stringify({ y: Math.max(0, y), updatedAt: Date.now() })
  );
}

export async function loadScrollPosition(articleId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(scrollStorageKey(articleId));
    if (!raw) return 0;
    const o = JSON.parse(raw) as { y?: number };
    return typeof o.y === 'number' && o.y >= 0 ? o.y : 0;
  } catch {
    return 0;
  }
}
