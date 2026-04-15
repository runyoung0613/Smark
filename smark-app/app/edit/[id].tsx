import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  getArticle,
  softDeleteAllHighlightsForArticle,
  updateArticleContent,
} from '../../services/db';

export default function EditArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const articleId = String(id ?? '');

  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const a = await getArticle(articleId);
        if (!a) {
          Alert.alert('未找到文章', '可能已被删除', [
            { text: '确定', onPress: () => router.back() },
          ]);
          return;
        }
        setTitle(a.title);
        setDraft(a.content);
        setOriginal(a.content);
      } finally {
        setLoading(false);
      }
    })();
  }, [articleId]);

  function save() {
    const next = draft;
    if (next === original) {
      Alert.alert('提示', '正文没有变化');
      return;
    }
    Alert.alert(
      '保存正文',
      '保存后本篇所有划线将与正文偏移不一致，将清除本篇全部划线。是否继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '保存',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await softDeleteAllHighlightsForArticle(articleId);
              await updateArticleContent({ id: articleId, content: next });
              router.back();
            })();
          },
        },
      ]
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `矫正正文 · ${title || '…'}` }} />
      <View style={styles.container}>
        <Text style={styles.hint}>
          用于修正导入乱码、错字等。保存且正文有变化时，会清除该文章下全部划线。
        </Text>

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            editable={!loading}
            placeholder="正文…"
            style={styles.input}
            textAlignVertical="top"
          />
        </ScrollView>

        <Pressable onPress={save} style={[styles.btn, loading && styles.btnDisabled]} disabled={loading}>
          <Text style={styles.btnText}>保存正文</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  hint: { color: '#6b7280', fontSize: 13, lineHeight: 20, marginBottom: 12 },
  scroll: { flex: 1 },
  input: {
    minHeight: 360,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#111827',
  },
  btn: {
    marginTop: 12,
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '800' },
});
