import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  DbHighlight,
  deleteHighlight,
  getArticle,
  listHighlights,
  updateHighlightNote,
} from '../../services/db';

export default function HighlightsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const articleId = String(id ?? '');

  const [title, setTitle] = useState('划线');
  const [highlights, setHighlights] = useState<DbHighlight[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');

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

  async function onDelete(h: DbHighlight) {
    Alert.alert('删除划线', '确定删除这条划线吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await deleteHighlight(h.id);
            await refresh();
          })();
        },
      },
    ]);
  }

  async function onSaveNote() {
    if (!editingId) return;
    await updateHighlightNote({ id: editingId, note: noteDraft });
    setEditingId(null);
    setNoteDraft('');
    await refresh();
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `划线 · ${title}` }} />

      <FlatList
        data={highlights}
        keyExtractor={(item) => item.id}
        contentContainerStyle={highlights.length ? undefined : styles.emptyContainer}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.quote}>{item.quote}</Text>
            {item.note ? <Text style={styles.note}>备注：{item.note}</Text> : null}

            {editingId === item.id ? (
              <View style={styles.editRow}>
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="写点备注…"
                  style={styles.noteInput}
                />
                <Pressable onPress={onSaveNote} style={styles.smallBtn}>
                  <Text style={styles.smallBtnText}>保存</Text>
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
                  <Text style={styles.smallBtnText}>备注</Text>
                </Pressable>
                <Pressable onPress={() => onDelete(item)} style={[styles.smallBtn, styles.dangerBtn]}>
                  <Text style={[styles.smallBtnText, styles.dangerBtnText]}>删除</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>还没有划线，在阅读页选中文字即可高亮。</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
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
  dangerBtn: { borderColor: '#fecaca' },
  dangerBtnText: { color: '#b91c1c' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { color: '#6b7280', textAlign: 'center' },
});

