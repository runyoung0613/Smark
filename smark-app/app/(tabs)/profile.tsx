import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, hasSupabaseConfig } from '../../services/supabase';
import { runSyncOnce } from '../../services/sync';

export default function ProfileScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!hasSupabaseConfig()) return;
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
    })();
    if (!hasSupabaseConfig()) return;
    const supabase = getSupabase();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, next) => setSession(next));
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userEmail = session?.user?.email ?? '';
  const missingConfig = useMemo(() => !hasSupabaseConfig(), []);

  async function sendOtp() {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@')) {
      Alert.alert('提示', '请输入邮箱');
      return;
    }
    if (missingConfig) {
      Alert.alert('未配置 Supabase', '请在 smark-app/.env 写入 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY');
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOtp({ email: e });
      if (error) throw error;
      setStep('otp');
      Alert.alert('已发送', '请查看邮箱中的验证码（OTP），填入后完成登录。');
    } catch (err: any) {
      Alert.alert('发送失败', err?.message ?? String(err ?? '请稍后重试'));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    const e = email.trim().toLowerCase();
    const code = otp.trim();
    if (!e || !code) {
      Alert.alert('提示', '请填写邮箱与验证码');
      return;
    }
    if (missingConfig) {
      Alert.alert('未配置 Supabase', '请先配置 .env');
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.verifyOtp({ email: e, token: code, type: 'email' });
      if (error) throw error;
      setOtp('');
      setStep('email');
    } catch (err: any) {
      Alert.alert('验证失败', err?.message ?? '请检查验证码是否正确');
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err: any) {
      Alert.alert('退出失败', err?.message ?? '请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  async function syncNow() {
    setLoading(true);
    try {
      const res = await runSyncOnce();
      Alert.alert('同步完成', `推送 ${res.pushed} 条，拉取文章/划线/卡片：${res.pulled.articles}/${res.pulled.highlights}/${res.pulled.quick_cards}`);
    } catch (err: any) {
      Alert.alert('同步失败', err?.message ?? '请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>我的</Text>

      {missingConfig ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>未配置 Supabase</Text>
          <Text style={styles.warnText}>
            请复制 `smark-app/.env.example` 为 `smark-app/.env`，填写 `EXPO_PUBLIC_SUPABASE_URL` 与
            `EXPO_PUBLIC_SUPABASE_ANON_KEY` 后重启 `npx expo start`。
          </Text>
        </View>
      ) : null}

      {session ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>已登录</Text>
          <Text style={styles.cardText}>邮箱：{userEmail || '（未知）'}</Text>
          <Pressable onPress={syncNow} disabled={loading} style={[styles.btnSecondary, loading && styles.btnDisabled]}>
            <Text style={styles.btnSecondaryText}>{loading ? '处理中…' : '立即同步'}</Text>
          </Pressable>
          <Pressable onPress={signOut} disabled={loading} style={[styles.btn, loading && styles.btnDisabled]}>
            <Text style={styles.btnText}>{loading ? '处理中…' : '退出登录'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>登录 / 注册</Text>
          <Text style={styles.cardText}>使用邮箱验证码登录，后续用于多设备同步。</Text>

          <Text style={styles.label}>邮箱</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={styles.input}
          />

          {step === 'otp' ? (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>验证码（OTP）</Text>
              <TextInput
                value={otp}
                onChangeText={setOtp}
                placeholder="6 位验证码"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                style={styles.input}
              />
              <Pressable onPress={verifyOtp} disabled={loading} style={[styles.btn, loading && styles.btnDisabled]}>
                <Text style={styles.btnText}>{loading ? '验证中…' : '完成登录'}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStep('email');
                  setOtp('');
                }}
                disabled={loading}
                style={styles.linkBtn}
              >
                <Text style={styles.linkBtnText}>返回修改邮箱</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={sendOtp} disabled={loading} style={[styles.btn, loading && styles.btnDisabled]}>
              <Text style={styles.btnText}>{loading ? '发送中…' : '发送验证码'}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  card: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  cardText: { color: '#6b7280', lineHeight: 20, fontSize: 13 },
  label: { fontSize: 13, fontWeight: '800', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
  },
  btn: {
    marginTop: 6,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnSecondary: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '900' },
  btnSecondaryText: { color: '#111827', fontWeight: '900' },
  linkBtn: { alignSelf: 'flex-start', marginTop: 6 },
  linkBtnText: { color: '#2563eb', fontWeight: '900' },
  warnBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
  },
  warnTitle: { fontWeight: '900', color: '#9a3412' },
  warnText: { marginTop: 6, color: '#9a3412', lineHeight: 18, fontSize: 12 },
});

