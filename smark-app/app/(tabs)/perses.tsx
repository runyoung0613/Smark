import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { HeaderOverflowButton, TabScreenHeader } from '../../components/TabScreenChrome';
import { createQuickCard } from '../../services/db';
import { loadPersistedConnectionSettings, getExpoPersesHttpUrl } from '../../services/appSettings';
import {
  assemblePersesPromptFromPayload,
  buildPersesRequestPayload,
  getDashScopeCompatibleModel,
  getDeepSeekCompatibleModel,
  isDashScopeOpenAICompatibleUrl,
  isDeepSeekOpenAICompatibleUrl,
  resolveDashScopeChatCompletionsUrl,
  resolveDeepSeekChatCompletionsUrl,
} from '../../services/persesMemory';
import { getSupabase, hasSupabaseConfig } from '../../services/supabase';

const MODAL_INPUT_MIN_H = 100;
const MODAL_INPUT_MAX_H = 240;

type ChatMsg = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string };

function msgNowIso() {
  return new Date().toISOString();
}

function formatAssistantCardTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

export default function PersesScreen() {
  const router = useRouter();
  const { height: winH } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [persesDashScopeModel, setPersesDashScopeModel] = useState('');
  const [persesDeepSeekModel, setPersesDeepSeekModel] = useState('');
  const [persesApiKey, setPersesApiKey] = useState('');
  /** 旧版本保存在「Perses API URL」中的直连完整地址，兼容读取 */
  const [legacyPersesUrl, setLegacyPersesUrl] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [dockHeight, setDockHeight] = useState(0);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 'hello',
      role: 'assistant',
      text: '我是Perses，你可以向我提问，我会给出回复，你可以编辑我的回复，一键加入Quick Card。',
      createdAt: msgNowIso(),
    },
  ]);

  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [modalInputH, setModalInputH] = useState(MODAL_INPUT_MIN_H);

  const canSend = useMemo(() => draft.trim().length > 0 && !sending, [draft, sending]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const ensureKeyboard = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(scrollToBottom, 50);
      setTimeout(scrollToBottom, 220);
    });
  }, [scrollToBottom]);

  const openEditForMessage = useCallback((_msgId: string, text: string) => {
    setEditText(text);
    setModalInputH(MODAL_INPUT_MIN_H);
    setEditOpen(true);
  }, []);

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    setEditText('');
    setModalInputH(MODAL_INPUT_MIN_H);
  }, []);

  const onModalInputContentSizeChange = useCallback((h: number) => {
    const next = Math.min(MODAL_INPUT_MAX_H, Math.max(MODAL_INPUT_MIN_H, Math.ceil(h)));
    setModalInputH(next);
  }, []);

  const saveQuickCard = useCallback(async () => {
    const t = editText.trim();
    if (!t) {
      Alert.alert('提示', '请输入内容');
      return;
    }
    setEditSaving(true);
    try {
      await createQuickCard({ front: t });
      closeEdit();
      Alert.alert('已加入', '已添加到 Quick Card 展示池。');
    } catch {
      Alert.alert('保存失败', '请稍后重试');
    } finally {
      setEditSaving(false);
    }
  }, [editText, closeEdit]);

  const callPerses = useCallback(
    async (prompt: string) => {
      const key = persesApiKey.trim();
      const stored = legacyPersesUrl.trim();
      const storedHttp = stored.toLowerCase().startsWith('http') ? stored : '';
      const envUrl = getExpoPersesHttpUrl().trim();
      /** 本机填入的地址优先于构建变量，便于不改包即可联通 */
      const endpointForBearer = storedHttp || envUrl;

      const useKeyDirect = key.length > 0 && endpointForBearer.length > 0;
      const useLegacyNoAuth = key.length === 0 && storedHttp.length > 0;

      if (key.length > 0 && !endpointForBearer) {
        return (
          '（已填写 Perses Key，但缺少接入地址。请到「个人中心」填写「Perses 接入地址」（https://…），或在构建中配置 EXPO_PUBLIC_PERSES_HTTP_URL。）'
        );
      }

      if (!useKeyDirect && !useLegacyNoAuth) {
        if (!hasSupabaseConfig()) {
          return (
            '（未配置 Perses）\n' +
            '你可以：\n' +
            '1) 在「个人中心」填写 Perses Key 与接入地址；或\n' +
            '2) 由开发者在构建中配置 Supabase，登录后使用云端 perses_proxy。'
          );
        }
        const supabase = getSupabase();
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          return (
            '（未登录）\n' +
            '请先在「个人中心」用邮箱验证码登录后再使用云端 Perses；\n' +
            '或填写 Perses Key 与接入地址使用直连。'
          );
        }
        const payload = await buildPersesRequestPayload(prompt);
        const { data, error } = await supabase.functions.invoke('perses_proxy', { body: payload });
        if (error) return `（Perses 代理失败：${error.message ?? String(error)}）`;
        const text = (data as any)?.text ?? '';
        if (typeof text !== 'string' || !text.trim()) return '（Perses 代理返回为空）';
        return text.trim();
      }

      const urlForFetch = useKeyDirect ? endpointForBearer : storedHttp;
      const dashScope = isDashScopeOpenAICompatibleUrl(urlForFetch);
      const deepSeek = isDeepSeekOpenAICompatibleUrl(urlForFetch);
      const requestUrl = dashScope
        ? resolveDashScopeChatCompletionsUrl(urlForFetch)
        : deepSeek
          ? resolveDeepSeekChatCompletionsUrl(urlForFetch)
          : urlForFetch;
      const openAiCompat = dashScope || deepSeek;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const payload = await buildPersesRequestPayload(prompt);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (useKeyDirect) {
          headers.Authorization = `Bearer ${key}`;
        }
        const bodyJson = openAiCompat
          ? JSON.stringify({
              model: dashScope
                ? getDashScopeCompatibleModel(persesDashScopeModel)
                : getDeepSeekCompatibleModel(persesDeepSeekModel),
              messages: [{ role: 'user' as const, content: assemblePersesPromptFromPayload(payload) }],
            })
          : JSON.stringify(payload);
        const res = await fetch(requestUrl, {
          method: 'POST',
          headers,
          body: bodyJson,
          signal: controller.signal,
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          const hint = errBody.replace(/\s+/g, ' ').trim().slice(0, 200);
          const pathOnly = requestUrl.replace(/^https?:\/\/[^/?#]+/i, '') || '/';
          let line = `（HTTP ${res.status}${hint ? `：${hint}` : ''}`;
          if (res.status === 404) {
            line += `｜POST 路径：${pathOnly.slice(0, 140)}`;
            line += dashScope
              ? '｜百炼：请确认 Base 为 …/compatible-mode/v1（保存后会自动补 …/chat/completions）'
              : deepSeek
                ? '｜DeepSeek：Base 为 https://api.deepseek.com，将自动 POST …/chat/completions（见官方文档）'
                : '｜直连：请填文档里的「完整 POST 地址」，仅域名或根路径常会 404；请求体为 prompt/soulMd 等 JSON';
          }
          line += '）';
          return line;
        }
        const data: any = await res.json().catch(() => null);
        const text = openAiCompat
          ? (typeof data?.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content : '')
          : (data?.text ?? data?.answer ?? data?.message ?? '');
        if (typeof text !== 'string' || !text.trim())
          return dashScope
            ? '（百炼返回为空：请检查模型名 EXPO_PUBLIC_PERSES_DASHSCOPE_MODEL 与账号权限）'
            : deepSeek
              ? '（DeepSeek 返回为空：请检查模型名 EXPO_PUBLIC_PERSES_DEEPSEEK_MODEL 与 API Key）'
              : '（Perses 返回为空：请检查接口返回字段 text/answer/message）';
        return text.trim();
      } catch (e: any) {
        if (e?.name === 'AbortError') return '（Perses 请求超时/已取消）';
        const detail = typeof e?.message === 'string' && e.message.trim() ? e.message.trim().slice(0, 220) : '';
        return `（网络层失败${detail ? `：${detail}` : ''}。若刚换 API：确认个人中心已保存新地址；仅改 .env 需重启 npx expo start -c；本机曾保存的接入地址会覆盖 .env）`;
      } finally {
        clearTimeout(timeout);
      }
    },
    [persesApiKey, legacyPersesUrl, persesDashScopeModel, persesDeepSeekModel]
  );

  const onSend = useCallback(async () => {
    const q = draft.trim();
    if (!q || sending) return;
    setDraft('');
    setSending(true);

    const userMsg: ChatMsg = { id: String(Date.now()) + '-u', role: 'user', text: q, createdAt: msgNowIso() };
    setMessages((prev) => [...prev, userMsg]);
    scrollToBottom();

    const answer = await callPerses(q);
    const aiMsg: ChatMsg = { id: String(Date.now()) + '-a', role: 'assistant', text: answer, createdAt: msgNowIso() };
    setMessages((prev) => [...prev, aiMsg]);
    setSending(false);
    scrollToBottom();
  }, [draft, sending, callPerses, scrollToBottom]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const c = await loadPersistedConnectionSettings();
          if (!cancelled) {
            setPersesApiKey(c.persesApiKey);
            setLegacyPersesUrl(c.persesApiUrl);
            setPersesDashScopeModel(c.persesDashScopeModel ?? '');
            setPersesDeepSeekModel(c.persesDeepSeekModel ?? '');
          }
        } catch {
          // ignore
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates?.height ?? 0);
        ensureKeyboard();
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
      abortRef.current?.abort();
    };
  }, [ensureKeyboard]);

  const dockBottom = keyboardHeight > 0 ? keyboardHeight : 0;

  return (
    <View style={styles.root}>
      <TabScreenHeader
        title="Perses"
        right={<HeaderOverflowButton label="记忆与人设" onPress={() => router.push('/perses-memory')} />}
      />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 12 + dockHeight + keyboardHeight },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
      >
        <View style={styles.thread}>
          {messages.map((m) =>
            m.role === 'user' ? (
              <View key={m.id} style={[styles.msgRow, styles.msgRowUser]}>
                <View style={[styles.bubble, styles.bubbleUser]}>
                  <Text style={styles.bubbleTextUser}>{m.text}</Text>
                </View>
              </View>
            ) : (
              <View key={m.id} style={[styles.msgRow, styles.msgRowAssistant]}>
                <View style={styles.assistantBubbleWrap}>
                  <View style={[styles.bubble, styles.bubbleAi]}>
                    <Text style={styles.bubbleTextAi}>{m.text}</Text>
                    <View style={styles.bubbleAiFooter}>
                      <Text style={styles.bubbleAiTime}>{formatAssistantCardTime(m.createdAt)}</Text>
                      <Pressable
                        onPress={() => openEditForMessage(m.id, m.text)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="编辑后加入 Quick Card"
                      >
                        <Text style={styles.linkEdit}>编辑</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            )
          )}

          {sending ? (
            <View style={[styles.msgRow, styles.msgRowAssistant]}>
              <View style={styles.assistantBubbleWrap}>
                <View style={[styles.bubble, styles.bubbleAi, styles.bubbleAiThinking]}>
                  <View style={styles.thinkingRow}>
                    <ActivityIndicator size="small" color="#64748b" />
                    <Text style={styles.thinkingText}>思考中…</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View
        style={[
          styles.dock,
          {
            bottom: dockBottom,
          },
        ]}
        onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.dockComposer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="向Perses提问"
            placeholderTextColor="#9ca3af"
            multiline
            autoCorrect={false}
            style={styles.dockInput}
            onFocus={ensureKeyboard}
          />
          <Pressable
            onPress={onSend}
            disabled={!canSend}
            style={[styles.sendFab, !canSend && styles.sendFabDisabled]}
            accessibilityRole="button"
            accessibilityLabel="发送"
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEdit} statusBarTranslucent>
        <View
          style={[
            styles.modalOverlay,
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight : 0 },
          ]}
        >
          <Pressable style={styles.modalMaskFill} onPress={closeEdit} accessibilityLabel="关闭" />
          <View style={[styles.modalCard, { maxHeight: Math.min(winH * 0.88, winH - keyboardHeight - 48) }]}>
            <Text style={styles.modalTitle}>编辑后加入 Quick Card</Text>
            <Text style={styles.modalSub}>你可以把这段内容改成「一句话卡片」，然后一键入库。</Text>
            <TextInput
              key={editOpen ? 'edit-field' : 'idle'}
              value={editText}
              onChangeText={setEditText}
              placeholder="将要保存到 Quick Card 的内容"
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
              scrollEnabled={modalInputH >= MODAL_INPUT_MAX_H - 1}
              style={[styles.modalInput, { height: modalInputH }]}
              onContentSizeChange={(e) => onModalInputContentSizeChange(e.nativeEvent.contentSize.height)}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable onPress={closeEdit} disabled={editSaving} style={[styles.modalBtn, styles.modalBtnGhost]}>
                <Text style={styles.modalBtnGhostText}>取消</Text>
              </Pressable>
              <Pressable
                onPress={saveQuickCard}
                disabled={editSaving}
                style={[styles.modalBtn, styles.modalBtnPrimary, editSaving && styles.sendFabDisabled]}
              >
                <Text style={styles.modalBtnText}>{editSaving ? '保存中…' : '加入 Quick Card'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f3f5' },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    flexGrow: 1,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: '#f1f3f5',
  },
  thread: {
    gap: 18,
    paddingTop: 6,
    paddingBottom: 12,
  },
  msgRow: { width: '100%', flexDirection: 'row' },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAssistant: { justifyContent: 'flex-start' },
  assistantBubbleWrap: {
    maxWidth: '88%',
    alignSelf: 'flex-start',
  },
  bubble: {
    maxWidth: '100%',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  bubbleUser: {
    maxWidth: '82%',
    backgroundColor: '#111827',
    borderRadius: 20,
    borderBottomRightRadius: 5,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  /** 左侧助手：对话气泡形（左下小圆角作「尾巴」，其余为大圆角） */
  bubbleAi: {
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 5,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  bubbleAiThinking: {
    paddingVertical: 14,
  },
  bubbleTextUser: {
    fontSize: 15,
    lineHeight: 23,
    color: '#fafafa',
    letterSpacing: 0.15,
  },
  bubbleTextAi: {
    fontSize: 15,
    lineHeight: 23,
    color: '#1e293b',
    letterSpacing: 0.1,
  },
  bubbleAiFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
  },
  bubbleAiTime: { fontSize: 11, color: '#94a3b8', flex: 1, marginRight: 10 },
  /** 与文章列表「编辑」一致 */
  linkEdit: { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thinkingText: { fontSize: 14, lineHeight: 20, color: '#64748b', letterSpacing: 0.2 },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  dockComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
    gap: 8,
    minHeight: 46,
  },
  dockInput: {
    flex: 1,
    maxHeight: 120,
    paddingVertical: 8,
    paddingRight: 4,
    fontSize: 15,
    lineHeight: 20,
    color: '#111827',
  },
  sendFab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
  },
  sendFabDisabled: { opacity: 0.38 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalMaskFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    alignSelf: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 10 },
    }),
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827', letterSpacing: -0.2 },
  modalSub: { marginTop: 8, fontSize: 13, lineHeight: 18, color: '#6b7280' },
  /** 设计稿：浅蓝描边正文区，高度由 onContentSizeChange 在区间内伸缩 */
  modalInput: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: '#93c5fd',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
    backgroundColor: '#fff',
  },
  modalActions: { marginTop: 16, flexDirection: 'row', gap: 12 },
  modalBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPrimary: { backgroundColor: '#111827' },
  modalBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalBtnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db' },
  modalBtnGhostText: { color: '#111827', fontWeight: '800', fontSize: 15 },
});
