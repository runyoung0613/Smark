import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
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
  deleteQuickCard,
  listArticles,
  listQuickCards,
  listReviewHighlights,
  updateHighlightInReview,
  updateHighlightQuote,
  updateQuickCard,
} from '../../services/db';

const MODAL_INPUT_MIN_H = 100;
const MODAL_INPUT_MAX_H = 240;

type ReviewItem =
  | {
      kind: 'highlight';
      id: string;
      text: string;
      sourceTitle: string;
      articleId: string;
      highlightId: string;
    }
  | { kind: 'quick'; id: string; text: string; back: string | null; sourceTitle: '快速导入' };

function pickRandom<T>(arr: T[]) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export default function ReviewScreen() {
  const { height: winH } = useWindowDimensions();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [quickDraft, setQuickDraft] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [poolEdit, setPoolEdit] = useState<
    null | { kind: 'highlight'; highlightId: string; articleId: string } | { kind: 'quick'; quickId: string }
  >(null);
  const [poolEditDraft, setPoolEditDraft] = useState('');
  const [poolEditBackDraft, setPoolEditBackDraft] = useState('');
  const [poolEditSaving, setPoolEditSaving] = useState(false);
  const [poolModalMainH, setPoolModalMainH] = useState(MODAL_INPUT_MIN_H);

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
      kind: 'quick' as const,
      id: q.id,
      text: q.front,
      back: q.back ?? null,
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

  const closePoolEdit = useCallback(() => {
    setPoolEdit(null);
    setPoolEditDraft('');
    setPoolEditBackDraft('');
    setPoolEditSaving(false);
    setPoolModalMainH(MODAL_INPUT_MIN_H);
  }, []);

  const onPoolModalMainContentSizeChange = useCallback((h: number) => {
    const next = Math.min(MODAL_INPUT_MAX_H, Math.max(MODAL_INPUT_MIN_H, Math.ceil(h)));
    setPoolModalMainH(next);
  }, []);

  const openPoolEdit = useCallback(() => {
    const c = current;
    if (!c) return;
    if (c.kind === 'highlight') {
      setPoolEdit({ kind: 'highlight', highlightId: c.highlightId, articleId: c.articleId });
      setPoolEditDraft(c.text);
      setPoolEditBackDraft('');
    } else {
      setPoolEdit({ kind: 'quick', quickId: c.id });
      setPoolEditDraft(c.text);
      setPoolEditBackDraft(c.back ?? '');
    }
    setPoolModalMainH(MODAL_INPUT_MIN_H);
    setPoolEditSaving(false);
  }, [current]);

  const savePoolEdit = useCallback(async () => {
    const main = poolEditDraft.trim();
    if (!main) {
      Alert.alert('提示', '正文不能为空');
      return;
    }
    if (!poolEdit) return;
    setPoolEditSaving(true);
    try {
      if (poolEdit.kind === 'highlight') {
        await updateHighlightQuote({ id: poolEdit.highlightId, quote: main });
      } else {
        await updateQuickCard(poolEdit.quickId, {
          front: main,
          back: poolEditBackDraft.trim() || null,
        });
      }
      closePoolEdit();
      await refresh();
    } catch {
      Alert.alert('保存失败', '请稍后重试');
    } finally {
      setPoolEditSaving(false);
    }
  }, [poolEdit, poolEditDraft, poolEditBackDraft, closePoolEdit, refresh]);

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

  function confirmRemoveFromReviewHl(item: Extract<ReviewItem, { kind: 'highlight' }>) {
    Alert.alert('从复习池移除', '该划线仍会保留在文章中，只是不再参与随机复习。', [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await updateHighlightInReview({ id: item.highlightId, inReview: false });
            await refresh();
          })();
        },
      },
    ]);
  }

  function confirmDeleteQuick(item: Extract<ReviewItem, { kind: 'quick' }>) {
    Alert.alert('删除 Quick Card', '将从展示池移除，随机复习中不再出现。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await deleteQuickCard(item.id);
            await refresh();
          })();
        },
      },
    ]);
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
                  <Pressable
                    onPress={openPoolEdit}
                    style={({ pressed }) => [styles.poolEditBtn, pressed && styles.poolEditBtnPressed]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={current.kind === 'highlight' ? '编辑摘录' : '编辑 Quick Card'}
                  >
                    <Text style={styles.poolEditBtnText}>编辑</Text>
                  </Pressable>
                </View>
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
              <Pressable onPress={() => confirmRemoveFromReviewHl(current)} style={styles.textLink}>
                <Text style={styles.textLinkDanger}>从复习池移除</Text>
              </Pressable>
              <Pressable onPress={() => goReadHighlight(current)} style={styles.textLink}>
                <Text style={styles.textLinkLabel}>回原文定位</Text>
              </Pressable>
            </View>
          ) : null}
          {current && current.kind === 'quick' ? (
            <View style={[styles.secondaryRow, styles.secondaryRowSingle]}>
              <Pressable onPress={() => confirmDeleteQuick(current)} style={styles.textLink}>
                <Text style={styles.textLinkDanger}>删除 Quick Card</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={poolEdit !== null}
        transparent
        animationType="fade"
        onRequestClose={closePoolEdit}
        statusBarTranslucent
      >
        <View
          style={[
            styles.poolModalOverlay,
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight : 0 },
          ]}
        >
          <Pressable style={styles.poolModalMaskFill} onPress={closePoolEdit} accessibilityLabel="关闭" />
          <View
            style={[
              styles.poolModalCard,
              { maxHeight: Math.min(winH * 0.88, winH - keyboardHeight - 48) },
            ]}
          >
            <Text style={styles.poolModalTitle}>编辑</Text>
            <Text style={styles.poolModalSub}>
              {poolEdit?.kind === 'highlight'
                ? '修改摘录后，复习池与划线列表会显示新文案；阅读原文时仍以文中划线区间为准。'
                : '修改后将写回该 Quick Card 的正文与备注。'}
            </Text>
            <TextInput
              key={poolEdit ? 'pool-edit-main' : 'pool-edit-idle'}
              value={poolEditDraft}
              onChangeText={setPoolEditDraft}
              placeholder={poolEdit?.kind === 'highlight' ? '摘录文字' : '正文'}
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
              scrollEnabled={poolModalMainH >= MODAL_INPUT_MAX_H - 1}
              style={[styles.poolModalInputMain, { height: poolModalMainH }]}
              onContentSizeChange={(e) => onPoolModalMainContentSizeChange(e.nativeEvent.contentSize.height)}
              autoFocus
            />
            {poolEdit?.kind === 'quick' ? (
              <>
                <Text style={styles.poolModalFieldLabel}>备注（可选）</Text>
                <TextInput
                  value={poolEditBackDraft}
                  onChangeText={setPoolEditBackDraft}
                  placeholder="背面或补充"
                  placeholderTextColor="#9ca3af"
                  multiline
                  textAlignVertical="top"
                  style={styles.poolModalInputSecondary}
                />
              </>
            ) : null}
            <View style={styles.poolModalActions}>
              <Pressable
                onPress={closePoolEdit}
                disabled={poolEditSaving}
                style={[styles.poolModalBtn, styles.poolModalBtnGhost]}
              >
                <Text style={styles.poolModalBtnGhostText}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => void savePoolEdit()}
                disabled={poolEditSaving}
                style={[
                  styles.poolModalBtn,
                  styles.poolModalBtnPrimary,
                  poolEditSaving && styles.poolModalBtnDisabled,
                ]}
              >
                <Text style={styles.poolModalBtnPrimaryText}>{poolEditSaving ? '保存中…' : '保存'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  poolBadgeRow: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  poolEditBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  poolEditBtnPressed: { opacity: 0.65 },
  poolEditBtnText: { fontSize: 14, fontWeight: '800', color: '#2563eb' },
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
    justifyContent: 'space-between',
    gap: 8,
  },
  secondaryRowSingle: {
    justifyContent: 'flex-start',
  },
  textLink: { alignSelf: 'flex-start' },
  textLinkLabel: { color: '#2563eb', fontWeight: '800', fontSize: 14 },
  textLinkDanger: { color: '#b91c1c', fontWeight: '800', fontSize: 14 },
  poolModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  poolModalMaskFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  poolModalCard: {
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
  poolModalTitle: { fontSize: 17, fontWeight: '800', color: '#111827', letterSpacing: -0.2 },
  poolModalSub: { marginTop: 8, fontSize: 13, lineHeight: 18, color: '#6b7280' },
  poolModalInputMain: {
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
  poolModalFieldLabel: { marginTop: 14, fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 6 },
  poolModalInputSecondary: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
    minHeight: 88,
    maxHeight: 160,
    textAlignVertical: 'top',
    backgroundColor: '#f8fafc',
  },
  poolModalActions: { marginTop: 16, flexDirection: 'row', gap: 12 },
  poolModalBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poolModalBtnPrimary: { backgroundColor: '#111827' },
  poolModalBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  poolModalBtnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db' },
  poolModalBtnGhostText: { color: '#111827', fontWeight: '800', fontSize: 15 },
  poolModalBtnDisabled: { opacity: 0.38 },
});
