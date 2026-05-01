import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabHeaderRowVerticalLayout, tabHeaderTapTargetSize } from '../../components/TabScreenChrome';
import {
  getArticle,
  softDeleteAllHighlightsForArticle,
  softDeleteArticle,
  updateArticle,
} from '../../services/db';

export default function EditArticleScreen() {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  /** 正文编辑区固定可视高度，过长内容在框内滚动 */
  const bodyEditorHeight = Math.round(Math.min(340, Math.max(220, winH * 0.36)));

  const { id } = useLocalSearchParams<{ id: string }>();
  const articleId = String(id ?? '');

  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const a = await getArticle(articleId);
        if (!a) {
          Alert.alert('未找到文章', '可能已被删除', [
            { text: '确定', onPress: () => router.back() },
          ]);
          return;
        }
        setTitle(a.title);
        setDraft(a.content);
        setOriginalTitle(a.title);
        setOriginal(a.content);
      } finally {
        setLoading(false);
      }
    })();
  }, [articleId]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  function save() {
    const titleTrim = title.trim();
    if (!titleTrim) {
      Alert.alert('提示', '请填写标题');
      return;
    }

    const contentSame = draft === original;
    const titleSame = titleTrim === originalTitle.trim();

    if (contentSame && titleSame) {
      Alert.alert('提示', '没有修改');
      return;
    }

    const persist = async () => {
      await updateArticle({ id: articleId, title: titleTrim, content: draft });
      router.back();
    };

    if (!contentSame) {
      Alert.alert(
        '保存正文',
        '保存后本篇所有划线将与正文偏移不一致，将清除本篇全部划线。是否继续？',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '保存',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                await softDeleteAllHighlightsForArticle(articleId);
                await persist();
              })();
            },
          },
        ]
      );
      return;
    }

    void persist();
  }

  function confirmDeleteArticle() {
    Alert.alert('删除文章', '将删除本文及本篇全部划线，不可恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await softDeleteArticle(articleId);
            router.replace('/(tabs)');
          })();
        },
      },
    ]);
  }

  const bottomPad = 16 + insets.bottom;

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.modalHeader, { paddingTop: insets.top + 6 }]}>
        <View style={styles.modalHeaderSide}>
          <Pressable onPress={goBack} style={styles.modalBackTap} hitSlop={12} accessibilityRole="button" accessibilityLabel="返回">
            <Ionicons name="chevron-back" size={26} color="#111827" />
          </Pressable>
        </View>
        <Text style={styles.modalHeaderTitle}>编辑</Text>
        <View style={[styles.modalHeaderSide, styles.modalHeaderSideEnd]}>
          <Pressable
            onPress={save}
            style={[styles.modalSaveBtn, loading && styles.modalSaveBtnDisabled]}
            disabled={loading}
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
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
      >
        <Text style={styles.fieldLabel}>标题</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          editable={!loading}
          placeholder="标题名称"
          placeholderTextColor="#9ca3af"
          style={styles.fieldInputTitle}
        />

        <Text style={[styles.fieldLabel, styles.fieldLabelSecond]}>正文</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          scrollEnabled
          editable={!loading}
          placeholder="正文内容，正文内容，正文内容"
          placeholderTextColor="#9ca3af"
          style={[styles.fieldInputBody, { height: bodyEditorHeight }]}
          textAlignVertical="top"
        />

        <Pressable
          onPress={confirmDeleteArticle}
          style={styles.deleteLinkWrap}
          accessibilityRole="button"
          accessibilityLabel="删除此文章"
        >
          <Text style={styles.deleteLink}>删除此文章</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
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
  modalSaveBtnDisabled: { opacity: 0.5 },
  modalSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalHeaderTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  fieldLabelSecond: { marginTop: 16 },
  fieldInputTitle: {
    marginTop: 8,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
  },
  fieldInputBody: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
    overflow: 'hidden',
  },
  deleteLinkWrap: { marginTop: 32, alignItems: 'center' },
  deleteLink: { fontSize: 16, color: '#ef4444', fontWeight: '600' },
});
