import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  loadPersesMemoryFiles,
  resetPersesMemoryToBundledDefaults,
  saveAllPersesMemoryFiles,
} from '../services/persesMemory';
import { DEFAULT_MEMORY_MD, DEFAULT_SOUL_MD, DEFAULT_USER_MD } from '../services/persesBundled';

type MemoryTab = 'soul' | 'user' | 'memory';

const TAB_META: Record<
  MemoryTab,
  { short: string; title: string; hint: string; placeholder: string }
> = {
  soul: {
    short: 'SOUL',
    title: '灵魂与人格',
    hint: '助手是谁、语气与边界（对应 SOUL.md）。',
    placeholder: 'Perses 是谁、如何说话…',
  },
  user: {
    short: 'USER',
    title: '关于你',
    hint: '你的称呼、偏好与禁忌（对应 USER.md）。',
    placeholder: '称呼、偏好、禁忌…',
  },
  memory: {
    short: 'MEMORY',
    title: '长期记忆',
    hint: '约定、里程碑与重要事实（对应 MEMORY.md）。',
    placeholder: '约定、里程碑、重要事实…',
  },
};

export default function PersesMemoryScreen() {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const editorMinH = useMemo(
    () => Math.round(Math.min(440, Math.max(240, winH * 0.4))),
    [winH]
  );

  const [tab, setTab] = useState<MemoryTab>('soul');
  const [soulMd, setSoulMd] = useState('');
  const [userMd, setUserMd] = useState('');
  const [memoryMd, setMemoryMd] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const f = await loadPersesMemoryFiles();
      setSoulMd(f.soulMd);
      setUserMd(f.userMd);
      setMemoryMd(f.memoryMd);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activeText =
    tab === 'soul' ? soulMd : tab === 'user' ? userMd : memoryMd;
  const setActiveText = useCallback(
    (next: string) => {
      if (tab === 'soul') setSoulMd(next);
      else if (tab === 'user') setUserMd(next);
      else setMemoryMd(next);
    },
    [tab]
  );

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveAllPersesMemoryFiles({ soulMd, userMd, memoryMd });
      Alert.alert('已保存', 'Perses 记忆与人设已写入本机。');
    } catch {
      Alert.alert('保存失败', '请稍后重试');
    } finally {
      setSaving(false);
    }
  }, [soulMd, userMd, memoryMd]);

  const onReset = useCallback(() => {
    Alert.alert('恢复内置默认？', '将清除你对 SOUL / USER / MEMORY 的本地修改，还原为软件内置模板。', [
      { text: '取消', style: 'cancel' },
      {
        text: '恢复',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await resetPersesMemoryToBundledDefaults();
            setSoulMd(DEFAULT_SOUL_MD);
            setUserMd(DEFAULT_USER_MD);
            setMemoryMd(DEFAULT_MEMORY_MD);
            Alert.alert('已恢复', '已使用内置 SOUL / USER / MEMORY 模板。');
          })();
        },
      },
    ]);
  }, []);

  const padBottom = 20 + insets.bottom;
  const meta = TAB_META[tab];

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.muted}>加载中…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: padBottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
      >
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>三份 Markdown，仅存本机</Text>
          <Text style={styles.introBody}>
            切换上方标签编辑 SOUL / USER / MEMORY；保存会一次性写入三份文件。
          </Text>
        </View>

        <View style={styles.segmentOuter}>
          {(['soul', 'user', 'memory'] as const).map((key) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[styles.segmentCell, tab === key && styles.segmentCellActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === key }}
              accessibilityLabel={TAB_META[key].title}
            >
              <Text style={[styles.segmentShort, tab === key && styles.segmentShortActive]} numberOfLines={1}>
                {TAB_META[key].short}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{meta.title}</Text>
          <Text style={styles.sectionHint}>{meta.hint}</Text>
        </View>

        <TextInput
          value={activeText}
          onChangeText={setActiveText}
          multiline
          textAlignVertical="top"
          style={[styles.input, { minHeight: editorMinH }]}
          placeholder={meta.placeholder}
          placeholderTextColor="#9ca3af"
        />

        <View style={styles.footerActions}>
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={[styles.btnPrimary, saving && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="保存全部"
          >
            <Text style={styles.btnPrimaryText}>{saving ? '保存中…' : '保存全部'}</Text>
          </Pressable>
          <Pressable
            onPress={onReset}
            disabled={saving}
            style={styles.btnGhost}
            accessibilityRole="button"
          >
            <Text style={styles.btnGhostText}>恢复内置默认</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#fff' },
  muted: { color: '#6b7280', fontSize: 14 },

  introCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 16,
  },
  introTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  introBody: { marginTop: 6, fontSize: 13, lineHeight: 19, color: '#6b7280' },

  segmentOuter: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    gap: 4,
  },
  segmentCell: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentCellActive: {
    backgroundColor: '#111827',
  },
  segmentShort: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
    letterSpacing: 0.3,
  },
  segmentShortActive: {
    color: '#fff',
  },

  sectionHead: {
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  sectionHint: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },

  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
    lineHeight: 21,
    color: '#111827',
    backgroundColor: '#fafafa',
  },

  footerActions: {
    marginTop: 22,
    gap: 10,
  },
  btnPrimary: {
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnGhost: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  btnGhostText: { color: '#374151', fontWeight: '700', fontSize: 14 },
});
