import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { createQuickCard } from '../../services/db';
import { loadPersistedConnectionSettings } from '../../services/appSettings';
import { buildPersesRequestPayload } from '../../services/persesMemory';
import { getSupabase, hasSupabaseConfig } from '../../services/supabase';

export default function PersesScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [apiUrl, setApiUrl] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [dockHeight, setDockHeight] = useState(0);

  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; text: string }>>([
    {
      id: 'hello',
      role: 'assistant',
      text: '我是 Perses。你可以提问，我会给出回复；然后你可以编辑我的回复，一键加入 Quick Card。',
    },
  ]);

  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const canSend = useMemo(() => draft.trim().length > 0 && !sending, [draft, sending]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const ensureKeyboard = useCallback(() => {
    // 仅用于让 ScrollView 在键盘弹出后也能滚到可见区域
    requestAnimationFrame(() => {
      setTimeout(scrollToBottom, 50);
      setTimeout(scrollToBottom, 220);
    });
  }, [scrollToBottom]);

  const openEditForMessage = useCallback((_msgId: string, text: string) => {
    setEditText(text);
    setEditOpen(true);
    ensureKeyboard();
  }, [ensureKeyboard]);

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    setEditText('');
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
      const u = apiUrl.trim();
      // 优先走 Supabase Edge Function（服务端持 key）
      if (!u) {
        if (!hasSupabaseConfig()) {
          return (
            '（未配置 Perses 接口）\n' +
            '你可以：\n' +
            '1) 在「我的」中填写 Perses API URL（直连），然后再提问；或\n' +
            '2) 配置 Supabase 并登录后使用云端 perses_proxy。'
          );
        }
        const supabase = getSupabase();
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          return (
            '（未登录）\n' +
            '请先到「我的」用邮箱 OTP 登录，再回来使用云端 perses_proxy；\n' +
            '或在「我的」填写 Perses API URL 使用直连。'
          );
        }
        const payload = await buildPersesRequestPayload(prompt);
        const { data, error } = await supabase.functions.invoke('perses_proxy', { body: payload });
        if (error) return `（Perses 代理失败：${error.message ?? String(error)}）`;
        const text = (data as any)?.text ?? '';
        if (typeof text !== 'string' || !text.trim()) return '（Perses 代理返回为空）';
        return text.trim();
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const payload = await buildPersesRequestPayload(prompt);
        const res = await fetch(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) return `（Perses 请求失败：HTTP ${res.status}）`;
        const data: any = await res.json().catch(() => null);
        const text = data?.text ?? data?.answer ?? data?.message ?? '';
        if (typeof text !== 'string' || !text.trim()) return '（Perses 返回为空：请检查接口返回字段 text/answer/message）';
        return text.trim();
      } catch (e: any) {
        return e?.name === 'AbortError' ? '（Perses 请求超时/已取消）' : '（Perses 请求失败：请检查网络与接口地址）';
      } finally {
        clearTimeout(timeout);
      }
    },
    [apiUrl]
  );

  const onSend = useCallback(async () => {
    const q = draft.trim();
    if (!q || sending) return;
    setDraft('');
    setSending(true);

    const userMsg = { id: String(Date.now()) + '-u', role: 'user' as const, text: q };
    setMessages((prev) => [...prev, userMsg]);
    scrollToBottom();

    const answer = await callPerses(q);
    const aiMsg = { id: String(Date.now()) + '-a', role: 'assistant' as const, text: answer };
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
          if (!cancelled) setApiUrl(c.persesApiUrl);
        } catch {
          // ignore
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // 键盘高度监听：保证底部输入区永远在键盘之上
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

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 16 + dockHeight + keyboardHeight },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
      >
        <Text style={styles.title}>Perses</Text>
        <Text style={styles.sub}>
          提问→回复→编辑→一键加入 Quick Card。人设与记忆见下方入口（内置 SOUL / USER / MEMORY，可本地编辑并随请求一并发送）。
        </Text>

        <Pressable onPress={() => router.push('/perses-memory')} style={styles.memoryLink}>
          <Text style={styles.memoryLinkText}>记忆与人设（SOUL / USER / MEMORY）</Text>
        </Pressable>

        <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.settingsLink}>
          <Text style={styles.settingsLinkText}>Perses 直连地址与 Supabase：前往「我的」配置</Text>
        </Pressable>

        {apiUrl.trim() ? (
          <Text style={styles.hint}>当前直连：{apiUrl.trim()}</Text>
        ) : (
          <Text style={styles.hint}>未设置直连地址时将尝试登录后的云端代理。</Text>
        )}

        <View style={styles.thread}>
          {messages.map((m) => (
            <View key={m.id} style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAi]}>
              <Text style={[styles.bubbleRole, m.role === 'user' && styles.bubbleRoleUser]}>
                {m.role === 'user' ? '你' : 'Perses'}
              </Text>
              <Text style={[styles.bubbleText, m.role === 'user' && styles.bubbleTextUser]}>{m.text}</Text>
              {m.role === 'assistant' ? (
                <Pressable onPress={() => openEditForMessage(m.id, m.text)} style={styles.smallBtn}>
                  <Text style={styles.smallBtnText}>编辑并加入 Quick Card</Text>
                </Pressable>
              ) : null}
            </View>
          ))}

          {sending ? (
            <View style={[styles.bubble, styles.bubbleAi]}>
              <Text style={styles.bubbleRole}>Perses</Text>
              <View style={styles.row}>
                <ActivityIndicator />
                <Text style={styles.bubbleText}>思考中…</Text>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.dock, { bottom: keyboardHeight }]} onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="向 Perses 提问…"
          multiline
          autoCorrect={false}
          style={styles.dockInput}
          onFocus={ensureKeyboard}
        />
        <Pressable onPress={onSend} disabled={!canSend} style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}>
          <Text style={styles.sendBtnText}>{sending ? '发送中…' : '发送'}</Text>
        </Pressable>
      </View>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEdit}>
        <Pressable style={styles.modalMask} onPress={closeEdit} />
        <View style={[styles.modalCard, { bottom: keyboardHeight }]}>
          <Text style={styles.modalTitle}>编辑后加入 Quick Card</Text>
          <Text style={styles.modalSub}>你可以把这段内容改成“一句话卡片”，然后一键入库。</Text>
          <TextInput
            value={editText}
            onChangeText={setEditText}
            placeholder="将要保存到 Quick Card 的内容"
            multiline
            style={styles.modalInput}
            autoFocus
          />
          <View style={styles.modalActions}>
            <Pressable onPress={closeEdit} disabled={editSaving} style={[styles.modalBtn, styles.modalBtnGhost]}>
              <Text style={styles.modalBtnGhostText}>取消</Text>
            </Pressable>
            <Pressable onPress={saveQuickCard} disabled={editSaving} style={[styles.modalBtn, editSaving && styles.sendBtnDisabled]}>
              <Text style={styles.modalBtnText}>{editSaving ? '保存中…' : '加入 Quick Card'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '900', color: '#111827' },
  sub: { marginTop: 8, fontSize: 13, lineHeight: 18, color: '#6b7280' },
  memoryLink: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#111827',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#f9fafb',
  },
  memoryLinkText: { fontWeight: '900', color: '#111827', fontSize: 14 },
  settingsLink: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  settingsLinkText: { color: '#2563eb', fontWeight: '800', fontSize: 13 },
  hint: { marginTop: 8, fontSize: 12, lineHeight: 17, color: '#6b7280' },
  thread: { marginTop: 14, gap: 12 },
  bubble: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#111827' },
  bubbleAi: { alignSelf: 'flex-start', backgroundColor: '#fff' },
  bubbleRole: { fontWeight: '900', color: '#6b7280' },
  bubbleRoleUser: { color: 'rgba(255,255,255,0.85)' },
  bubbleText: { fontSize: 14, lineHeight: 20, color: '#111827' },
  bubbleTextUser: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  smallBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#f9fafb',
  },
  smallBtnText: { fontWeight: '900', color: '#111827', fontSize: 13 },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    padding: 12,
    backgroundColor: '#fff',
    gap: 10,
  },
  dockInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 140,
    color: '#111827',
  },
  sendBtn: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.55 },
  sendBtnText: { color: '#fff', fontWeight: '900' },
  modalMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  modalSub: { marginTop: 6, fontSize: 12, lineHeight: 16, color: '#6b7280' },
  modalInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 110,
    maxHeight: 220,
    color: '#111827',
  },
  modalActions: { marginTop: 12, flexDirection: 'row', gap: 10 },
  modalBtn: {
    flex: 1,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnText: { color: '#fff', fontWeight: '900' },
  modalBtnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  modalBtnGhostText: { color: '#111827', fontWeight: '900' },
});

