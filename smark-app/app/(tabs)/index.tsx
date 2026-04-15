import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { DbArticle, listArticles, softDeleteArticle } from '../../services/db';

export default function HomeScreen() {
  const [articles, setArticles] = useState<DbArticle[]>([]);
  const rowRefs = useRef<Map<string, Swipeable>>(new Map());

  const loadArticles = useCallback(async () => {
    try {
      const rows = await listArticles();
      setArticles(rows);
    } catch {
      // Keep MVP simple: ignore.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadArticles();
    }, [loadArticles])
  );

  function confirmDeleteArticle(item: DbArticle) {
    Alert.alert('删除文章', `确定删除「${item.title}」？\n本篇划线将一并移除且不可恢复。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            rowRefs.current.get(item.id)?.close();
            await softDeleteArticle(item.id);
            rowRefs.current.delete(item.id);
            await loadArticles();
          })();
        },
      },
    ]);
  }

  function renderRightActions(item: DbArticle) {
    return (
      <View style={styles.swipeActions}>
        <Pressable
          accessibilityLabel="删除文章"
          style={styles.deleteAction}
          onPress={() => {
            rowRefs.current.get(item.id)?.close();
            confirmDeleteArticle(item);
          }}
        >
          <Text style={styles.deleteActionText}>删除</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>文章</Text>
        <Link href="/import" asChild>
          <Pressable style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>导入</Text>
          </Pressable>
        </Link>
      </View>

      <FlatList
        data={articles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={articles.length ? styles.listContent : styles.emptyContainer}
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
              <Pressable
                style={styles.card}
                onPress={() => router.push({ pathname: '/read/[id]', params: { id: item.id } })}
              >
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {new Date(item.updated_at).toLocaleString()}
                </Text>
              </Pressable>
            </Swipeable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>还没有文章，点右上角“导入”。</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: '#111827',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  listContent: { paddingBottom: 24 },
  swipeRow: { marginTop: 12 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#fff',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardMeta: { fontSize: 12, marginTop: 6, color: '#6b7280' },
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
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { color: '#6b7280', textAlign: 'center' },
});
