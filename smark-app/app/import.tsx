import { Ionicons } from '@expo/vector-icons';
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
import { tabHeaderRowVerticalLayout, tabHeaderTapTargetSize } from '../components/TabScreenChrome';
import { createArticle } from '../services/db';
import { fetchArticleFromUrl } from '../services/importUrlFetch';

const ANDROID_IME_EXTRA = 20;

const BODY_MIN_H = 168;
const BODY_PAD_V = 20;

type ImportMode = 'link' | 'paste';

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const maxBodyH = useMemo(() => Math.round(Math.min(winH * 0.48, 420)), [winH]);

  const scrollRef = useRef<ScrollView>(null);
  const bodyInputRef = useRef<TextInput>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<ImportMode>('link');
  /** 链接导入：仅在「从链接抓取并填充」成功后才显示标题、正文与保存。 */
  const [linkFieldsVisible, setLinkFieldsVisible] = useState(false);
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

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  function normalizeUrl(raw: string) {
    const u = raw.trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return `https://${u}`;
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

    try {
      const { title: nextTitle, content: nextContent, finalUrl } = await fetchArticleFromUrl(normalized, {
        signal: controller.signal,
        timeoutMs: 20000,
      });

      if (!nextContent) {
        Alert.alert(
          '抓取失败',
          '未解析到可用正文。常见原因：站点拦截 App 内请求、需登录、或正文由脚本动态生成。\n可改用系统浏览器打开该页，复制全文后粘贴到下方正文框。'
        );
        return;
      }

      if (!title.trim() && nextTitle) setTitle(nextTitle);
      setContent(nextContent);
      if (finalUrl && finalUrl !== normalized) {
        setUrl(finalUrl);
      }
      setLinkFieldsVisible(true);

      const scrollImportedEditorToStart = () => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        bodyInputRef.current?.setNativeProps({ selection: { start: 0, end: 0 } });
      };
      requestAnimationFrame(() => {
        scrollImportedEditorToStart();
        if (Platform.OS === 'android') {
          setTimeout(scrollImportedEditorToStart, 80);
        }
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? '未知错误');
      Alert.alert('抓取失败', msg);
    } finally {
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

  const showEditorAndSave = mode === 'paste' || (mode === 'link' && linkFieldsVisible);

  function onSelectMode(next: ImportMode) {
    if (next === 'paste') {
      setMode('paste');
      return;
    }
    setMode('link');
    if (title.trim() || content.trim()) {
      setLinkFieldsVisible(true);
    }
  }

  async function onSave() {
    const t = title.trim();
    const c = content.trim();
    if (!t) {
      Alert.alert('提示', '请填写标题');
      return;
    }
    if (!c) {
      Alert.alert('提示', '请填写正文内容');
      return;
    }
    setSaving(true);
    try {
      const id = await createArticle({ title: t, content: c });
      router.replace({ pathname: '/read/[id]', params: { id } });
    } catch {
      Alert.alert('保存失败', '请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable onPress={goBack} style={styles.backBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="返回">
            <Ionicons name="chevron-back" size={26} color="#111827" style={styles.backIcon} />
          </Pressable>
          <View style={styles.segmentOuter}>
            <Pressable
              onPress={() => onSelectMode('link')}
              style={[styles.segmentCell, mode === 'link' && styles.segmentCellActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'link' }}
            >
              <Text style={[styles.segmentLabel, mode === 'link' && styles.segmentLabelActive]} numberOfLines={1}>
                链接导入
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onSelectMode('paste')}
              style={[styles.segmentCell, mode === 'paste' && styles.segmentCellActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'paste' }}
            >
              <Text style={[styles.segmentLabel, mode === 'paste' && styles.segmentLabelActive]} numberOfLines={1}>
                粘贴导入
              </Text>
            </Pressable>
          </View>
          <View style={styles.backSpacer} />
        </View>
        <View style={styles.headerDivider} />
      </View>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
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
          {mode === 'link' ? (
            <>
              <TextInput
                value={url}
                onChangeText={setUrl}
                placeholder="粘贴文章链接"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.input}
              />
              <Pressable onPress={onFetchFromUrl} disabled={fetching} style={[styles.btnFetch, fetching && styles.btnDisabled]}>
                {fetching ? (
                  <View style={styles.btnRow}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.btnText}>抓取中…</Text>
                  </View>
                ) : (
                  <Text style={styles.btnText}>从链接抓取并填充</Text>
                )}
              </Pressable>
            </>
          ) : null}

          {showEditorAndSave ? (
            <>
              <Text style={[styles.label, mode === 'link' ? styles.labelAfterLink : null]}>标题</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="例如：认知心理学"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <Text style={[styles.label, { marginTop: 16 }]}>正文</Text>
              <View style={[styles.bodyFrame, { height: bodyH }]}>
                <TextInput
                  ref={bodyInputRef}
                  value={content}
                  onChangeText={setContent}
                  placeholder="正文内容"
                  placeholderTextColor="#9ca3af"
                  style={styles.bodyInput}
                  multiline
                  textAlignVertical="top"
                  scrollEnabled={bodyScrollInner}
                  onContentSizeChange={(e) => onBodyContentSizeChange(e.nativeEvent.contentSize.height)}
                />
              </View>

              <Pressable onPress={onSave} disabled={saving} style={[styles.btn, saving && styles.btnDisabled]}>
                <Text style={styles.btnText}>{saving ? '保存中…' : '保存'}</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  headerWrap: { backgroundColor: '#fff' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: tabHeaderRowVerticalLayout.paddingTop,
    paddingBottom: tabHeaderRowVerticalLayout.paddingBottom,
    minHeight: tabHeaderRowVerticalLayout.minHeight,
  },
  backBtn: {
    width: tabHeaderTapTargetSize,
    height: tabHeaderTapTargetSize,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: { marginLeft: -2 },
  backSpacer: { width: tabHeaderTapTargetSize },
  segmentOuter: {
    flex: 1,
    flexDirection: 'row',
    padding: 2,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  segmentCell: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentCellActive: {
    backgroundColor: '#111827',
  },
  segmentLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: '#111827',
  },
  segmentLabelActive: {
    color: '#fff',
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 16,
  },
  kav: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, flexGrow: 1 },
  label: { fontSize: 14, fontWeight: '700', color: '#111827' },
  labelAfterLink: { marginTop: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
    fontSize: 15,
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
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
  },
  btnFetch: {
    marginTop: 12,
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btn: {
    marginTop: 16,
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
