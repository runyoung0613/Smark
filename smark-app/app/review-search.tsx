import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabHeaderRowVerticalLayout, tabHeaderTapTargetSize, tabListCard } from '../components/TabScreenChrome';
import { listQuickCards, type DbQuickCard } from '../services/db';

function matchesQuickCard(card: DbQuickCard, needle: string) {
  const n = needle.toLowerCase();
  const front = (card.front ?? '').toLowerCase();
  const back = (card.back ?? '').toLowerCase();
  return front.includes(n) || back.includes(n);
}

function formatCardTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function ReviewSearchScreen() {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [cards, setCards] = useState<DbQuickCard[]>([]);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<DbQuickCard | null>(null);

  const load = useCallback(async () => {
    const rows = await listQuickCards();
    setCards(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const hits = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return cards.filter((c) => matchesQuickCard(c, q));
  }, [cards, query]);

  const qTrim = query.trim();

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/review');
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable
            onPress={goBack}
            style={styles.backBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="返回"
          >
            <Ionicons name="chevron-back" size={26} color="#111827" style={styles.backIcon} />
          </Pressable>
          <View style={styles.searchPill}>
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="输入文本内容进行搜索"
              placeholderTextColor="#9ca3af"
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="搜索 Quick Card"
              clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
            />
            <Pressable
              onPress={() => inputRef.current?.focus()}
              hitSlop={8}
              style={styles.searchIconWrap}
              accessibilityRole="button"
              accessibilityLabel="聚焦搜索框"
            >
              <Ionicons name="search" size={20} color="#6b7280" />
            </Pressable>
          </View>
        </View>
        <View style={styles.headerDivider} />
      </View>

      {!qTrim ? (
        <View style={styles.emptyHintWrap}>
          <Text style={styles.emptyHint}>搜索 Quick Card 正文与备注</Text>
        </View>
      ) : hits.length ? (
        <FlatList
          data={hits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setDetail(item)}
              style={({ pressed }) => [tabListCard.card, styles.hitCard, pressed && styles.hitCardPressed]}
              accessibilityRole="button"
              accessibilityLabel="查看全文"
            >
              <Text style={tabListCard.cardTitle} numberOfLines={1} ellipsizeMode="tail">
                {item.front}
              </Text>
              {item.back ? (
                <Text style={tabListCard.cardPreview} numberOfLines={2} ellipsizeMode="tail">
                  {item.back}
                </Text>
              ) : null}
              <Text style={tabListCard.cardMeta}>{formatCardTime(item.updated_at)}</Text>
            </Pressable>
          )}
        />
      ) : (
        <View style={styles.emptyHintWrap}>
          <Text style={styles.noHit}>无匹配的 Quick Card</Text>
        </View>
      )}

      <Modal
        visible={!!detail}
        transparent
        animationType="fade"
        onRequestClose={() => setDetail(null)}
      >
        <View style={styles.detailModalRoot}>
          <Pressable style={styles.detailModalBackdrop} onPress={() => setDetail(null)} accessibilityLabel="关闭" />
          <View style={[styles.detailModalCard, { paddingBottom: 16 + insets.bottom }]}>
            <Text style={styles.detailModalTitle}>Quick Card 全文</Text>
            <ScrollView
              style={styles.detailModalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.detailSectionLabel}>正文</Text>
              <Text style={styles.detailBody}>{detail?.front ?? ''}</Text>
              {detail?.back ? (
                <>
                  <Text style={[styles.detailSectionLabel, styles.detailSectionLabelSpaced]}>备注</Text>
                  <Text style={styles.detailBody}>{detail.back}</Text>
                </>
              ) : null}
              <Text style={styles.detailMeta}>{detail ? formatCardTime(detail.updated_at) : ''}</Text>
            </ScrollView>
            <View style={styles.detailActions}>
              <Pressable
                onPress={() => setDetail(null)}
                style={({ pressed }) => [styles.detailBtnGhost, pressed && styles.detailBtnPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.detailBtnGhostText}>关闭</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const id = detail?.id;
                  setDetail(null);
                  if (id) router.push({ pathname: '/quick-cards', params: { editId: id } });
                }}
                style={({ pressed }) => [styles.detailBtnSolid, pressed && styles.detailBtnPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.detailBtnSolidText}>编辑</Text>
              </Pressable>
            </View>
          </View>
        </View>
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
    paddingHorizontal: 12,
    paddingTop: tabHeaderRowVerticalLayout.paddingTop,
    paddingBottom: tabHeaderRowVerticalLayout.paddingBottom,
    minHeight: tabHeaderRowVerticalLayout.minHeight,
    gap: 8,
  },
  backBtn: {
    width: tabHeaderTapTargetSize,
    height: tabHeaderTapTargetSize,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: { marginLeft: -2 },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingLeft: 16,
    paddingRight: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  searchIconWrap: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  hitCard: { marginBottom: 10 },
  hitCardPressed: { opacity: 0.92 },
  detailModalRoot: { flex: 1, justifyContent: 'flex-end' },
  detailModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  detailModalCard: {
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  detailModalTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 12 },
  detailModalScroll: { maxHeight: 420 },
  detailSectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 6 },
  detailSectionLabelSpaced: { marginTop: 16 },
  detailBody: { fontSize: 16, lineHeight: 24, color: '#1f2937' },
  detailMeta: { marginTop: 16, fontSize: 12, color: '#9ca3af' },
  detailActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eef0f3',
  },
  detailBtnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  detailBtnGhostText: { fontSize: 15, fontWeight: '700', color: '#374151' },
  detailBtnSolid: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#111827',
  },
  detailBtnSolidText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  detailBtnPressed: { opacity: 0.88 },
  emptyHintWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    alignItems: 'center',
  },
  emptyHint: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  noHit: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
});
