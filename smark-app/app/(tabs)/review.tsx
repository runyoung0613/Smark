import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DbHighlight, DbQuickCard, createQuickCard, listArticles, listHighlights, listQuickCards } from '../../services/db';

type ReviewItem =
  | { kind: 'highlight'; id: string; text: string; sourceTitle: string }
  | { kind: 'quick'; id: string; text: string; sourceTitle: '快速导入' };

function pickRandom<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function ReviewScreen() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [quickDraft, setQuickDraft] = useState('');

  const refresh = useCallback(() => {
    let cancelled = false;
    (async () => {
      const articles = await listArticles();
      const highlightsAll: DbHighlight[] = [];
      for (const a of articles) {
        const hs = await listHighlights(a.id);
        highlightsAll.push(...hs.map((h) => ({ ...h, note: h.note ?? null })));
      }
      const quicks: DbQuickCard[] = await listQuickCards();

      const nextItems: ReviewItem[] = [
        ...highlightsAll.map((h) => {
          const sourceTitle = articles.find((a) => a.id === h.article_id)?.title ?? '文章';
          return { kind: 'highlight', id: h.id, text: h.quote, sourceTitle };
        }),
        ...quicks.map((q) => ({ kind: 'quick', id: q.id, text: q.front, sourceTitle: '快速导入' as const })),
      ];

      if (!cancelled) {
        setItems(nextItems);
        setCurrentId((prev) => prev ?? (nextItems.length ? nextItems[0]!.id : null));
      }
    })().catch(() => {
      // ignore
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(refresh);

  const current = useMemo(() => {
    if (!items.length) return null;
    if (!currentId) return pickRandom(items);
    return items.find((i) => i.id === currentId) ?? pickRandom(items);
  }, [items, currentId]);

  function next() {
    if (!items.length) return;
    const n = pickRandom(items);
    setCurrentId(n.id);
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
    Alert.alert('已加入卡片池', '现在会在复习页随机出现。');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>随机复习</Text>

      <View style={styles.card}>
        {current ? (
          <>
            <Text style={styles.source}>{current.sourceTitle}</Text>
            <Text style={styles.text}>{current.text}</Text>
          </>
        ) : (
          <Text style={styles.empty}>还没有卡片。去阅读页划线，或在下方导入一句话。</Text>
        )}
      </View>

      <Pressable onPress={next} disabled={!items.length} style={[styles.btn, !items.length && styles.btnDisabled]}>
        <Text style={styles.btnText}>换一条</Text>
      </Pressable>

      <View style={styles.quickBox}>
        <Text style={styles.quickLabel}>导入一句话（Quick Card）</Text>
        <TextInput
          value={quickDraft}
          onChangeText={setQuickDraft}
          placeholder="例如：学习=在不同情境下取回同一知识"
          style={styles.input}
        />
        <Pressable onPress={addQuick} style={[styles.btn, { marginTop: 10 }]}>
          <Text style={styles.btnText}>加入卡片池</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  card: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 16,
    minHeight: 180,
    justifyContent: 'center',
  },
  source: { color: '#6b7280', fontWeight: '700', marginBottom: 10 },
  text: { fontSize: 18, lineHeight: 28, color: '#111827', fontWeight: '700' },
  empty: { color: '#6b7280', textAlign: 'center' },
  btn: {
    marginTop: 12,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '800' },
  quickBox: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 14,
  },
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

