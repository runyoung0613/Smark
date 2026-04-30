import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_MEMORY_MD, DEFAULT_SOUL_MD, DEFAULT_USER_MD, PERSES_RUNTIME_SYSTEM_ZH } from './persesBundled';

const KEY_SOUL = 'smark_perses_soul_md';
const KEY_USER = 'smark_perses_user_md';
const KEY_MEMORY = 'smark_perses_memory_md';

export type PersesMemoryFiles = {
  soulMd: string;
  userMd: string;
  memoryMd: string;
  runtimeSystemZh: string;
};

export async function loadPersesMemoryFiles(): Promise<PersesMemoryFiles> {
  const [soul, user, memory] = await Promise.all([
    AsyncStorage.getItem(KEY_SOUL),
    AsyncStorage.getItem(KEY_USER),
    AsyncStorage.getItem(KEY_MEMORY),
  ]);
  return {
    soulMd: soul ?? DEFAULT_SOUL_MD,
    userMd: user ?? DEFAULT_USER_MD,
    memoryMd: memory ?? DEFAULT_MEMORY_MD,
    runtimeSystemZh: PERSES_RUNTIME_SYSTEM_ZH,
  };
}

export async function savePersesSoulMd(content: string) {
  await AsyncStorage.setItem(KEY_SOUL, content);
}

export async function savePersesUserMd(content: string) {
  await AsyncStorage.setItem(KEY_USER, content);
}

export async function savePersesMemoryMd(content: string) {
  await AsyncStorage.setItem(KEY_MEMORY, content);
}

export async function saveAllPersesMemoryFiles(files: { soulMd: string; userMd: string; memoryMd: string }) {
  await AsyncStorage.multiSet([
    [KEY_SOUL, files.soulMd],
    [KEY_USER, files.userMd],
    [KEY_MEMORY, files.memoryMd],
  ]);
}

/** 清除本地覆盖，下次读取时使用内置默认（来自 persesBundled） */
export async function resetPersesMemoryToBundledDefaults() {
  await AsyncStorage.multiRemove([KEY_SOUL, KEY_USER, KEY_MEMORY]);
}

/** 与 perses_proxy / 直连 API 共用的请求体字段 */
export async function buildPersesRequestPayload(userPrompt: string) {
  const f = await loadPersesMemoryFiles();
  return {
    prompt: userPrompt,
    soulMd: f.soulMd,
    userMd: f.userMd,
    memoryMd: f.memoryMd,
    runtimeSystemZh: f.runtimeSystemZh,
  };
}
