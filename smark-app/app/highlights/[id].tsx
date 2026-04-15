import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import {
  DbHighlight,
  deleteHighlight,
  getArticle,
  listHighlights,
  updateHighlightInReview,
  updateHighlightNote,
} from '../../services/db';

export default function HighlightsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const articleId = String(id ?? '');

  const [title, setTitle] = useState('划线');
  const [highlights, setHighlights] = useState<DbHighlight[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const rowRefs = useRef<Map<string, Swipeable>>(new Map());

  async function refresh() {
    const a = await getArticle(articleId);
    if (a) setTitle(a.title);
    const hs = await listHighlights(articleId);
    setHighlights(hs);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  function confirmDeleteHighlight(h: DbHighlight) {
    Alert.alert('删除划线', '确定删除这条划线吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            rowRefs.current.get(h.id)?.close();
            await deleteHighlight(h.id);
            rowRefs.current.delete(h.id);
            await refresh();
          })();
        },
      },
    ]);
  }

  function renderRightActions(h: DbHighlight) {
    return (
      <View style={styles.swipeActions}>
        <Pressable
          accessibilityLabel="删除划线"
          style={styles.deleteAction}
          onPress={() => {
            rowRefs.current.get(h.id)?.close();
            confirmDeleteHighlight(h);
          }}
        >
          <Text style={styles.deleteActionText}>删除</Text>
        </Pressable>
      </View>
    );
  }

  async function onSaveNote() {
    if (!editingId) return;
    await updateHighlightNote({ id: editingId, note: noteDraft });
    setEditingId(null);
    setNoteDraft('');
    await refresh();
  }

  async function onToggleReview(h: DbHighlight, inReview: boolean) {
    await updateHighlightInReview({ id: h.id, inReview });
    await refresh();
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `划线 · ${title}` }} />
      <Text style={styles.hint}>
        阅读页：长按选词后拖手柄调范围，用浮层「复制/划线/搜索」；点已划线区域出「复制/删除划线」。打开「加入复习」进复习池。此处可左滑删除。
      </Text>

      <FlatList
        data={highlights}
        keyExtractor={(item) => item.id}
        contentContainerStyle={highlights.length ? styles.listContent : styles.emptyContainer}
        renderItem={({ item }) => (
          <View style={styles.swipeRow}>
            <Swipeable
              ref={(ref) => {
                if (ref) rowRefs.current.set(item.id, ref);
              }}
              renderRightActions={() => renderRightActions(item)}
              overshootRight={false}
            >
              <View style={styles.card}>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>加入复习</Text>
                  <Switch
                    value={item.in_review === 1}
                    onValueChange={(v) => {
                      void onToggleReview(item, v);
                    }}
                  />
                </View>

                <Text style={styles.quote}>{item.quote}</Text>
                {item.note ? <Text style={styles.note}>想法：{item.note}</Text> : null}

                {editingId === item.id ? (
                  <View style={styles.editRow}>
                    <TextInput
                      value={noteDraft}
                      onChangeText={setNoteDraft}
                      placeholder="写下你的想法（可空）"
                      style={styles.noteInput}
                      multiline
                    />
                    <Pressable onPress={() => void onSaveNote()} style={styles.smallBtn}>
                      <Text style={styles.smallBtnText}>保存</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setEditingId(null);
                        setNoteDraft('');
                      }}
                      style={styles.smallBtn}
                    >
                      <Text style={styles.smallBtnText}>取消</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.actionsRow}>
                    <Pressable
                      onPress={() => {
                        setEditingId(item.id);
                        setNoteDraft(item.note ?? '');
                      }}
                      style={styles.smallBtn}
                    >
                      <Text style={styles.smallBtnText}>写想法</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        confirmDeleteHighlight(item);
                      }}
                      style={[styles.smallBtn, { borderColor: '#fecaca' }]}
                    >
                      <Text style={[styles.smallBtnText, { color: '#b91c1c' }]}>删除</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </Swipeable>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>还没有划线。在阅读页选中文本后点浮层「划线」。</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  hint: { color: '#6b7280', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  listContent: { paddingBottom: 24 },
  swipeRow: { marginBottom: 12 },
  swipeActions: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'flex-end' },
  deleteAction: {
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    marginLeft: 8,
  },
  deleteActionText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  reviewLabel: { fontWeight: '700', color: '#374151', fontSize: 14 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#fff',
  },
  quote: { fontSize: 15, fontWeight: '700', color: '#111827' },
  note: { marginTop: 8, color: '#6b7280' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  editRow: { flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'center' },
  noteInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallBtnText: { color: '#111827', fontWeight: '700' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { color: '#6b7280', textAlign: 'center' },
});
