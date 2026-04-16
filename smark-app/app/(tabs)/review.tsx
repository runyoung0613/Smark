import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createQuickCard,
  deleteHighlight,
  deleteQuickCard,
  listArticles,
  listQuickCards,
  listReviewHighlights,
} from '../../services/db';

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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [dockHeight, setDockHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const current = useMemo(() => {
    if (!items.length) return null;
    if (currentId) return items.find((i) => i.id === currentId) ?? pickRandom(items);
    return pickRandom(items);
  }, [items, currentId]);

  const scrollToBottom = useCallback(() => {
    // 确保底部「换一条」按钮在键盘弹出时也可见、可点击
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Android（尤其 edge-to-edge / 第三方输入法）下，KeyboardAvoidingView 容易失效；
      // 这里直接用键盘事件的高度把底部输入区抬起来，最稳。
      const showSub = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        (e) => {
          setKeyboardHeight(e.endCoordinates?.height ?? 0);
          // 等布局应用后再滚动，避免滚动不生效
          setTimeout(scrollToBottom, 50);
        }
      );
      const hideSub = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        () => setKeyboardHeight(0)
      );
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }, [scrollToBottom])
  );

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

  function confirmDeleteCurrent(item: ReviewItem) {
    const isHl = item.kind === 'highlight';
    Alert.alert(
      isHl ? '删除划线' : '删除 Quick Card',
      isHl
        ? '该句将从文章中移除划线，且不再出现在复习池。'
        : '该卡片将从展示池移除，不可恢复。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (isHl) {
                await deleteHighlight(item.highlightId);
              } else {
                await deleteQuickCard(item.id);
              }
              await refresh();
            })();
          },
        },
      ]
    );
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
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            // 预留底部输入区高度；键盘弹出时再额外加上键盘高度，
            // 保证“换一条”等内容不会被底部输入区/键盘遮住。
            paddingBottom: 12 + dockHeight + keyboardHeight,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
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
                <View style={styles.cardActions}>
                  {current.kind === 'highlight' ? (
                    <Pressable onPress={() => goReadHighlight(current)} style={styles.linkBtn}>
                      <Text style={styles.linkBtnText}>回原文定位</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => confirmDeleteCurrent(current)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>从复习池删除</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={styles.empty}>
                暂无可展示内容：请在阅读页划线并在划线列表打开「加入复习」，或添加 Quick Card。
              </Text>
            )}
          </View>

          <Pressable
            onPress={nextRandom}
            disabled={!items.length}
            style={[styles.btn, !items.length && styles.btnDisabled]}
          >
            <Text style={styles.btnText}>换一条</Text>
          </Pressable>
      </ScrollView>

      <View
        style={[styles.quickDock, { bottom: keyboardHeight }]}
        onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
      >
        <Text style={styles.quickLabel}>添加 Quick Card</Text>
        <TextInput
          value={quickDraft}
          onChangeText={setQuickDraft}
          onFocus={scrollToBottom}
          placeholder="一个你想随手看到的句子"
          style={styles.input}
        />
        <Pressable onPress={addQuick} style={[styles.btn, { marginTop: 10 }]}>
          <Text style={styles.btnText}>加入展示池</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 12 },
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
  cardActions: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  linkBtn: { alignSelf: 'flex-start' },
  linkBtnText: { color: '#2563eb', fontWeight: '800', fontSize: 15 },
  deleteBtn: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  deleteBtnText: { color: '#b91c1c', fontWeight: '800', fontSize: 14 },
  btn: {
    marginTop: 12,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontWeight: '800' },
  quickDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: '#fff',
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
