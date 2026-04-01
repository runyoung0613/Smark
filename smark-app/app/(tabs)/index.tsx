import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { DbArticle, listArticles } from '../../services/db';

export default function HomeScreen() {
  const [articles, setArticles] = useState<DbArticle[]>([]);

  const refresh = useCallback(() => {
    let cancelled = false;
    (async () => {
      const rows = await listArticles();
      if (!cancelled) setArticles(rows);
    })().catch(() => {
      // Keep MVP simple: ignore.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(refresh);

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
        contentContainerStyle={articles.length ? undefined : styles.emptyContainer}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/read/[id]', params: { id: item.id } }} asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {new Date(item.updated_at).toLocaleString()}
              </Text>
            </Pressable>
          </Link>
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
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardMeta: { fontSize: 12, marginTop: 6, color: '#6b7280' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { color: '#6b7280', textAlign: 'center' },
});

