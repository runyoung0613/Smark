import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { HeaderPrimaryButton, TabScreenHeader, tabListCard } from '../../components/TabScreenChrome';
import { DbArticle, listArticles, softDeleteArticle } from '../../services/db';

/** 单行折叠空白，具体行数由 Text numberOfLines 控制并自动省略号 */
function articlePreviewLine(content: string) {
  const t = content.replace(/\s+/g, ' ').trim();
  return t || '暂无正文';
}

function formatArticleTimeFooter(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

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
      <View style={styles.swipeActionsRight}>
        <Pressable
          accessibilityLabel="删除文章"
          style={styles.deleteActionRight}
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
    <View style={styles.screen}>
      <TabScreenHeader
        title="文章"
        right={<HeaderPrimaryButton label="导入" onPress={() => router.push('/import')} />}
      />

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
              <View style={tabListCard.card}>
                <Pressable
                  onPress={() => router.push({ pathname: '/read/[id]', params: { id: item.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`打开文章 ${item.title}`}
                >
                  <Text style={tabListCard.cardTitle} numberOfLines={1} ellipsizeMode="tail">
                    {item.title}
                  </Text>
                  <Text style={tabListCard.cardPreview} numberOfLines={2} ellipsizeMode="tail">
                    {articlePreviewLine(item.content)}
                  </Text>
                </Pressable>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardTime}>{formatArticleTimeFooter(item.updated_at)}</Text>
                  <Pressable
                    onPress={() => router.push({ pathname: '/edit/[id]', params: { id: item.id } })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="编辑正文"
                  >
                    <Text style={styles.linkEdit}>编辑</Text>
                  </Pressable>
                </View>
              </View>
            </Swipeable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>还没有文章，点顶栏「导入」。</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  swipeRow: { marginBottom: 12 },
  emptyContainer: { flexGrow: 1, paddingHorizontal: 16, justifyContent: 'center', paddingTop: 48 },
  emptyText: { color: '#6b7280', textAlign: 'center', fontSize: 14 },
  swipeActionsRight: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'flex-end' },
  deleteActionRight: {
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    marginLeft: 8,
  },
  deleteActionText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 2,
  },
  cardTime: { fontSize: 12, color: '#9ca3af', flex: 1, marginRight: 12 },
  /** 与 Perses 助手气泡「编辑」同色同字号 */
  linkEdit: { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
});
