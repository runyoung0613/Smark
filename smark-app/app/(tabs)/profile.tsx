import { StyleSheet, Text, View } from 'react-native';

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>我的</Text>
      <Text style={styles.sub}>MVP 阶段先放占位：后续这里接入 Supabase 登录与同步。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  sub: { marginTop: 10, color: '#6b7280', lineHeight: 22 },
});

