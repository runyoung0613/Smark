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

export type PersesRequestPayload = Awaited<ReturnType<typeof buildPersesRequestPayload>>;

/** 与 Edge `perses_proxy` 一致：把人设与本轮问题拼成一条用户侧长文本（用于 OpenAI 兼容 messages） */
export function assemblePersesPromptFromPayload(payload: PersesRequestPayload): string {
  const sections: string[] = [];
  if (payload.runtimeSystemZh?.trim()) sections.push(`[运行时规则]\n${payload.runtimeSystemZh.trim()}`);
  if (payload.soulMd?.trim()) sections.push(`[SOUL.md]\n${payload.soulMd.trim()}`);
  if (payload.userMd?.trim()) sections.push(`[USER.md]\n${payload.userMd.trim()}`);
  if (payload.memoryMd?.trim()) sections.push(`[MEMORY.md]\n${payload.memoryMd.trim()}`);
  sections.push(`[用户本轮]\n${payload.prompt.trim()}`);
  return sections.join('\n\n---\n\n');
}

/** 阿里云百炼 OpenAI 兼容 Base（如 …/compatible-mode/v1） */
export function isDashScopeOpenAICompatibleUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes('dashscope') && u.includes('aliyuncs.com') && u.includes('compatible-mode');
}

/**
 * 百炼文档里的 Base URL 通常不含具体路由；兼容模式对话须 POST …/v1/chat/completions。
 * 若用户只填到 `/v1`，自动补全，避免根路径 404。
 */
export function resolveDashScopeChatCompletionsUrl(url: string): string {
  const t = url.trim().replace(/\/+$/, '');
  if (!isDashScopeOpenAICompatibleUrl(t)) return url.trim();
  if (/\/chat\/completions$/i.test(t)) return t;
  if (/\/v1$/i.test(t)) return `${t}/chat/completions`;
  if (/compatible-mode$/i.test(t)) return `${t}/v1/chat/completions`;
  return `${t}/chat/completions`;
}

/** 百炼兼容模式常见模型，供「个人中心」弹窗选择 */
export const DASHSCOPE_CHAT_MODEL_PRESETS: ReadonlyArray<{ id: string; title: string; subtitle: string }> = [
  { id: 'qwen-turbo', title: 'qwen-turbo', subtitle: '速度快、成本低' },
  { id: 'qwen-plus', title: 'qwen-plus', subtitle: '综合能力强' },
  { id: 'qwen-max', title: 'qwen-max', subtitle: '旗舰' },
  { id: 'qwen-long', title: 'qwen-long', subtitle: '长文本' },
  { id: 'qwen-flash', title: 'qwen-flash', subtitle: '轻量快速' },
];

/**
 * 解析最终请求的 `model`：本机保存的模型名优先，否则构建变量，否则 qwen-turbo。
 */
export function getDashScopeCompatibleModel(persisted?: string | null): string {
  const p = (persisted ?? '').trim();
  if (p) return p;
  const env = (process.env.EXPO_PUBLIC_PERSES_DASHSCOPE_MODEL ?? '').trim();
  if (env) return env;
  return 'qwen-turbo';
}

/** DeepSeek OpenAI 兼容 Base（见 https://api-docs.deepseek.com/zh-cn/ ）；不含 Anthropic 路径 */
export function isDeepSeekOpenAICompatibleUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  try {
    const parsed = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    if (parsed.hostname.toLowerCase() !== 'api.deepseek.com') return false;
    return !parsed.pathname.toLowerCase().startsWith('/anthropic');
  } catch {
    return /api\.deepseek\.com/i.test(u);
  }
}

/**
 * 官方对话端点为 POST https://api.deepseek.com/chat/completions（与 OpenAI 的 /v1/ 前缀不同）。
 * 若只填 Base（https://api.deepseek.com 或 …/v1），自动补全，避免根路径 404。
 */
export function resolveDeepSeekChatCompletionsUrl(url: string): string {
  const t = url.trim().replace(/\/+$/, '');
  if (!isDeepSeekOpenAICompatibleUrl(t)) return url.trim();
  if (/\/chat\/completions$/i.test(t)) return t;
  if (/\/v1$/i.test(t)) return `${t}/chat/completions`;
  return `${t}/chat/completions`;
}

export const DEEPSEEK_CHAT_MODEL_PRESETS: ReadonlyArray<{ id: string; title: string; subtitle: string }> = [
  { id: 'deepseek-chat', title: 'deepseek-chat', subtitle: '经典对话（文档注明将弃用名，仍映射 v4-flash）' },
  { id: 'deepseek-v4-flash', title: 'deepseek-v4-flash', subtitle: 'v4 轻量' },
  { id: 'deepseek-v4-pro', title: 'deepseek-v4-pro', subtitle: 'v4 能力更强' },
  { id: 'deepseek-reasoner', title: 'deepseek-reasoner', subtitle: '推理向（文档注明将弃用名）' },
];

export function getDeepSeekCompatibleModel(persisted?: string | null): string {
  const p = (persisted ?? '').trim();
  if (p) return p;
  const env = (process.env.EXPO_PUBLIC_PERSES_DEEPSEEK_MODEL ?? '').trim();
  if (env) return env;
  return 'deepseek-chat';
}
