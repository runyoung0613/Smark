import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createArticle } from '../services/db';

export default function ImportScreen() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSave() {
    const t = title.trim();
    const c = content.trim();
    if (!t) {
      Alert.alert('提示', '请填写标题');
      return;
    }
    if (!c) {
      Alert.alert('提示', '请粘贴正文内容');
      return;
    }
    setSaving(true);
    try {
      const id = await createArticle({ title: t, content: c });
      router.replace({ pathname: '/read/[id]', params: { id } });
    } catch (e) {
      Alert.alert('保存失败', '请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>标题</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="例如：认知心理学读书笔记"
        style={styles.input}
      />

      <Text style={[styles.label, { marginTop: 16 }]}>正文（粘贴）</Text>
      <TextInput
        value={content}
        onChangeText={setContent}
        placeholder="把文章内容粘贴到这里…"
        style={[styles.input, styles.textarea]}
        multiline
        textAlignVertical="top"
      />

      <Pressable onPress={onSave} disabled={saving} style={[styles.btn, saving && styles.btnDisabled]}>
        <Text style={styles.btnText}>{saving ? '保存中…' : '保存并阅读'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  label: { fontSize: 14, fontWeight: '700', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    color: '#111827',
  },
  textarea: { minHeight: 240 },
  btn: {
    marginTop: 20,
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800' },
});

