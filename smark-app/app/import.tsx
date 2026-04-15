import { useHeaderHeight } from '@react-navigation/elements';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
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
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800' },
});
