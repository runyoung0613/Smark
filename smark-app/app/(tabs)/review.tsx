import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createQuickCard, listArticles, listQuickCards, listReviewHighlights } from '../../services/db';

type ReviewItem =
  | {
      kind: 'highlight';
      id: string;
      text: string;
      sourceTitle: string;
      articleId: string;
      highlightId: string;
    }
  | { kind: 'quick'; id: string; text: string; sourceTitle: '快速导入' };

function pickRandom<T>(arr: T[]) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export default function ReviewScreen() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [quickDraft, setQuickDraft] = useState('');

  const current = useMemo(() => {
    if (!items.length) return null;
    if (currentId) return items.find((i) => i.id === currentId) ?? pickRandom(items);
    return pickRandom(items);
  }, [items, currentId]);

  const refresh = useCallback(async () => {
    const [arts, reviewHls, quicks] = await Promise.all([
      listArticles(),
      listReviewHighlights(),
      listQuickCards(),
    ]);

    const titleMap = new Map(arts.map((a) => [a.id, a.title] as const));

    const highlightItems: ReviewItem[] = reviewHls.map((h) => ({
      kind: 'highlight',
      id: h.id,
      text: h.quote,
      sourceTitle: titleMap.get(h.article_id) ?? '文章',
      articleId: h.article_id,
      highlightId: h.id,
    }));

    const quickItems: ReviewItem[] = quicks.map((q) => ({
      kind: 'quick',
      id: q.id,
      text: q.front,
      sourceTitle: '快速导入' as const,
    }));

    const nextItems = [...highlightItems, ...quickItems];
    setItems(nextItems);
    setCurrentId((prev) => (prev && nextItems.some((i) => i.id === prev) ? prev : pickRandom(nextItems)?.id ?? null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  function nextRandom() {
    if (!items.length) return;
    const next = pickRandom(items);
    if (!next) return;
    if (items.length > 1 && next.id === currentId) {
      const alt = pickRandom(items.filter((i) => i.id !== next.id));
      if (alt) setCurrentId(alt.id);
    } else {
      setCurrentId(next.id);
    }
  }

  function goReadHighlight(item: Extract<ReviewItem, { kind: 'highlight' }>) {
    router.push({
      pathname: '/read/[id]',
      params: { id: item.articleId, highlightId: item.highlightId },
    });
  }

  async function addQuick() {
    const text = quickDraft.trim();
    if (!text) {
      Alert.alert('提示', '请输入一句话');
      return;
    }
    await createQuickCard({ front: text });
    setQuickDraft('');
    await refresh();
    Alert.alert('已加入', '现在会在随机池中出现。');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>随机复习池</Text>
      <Text style={styles.sub}>
        从「已勾选复习的划线句子（可回原文定位）」与「Quick Card 展示板」合并随机抽取。
      </Text>

      <View style={styles.card}>
        {current ? (
          <>
            <Text style={styles.source}>
              {current.sourceTitle}
              {current.kind === 'highlight' ? '（划线）' : ''}
            </Text>
            <Text style={styles.text}>{current.text}</Text>
            {current.kind === 'highlight' ? (
              <Pressable onPress={() => goReadHighlight(current)} style={styles.linkBtn}>
                <Text style={styles.linkBtnText}>回原文定位</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Text style={styles.empty}>
            暂无可展示内容：请在阅读页划线并在划线列表打开「加入复习」，或添加 Quick Card。
          </Text>
        )}
      </View>

      <Pressable onPress={nextRandom} disabled={!items.length} style={[styles.btn, !items.length && styles.btnDisabled]}>
        <Text style={styles.btnText}>换一条</Text>
      </Pressable>

      <View style={styles.quickBox}>
        <Text style={styles.quickLabel}>添加 Quick Card（展示板）</Text>
        <TextInput
          value={quickDraft}
          onChangeText={setQuickDraft}
          placeholder="例如：一个你想随手看到的句子"
          style={styles.input}
        />
        <Pressable onPress={addQuick} style={[styles.btn, { marginTop: 10 }]}>
          <Text style={styles.btnText}>加入展示池</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  sub: { marginTop: 6, fontSize: 13, color: '#6b7280', lineHeight: 18 },
  card: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 16,
    minHeight: 160,
    justifyContent: 'center',
  },
  source: { color: '#6b7280', fontWeight: '700', marginBottom: 10 },
  text: { fontSize: 17, lineHeight: 26, color: '#111827', fontWeight: '700' },
  empty: { color: '#6b7280', textAlign: 'center', fontSize: 14 },
  linkBtn: { marginTop: 14, alignSelf: 'flex-start' },
  linkBtnText: { color: '#2563eb', fontWeight: '800', fontSize: 15 },
  btn: {
    marginTop: 12,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontWeight: '800' },
  quickBox: { marginTop: 18, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 14 },
  quickLabel: { fontWeight: '800', color: '#111827' },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
