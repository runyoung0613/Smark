import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
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
            <View style={[tabListCard.card, styles.hitCard]}>
              <Text style={tabListCard.cardTitle} numberOfLines={1} ellipsizeMode="tail">
                {item.front}
              </Text>
              {item.back ? (
                <Text style={tabListCard.cardPreview} numberOfLines={2} ellipsizeMode="tail">
                  {item.back}
                </Text>
              ) : null}
              <Text style={tabListCard.cardMeta}>{formatCardTime(item.updated_at)}</Text>
            </View>
          )}
        />
      ) : (
        <View style={styles.emptyHintWrap}>
          <Text style={styles.noHit}>无匹配的 Quick Card</Text>
        </View>
      )}
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
  emptyHintWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    alignItems: 'center',
  },
  emptyHint: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  noHit: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
});
