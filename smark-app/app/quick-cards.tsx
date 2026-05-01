import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabHeaderRowVerticalLayout, tabHeaderTapTargetSize } from '../components/TabScreenChrome';
import {
  deleteQuickCard,
  listQuickCards,
  updateQuickCard,
  type DbQuickCard,
} from '../services/db';

function formatFooterTimestamp(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

export default function QuickCardsScreen() {
  const insets = useSafeAreaInsets();
  const rowRefs = useRef<Map<string, Swipeable>>(new Map());
  const params = useLocalSearchParams<{ editId?: string | string[] }>();
  const editIdFromRoute = useMemo(() => {
    const raw = params.editId;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
    return undefined;
  }, [params.editId]);

  const [cards, setCards] = useState<DbQuickCard[]>([]);
  const [editing, setEditing] = useState<DbQuickCard | null>(null);
  const [draftFront, setDraftFront] = useState('');
  const [draftBack, setDraftBack] = useState('');

  const load = useCallback(async (): Promise<DbQuickCard[]> => {
    const rows = await listQuickCards();
    setCards(rows);
    return rows;
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const rows = await load();
        if (cancelled) return;
        const eid = editIdFromRoute;
        if (eid) {
          const card = rows.find((r) => r.id === eid);
          if (card) {
            setEditing(card);
            setDraftFront(card.front);
            setDraftBack(card.back ?? '');
            router.replace('/quick-cards');
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [editIdFromRoute, load])
  );

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/review');
  }

  function openEdit(item: DbQuickCard) {
    setEditing(item);
    setDraftFront(item.front);
    setDraftBack(item.back ?? '');
  }

  function closeEdit() {
    setEditing(null);
    setDraftFront('');
    setDraftBack('');
  }

  async function saveEdit() {
    if (!editing) return;
    const front = draftFront.trim();
    if (!front) {
      Alert.alert('提示', '正文不能为空');
      return;
    }
    const ok = await updateQuickCard(editing.id, {
      front,
      back: draftBack.trim() || null,
    });
    if (!ok) {
      Alert.alert('保存失败', '请稍后重试');
      return;
    }
    closeEdit();
    await load();
  }

  function confirmDelete(item: DbQuickCard) {
    Alert.alert('删除 Quick Card', '将从展示池移除，不可恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            rowRefs.current.get(item.id)?.close();
            rowRefs.current.delete(item.id);
            await deleteQuickCard(item.id);
            if (editing?.id === item.id) closeEdit();
            await load();
          })();
        },
      },
    ]);
  }

  function renderRightActions(item: DbQuickCard) {
    return (
      <View style={styles.swipeActionsRight}>
        <Pressable
          accessibilityLabel="删除 Quick Card"
          style={styles.deleteActionRight}
          onPress={() => {
            rowRefs.current.get(item.id)?.close();
            confirmDelete(item);
          }}
        >
          <Text style={styles.deleteActionText}>删除</Text>
        </Pressable>
      </View>
    );
  }

  const modalBottomPad = 16 + insets.bottom;

  return (
    <View style={styles.screen}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable onPress={goBack} style={styles.backBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="返回">
            <Ionicons name="chevron-back" size={26} color="#111827" style={styles.backIcon} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.navTitle} numberOfLines={1}>
              QuickCard
            </Text>
          </View>
          <View style={styles.backSpacer} />
        </View>
        <View style={styles.headerDivider} />
      </View>

      <FlatList
        data={cards}
        keyExtractor={(item) => item.id}
        contentContainerStyle={cards.length ? styles.listContent : styles.emptyContainer}
        ListEmptyComponent={<Text style={styles.empty}>暂无 Quick Card</Text>}
        renderItem={({ item }) => (
          <View style={styles.swipeRow}>
            <Swipeable
              ref={(r) => {
                if (r) rowRefs.current.set(item.id, r);
                else rowRefs.current.delete(item.id);
              }}
              friction={2}
              overshootRight={false}
              renderRightActions={() => renderRightActions(item)}
              onSwipeableWillOpen={() => {
                rowRefs.current.forEach((ref, id) => {
                  if (id !== item.id) ref.close();
                });
              }}
            >
              <View style={styles.card}>
                <Text style={styles.cardBody}>{item.front}</Text>
                {item.back ? <Text style={styles.cardBack}>{item.back}</Text> : null}
                <View style={styles.cardFooter}>
                  <Text style={styles.cardTime}>{formatFooterTimestamp(item.updated_at)}</Text>
                  <Pressable onPress={() => openEdit(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel="编辑">
                    <Text style={styles.editLink}>编辑</Text>
                  </Pressable>
                </View>
              </View>
            </Swipeable>
          </View>
        )}
      />

      <Modal visible={!!editing} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeEdit}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalHeader, { paddingTop: insets.top + 6 }]}>
            <View style={styles.modalHeaderSide}>
              <Pressable onPress={closeEdit} style={styles.modalBackTap} hitSlop={12} accessibilityRole="button" accessibilityLabel="返回">
                <Ionicons name="chevron-back" size={26} color="#111827" />
              </Pressable>
            </View>
            <Text style={styles.modalHeaderTitle}>编辑</Text>
            <View style={[styles.modalHeaderSide, styles.modalHeaderSideEnd]}>
              <Pressable
                onPress={() => void saveEdit()}
                style={styles.modalSaveBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="保存"
              >
                <Text style={styles.modalSaveBtnText}>保存</Text>
              </Pressable>
            </View>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.modalScroll, { paddingBottom: modalBottomPad }]}
          >
            <Text style={styles.fieldLabel}>正文</Text>
            <TextInput
              value={draftFront}
              onChangeText={setDraftFront}
              style={styles.fieldInput}
              multiline
              textAlignVertical="top"
              placeholder="正文内容，正文内容，正文内容"
              placeholderTextColor="#9ca3af"
            />
            <Text style={[styles.fieldLabel, styles.fieldLabelSecond]}>备注（可选）</Text>
            <TextInput
              value={draftBack}
              onChangeText={setDraftBack}
              style={styles.fieldInput}
              multiline
              textAlignVertical="top"
              placeholder="背面或补充"
              placeholderTextColor="#9ca3af"
            />
            {editing ? (
              <Pressable
                onPress={() => confirmDelete(editing)}
                style={styles.deleteLinkWrap}
                accessibilityRole="button"
                accessibilityLabel="删除此卡片"
              >
                <Text style={styles.deleteLink}>删除此卡片</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  backSpacer: { width: tabHeaderTapTargetSize },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  swipeRow: { marginBottom: 12 },
  swipeActionsRight: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'flex-end' },
  deleteActionRight: {
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    marginLeft: 8,
  },
  deleteActionText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  emptyContainer: {
    flexGrow: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  empty: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 15,
    backgroundColor: '#fff',
  },
  cardBody: {
    fontSize: 16,
    lineHeight: 24,
    color: '#111827',
  },
  cardBack: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    color: '#6b7280',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  cardTime: {
    fontSize: 12,
    color: '#999999',
    flex: 1,
    paddingRight: 12,
  },
  /** 与文章列表「编辑」一致 */
  editLink: { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  modalRoot: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  modalHeaderSide: {
    width: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  modalHeaderSideEnd: { justifyContent: 'flex-end' },
  modalBackTap: {
    width: tabHeaderTapTargetSize,
    height: tabHeaderTapTargetSize,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -4,
  },
  modalSaveBtn: {
    backgroundColor: '#111827',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  modalSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalHeaderTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  modalScroll: { paddingHorizontal: 16, paddingTop: 20 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  fieldLabelSecond: { marginTop: 16 },
  fieldInput: {
    marginTop: 8,
    minHeight: 160,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
  },
  deleteLinkWrap: { marginTop: 32, alignItems: 'center' },
  deleteLink: { fontSize: 16, color: '#ef4444', fontWeight: '600' },
});
