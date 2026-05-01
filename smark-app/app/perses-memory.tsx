import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  loadPersesMemoryFiles,
  resetPersesMemoryToBundledDefaults,
  saveAllPersesMemoryFiles,
} from '../services/persesMemory';
import { DEFAULT_MEMORY_MD, DEFAULT_SOUL_MD, DEFAULT_USER_MD } from '../services/persesBundled';

export default function PersesMemoryScreen() {
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.muted}>加载中…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>记忆与人设</Text>
      <Text style={styles.sub}>对应 Perses 的 SOUL.md、USER.md、MEMORY.md，保存在本机。</Text>

      <View style={styles.actions}>
        <Pressable onPress={onSave} disabled={saving} style={[styles.btn, styles.btnPrimary, saving && styles.btnDisabled]}>
          <Text style={styles.btnPrimaryText}>{saving ? '保存中…' : '保存'}</Text>
        </Pressable>
        <Pressable onPress={onReset} disabled={saving} style={[styles.btn, styles.btnGhost]}>
          <Text style={styles.btnGhostText}>恢复内置默认</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>SOUL.md — 灵魂与人格</Text>
      <TextInput
        value={soulMd}
        onChangeText={setSoulMd}
        multiline
        textAlignVertical="top"
        style={styles.input}
        placeholder="Perses 是谁、如何说话…"
      />

      <Text style={styles.label}>USER.md — 关于你</Text>
      <TextInput
        value={userMd}
        onChangeText={setUserMd}
        multiline
        textAlignVertical="top"
        style={styles.input}
        placeholder="称呼、偏好、禁忌…"
      />

      <Text style={styles.label}>MEMORY.md — 长期记忆</Text>
      <TextInput
        value={memoryMd}
        onChangeText={setMemoryMd}
        multiline
        textAlignVertical="top"
        style={[styles.input, styles.inputLast]}
        placeholder="约定、里程碑、重要事实…"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#fff' },
  muted: { color: '#6b7280', fontSize: 14 },
  title: { fontSize: 22, fontWeight: '900', color: '#111827' },
  sub: { marginTop: 8, fontSize: 13, lineHeight: 18, color: '#6b7280' },
  actions: { marginTop: 14, flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#111827' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  btnDisabled: { opacity: 0.55 },
  btnPrimaryText: { color: '#fff', fontWeight: '900' },
  btnGhostText: { color: '#111827', fontWeight: '800' },
  label: { marginTop: 18, fontSize: 14, fontWeight: '800', color: '#111827' },
  input: {
    marginTop: 8,
    minHeight: 160,
    maxHeight: 320,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    color: '#111827',
  },
  inputLast: { marginBottom: 8 },
});
