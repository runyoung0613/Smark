import { useHeaderHeight } from '@react-navigation/elements';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createArticle } from '../services/db';

const ANDROID_IME_EXTRA = 20;

const BODY_MIN_H = 168;
const BODY_PAD_V = 20;

export default function ImportScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const maxBodyH = useMemo(() => Math.round(Math.min(winH * 0.48, 420)), [winH]);

  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [bodyH, setBodyH] = useState(BODY_MIN_H);
  const [bodyScrollInner, setBodyScrollInner] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        const h = e.endCoordinates?.height ?? 0;
        setKeyboardInset(h);
        const scrollEnd = () => scrollRef.current?.scrollToEnd({ animated: true });
        requestAnimationFrame(() => {
          setTimeout(scrollEnd, 100);
          setTimeout(scrollEnd, 280);
        });
      }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardInset(0)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function normalizeUrl(raw: string) {
    const u = raw.trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return `https://${u}`;
  }

  function decodeHtmlEntities(input: string) {
    return input
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#(\d+);/g, (all, n) => {
        const code = Number(n);
        if (!Number.isFinite(code)) return all;
        try {
          return String.fromCodePoint(code);
        } catch {
          return all;
        }
      });
  }

  function extractTitle(html: string) {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return '';
    const t = m[1] ?? '';
    return decodeHtmlEntities(
      t
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  function htmlToPlainText(html: string) {
    let h = html;
    h = h.replace(/<!--([\s\S]*?)-->/g, ' ');
    h = h.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    h = h.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    h = h.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

    const article = h.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1];
    if (article) h = article;
    else {
      const body = h.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
      if (body) h = body;
    }

    h = h.replace(/<(br|br\/)\s*>/gi, '\n');
    h = h.replace(/<\/(p|div|section|article|header|footer|main|aside|li|h[1-6]|blockquote|pre|tr)>/gi, '\n');
    h = h.replace(/<(p|div|section|article|header|footer|main|aside|li|h[1-6]|blockquote|pre|tr)[^>]*>/gi, '\n');
    h = h.replace(/<[^>]+>/g, ' ');

    h = decodeHtmlEntities(h);
    h = h.replace(/\r/g, '');
    h = h.replace(/[ \t]+\n/g, '\n');
    h = h.replace(/\n{3,}/g, '\n\n');
    return h.trim();
  }

  async function onFetchFromUrl() {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      Alert.alert('提示', '请输入链接');
      return;
    }

    setFetching(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(normalized, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        Alert.alert('抓取失败', `HTTP ${res.status}`);
        return;
      }

      const html = await res.text();
      const nextTitle = extractTitle(html);
      const nextContent = htmlToPlainText(html);

      if (!nextContent) {
        Alert.alert('抓取失败', '未解析到可用正文（可能是图片/脚本渲染页面）。');
        return;
      }

      if (!title.trim() && nextTitle) setTitle(nextTitle);
      setContent(nextContent);

      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? '请求超时或已取消' : '请检查网络，或该站点不允许直接抓取';
      Alert.alert('抓取失败', msg);
    } finally {
      clearTimeout(timeout);
      setFetching(false);
    }
  }

  const onBodyContentSizeChange = useCallback(
    (h: number) => {
      const inner = h + BODY_PAD_V;
      const nextH = Math.min(maxBodyH, Math.max(BODY_MIN_H, Math.ceil(inner)));
      setBodyH(nextH);
      setBodyScrollInner(inner > maxBodyH + 0.5);
    },
    [maxBodyH]
  );

  const scrollPadBottom =
    16 +
    insets.bottom +
    keyboardInset +
    (Platform.OS === 'android' && keyboardInset > 0 ? ANDROID_IME_EXTRA : 0);

  async function onSave() {
    const t = title.trim();
    const c = content.trim();
    if (!t) {
      Alert.alert('提示', '请填写标题');
      return;
    }
    if (!c) {
      Alert.alert('提示', '请粘贴正文内容');
      return;
    }
    setSaving(true);
    try {
      const id = await createArticle({ title: t, content: c });
      router.replace({ pathname: '/read/[id]', params: { id } });
    } catch (e) {
      Alert.alert('保存失败', '请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollPadBottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        <Text style={styles.label}>链接导入</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="粘贴文章链接（https://…）"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
        />
        <Pressable
          onPress={onFetchFromUrl}
          disabled={fetching}
          style={[styles.btnSecondary, fetching && styles.btnDisabled]}
        >
          {fetching ? (
            <View style={styles.btnRow}>
              <ActivityIndicator color="#111827" />
              <Text style={styles.btnSecondaryText}>抓取中…</Text>
            </View>
          ) : (
            <Text style={styles.btnSecondaryText}>从链接抓取并填充</Text>
          )}
        </Pressable>

        <Text style={styles.label}>标题</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="例如：认知心理学读书笔记"
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: 16 }]}>正文（粘贴）</Text>
        <View style={[styles.bodyFrame, { height: bodyH }]}>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="把文章内容粘贴到这里…"
            style={styles.bodyInput}
            multiline
            textAlignVertical="top"
            scrollEnabled={bodyScrollInner}
            onContentSizeChange={(e) => onBodyContentSizeChange(e.nativeEvent.contentSize.height)}
          />
        </View>

        <Pressable onPress={onSave} disabled={saving} style={[styles.btn, saving && styles.btnDisabled]}>
          <Text style={styles.btnText}>{saving ? '保存中…' : '保存并阅读'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, flexGrow: 1 },
  label: { fontSize: 14, fontWeight: '700', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    color: '#111827',
  },
  bodyFrame: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fafafa',
  },
  bodyInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
  },
  btn: {
    marginTop: 16,
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnSecondary: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800' },
  btnSecondaryText: { color: '#111827', fontWeight: '800' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
