import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
  HeaderOverflowButton,
  HeaderSearchIconButton,
  TabScreenHeader,
  tabListCard,
} from '../../components/TabScreenChrome';
import {
  createQuickCard,
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

  const current = useMemo(() => {
    if (!items.length) return null;
    if (currentId) return items.find((i) => i.id === currentId) ?? pickRandom(items);
    return pickRandom(items);
  }, [items, currentId]);

  useFocusEffect(
    useCallback(() => {
      const showSub = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0)
      );
      const hideSub = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        () => setKeyboardHeight(0)
      );
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }, [])
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

  const headerRight = (
    <>
      <HeaderSearchIconButton onPress={() => router.push('/review-search')} />
      <HeaderOverflowButton label="管理 Quick Card" onPress={() => router.push('/quick-cards')} />
    </>
  );

  return (
    <View style={styles.root}>
      <TabScreenHeader title="复习" right={headerRight} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 12 + keyboardHeight },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={[tabListCard.card, styles.blockCard]}>
          <Text style={styles.cardHeading}>添加到Quick Card</Text>
          <TextInput
            value={quickDraft}
            onChangeText={setQuickDraft}
            placeholder="一个你随手看到的句子"
            placeholderTextColor="#9ca3af"
            style={styles.input}
          />
          <Pressable onPress={addQuick} style={[styles.btnBlack, styles.btnInCard]}>
            <Text style={styles.btnBlackText}>加入复习池</Text>
          </Pressable>
        </View>

        <View style={[tabListCard.card, styles.blockCard]}>
          <View style={styles.poolHeaderRow}>
            <Text style={styles.cardHeading}>随机复习池</Text>
            {items.length > 0 ? (
              <View style={styles.poolCountPill}>
                <Text style={styles.poolCountPillText}>共 {items.length} 条</Text>
              </View>
            ) : null}
          </View>
          <View
            style={[
              styles.poolStage,
              current?.kind === 'highlight' && styles.poolStageAccentHl,
              current?.kind === 'quick' && styles.poolStageAccentQc,
            ]}
          >
            {current ? (
              <>
                <View style={styles.poolBadgeRow}>
                  <View
                    style={[
                      styles.typeBadge,
                      current.kind === 'highlight' ? styles.typeBadgeHl : styles.typeBadgeQc,
                    ]}
                  >
                    <Ionicons
                      name={current.kind === 'highlight' ? 'bookmark' : 'albums-outline'}
                      size={14}
                      color={current.kind === 'highlight' ? '#1d4ed8' : '#6d28d9'}
                    />
                    <Text
                      style={current.kind === 'highlight' ? styles.typeBadgeTextHl : styles.typeBadgeTextQc}
                    >
                      {current.kind === 'highlight' ? '划线摘录' : 'Quick Card'}
                    </Text>
                  </View>
                </View>
                {current.kind === 'highlight' ? (
                  <Text style={styles.poolFromLine} numberOfLines={1}>
                    来自「{current.sourceTitle}」
                  </Text>
                ) : (
                  <Text style={styles.poolFromLineMuted}>展示板 · 随手一句</Text>
                )}
                <Text style={styles.poolBody} selectable>
                  {current.text}
                </Text>
              </>
            ) : (
              <View style={styles.poolEmptyInner}>
                <Ionicons name="sparkles-outline" size={36} color="#d1d5db" />
                <Text style={styles.poolPreviewTextMuted}>
                  暂无可展示：在阅读页划线并打开「加入复习」，或先在上方添加 Quick Card。
                </Text>
              </View>
            )}
          </View>
          <Pressable
            onPress={nextRandom}
            disabled={!items.length}
            style={[styles.btnBlack, styles.btnInCard, !items.length && styles.btnDisabled]}
          >
            <View style={styles.btnBlackInner}>
              <Ionicons name="shuffle" size={18} color="#fff" />
              <Text style={styles.btnBlackText}>换一条</Text>
            </View>
          </Pressable>
          {current && current.kind === 'highlight' ? (
            <View style={styles.secondaryRow}>
              <Pressable onPress={() => goReadHighlight(current)} style={styles.textLink}>
                <Text style={styles.textLinkLabel}>回原文定位</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  blockCard: { marginBottom: 12 },
  cardHeading: { fontSize: 16, fontWeight: '800', color: '#111827' },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  poolHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  poolCountPill: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  poolCountPillText: { fontSize: 12, fontWeight: '700', color: '#4b5563' },
  poolStage: {
    marginTop: 12,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fafbfc',
    borderWidth: 1,
    borderColor: '#eef0f3',
    borderLeftWidth: 4,
    borderLeftColor: '#e5e7eb',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  poolStageAccentHl: {
    borderLeftColor: '#2563eb',
    backgroundColor: '#f8fafc',
  },
  poolStageAccentQc: {
    borderLeftColor: '#7c3aed',
    backgroundColor: '#faf5ff',
  },
  poolBadgeRow: { marginBottom: 8 },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  typeBadgeHl: { backgroundColor: '#dbeafe' },
  typeBadgeQc: { backgroundColor: '#ede9fe' },
  typeBadgeTextHl: { fontSize: 12, fontWeight: '800', color: '#1d4ed8' },
  typeBadgeTextQc: { fontSize: 12, fontWeight: '800', color: '#6d28d9' },
  poolFromLine: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 12 },
  poolFromLineMuted: { fontSize: 12, fontWeight: '600', color: '#9ca3af', marginBottom: 12 },
  poolBody: {
    fontSize: 17,
    lineHeight: 28,
    letterSpacing: 0.15,
    color: '#111827',
    fontWeight: '500',
  },
  poolEmptyInner: { alignItems: 'center', paddingVertical: 8, gap: 12 },
  poolPreviewTextMuted: { fontSize: 14, lineHeight: 22, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 4 },
  btnBlack: {
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnInCard: { marginTop: 12 },
  btnBlackInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnBlackText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnDisabled: { opacity: 0.45 },
  secondaryRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  textLink: { alignSelf: 'flex-start' },
  textLinkLabel: { color: '#2563eb', fontWeight: '800', fontSize: 14 },
});
