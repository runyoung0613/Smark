import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { loadPersistedConnectionSettings, savePersistedConnectionSettings } from '../../services/appSettings';
import type { FontSizePreset, ReaderTheme } from '../../services/readerPrefs';
import { loadReaderPrefs, saveReaderPrefs } from '../../services/readerPrefs';
import { runSyncOnce } from '../../services/sync';
import { getSupabase, hasSupabaseConfig, hydrateSupabaseFromStorage, isSupabaseProjectUrl } from '../../services/supabase';

const THEME_LABEL: Record<ReaderTheme, string> = {
  light: '常规',
  eye: '护眼',
  dark: '夜间',
};

const FONT_LABEL: Record<FontSizePreset, string> = { sm: '小', md: '中', lg: '大' };

const THEME_ORDER: ReaderTheme[] = ['light', 'eye', 'dark'];
const FONT_ORDER: FontSizePreset[] = ['sm', 'md', 'lg'];

export default function ProfileScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);

  const [configEpoch, setConfigEpoch] = useState(0);
  const [supabaseUrlDraft, setSupabaseUrlDraft] = useState('');
  const [supabaseKeyDraft, setSupabaseKeyDraft] = useState('');
  const [persesUrlDraft, setPersesUrlDraft] = useState('');
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('light');
  const [fontSizePreset, setFontSizePreset] = useState<FontSizePreset>('md');
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [connLoaded, setConnLoaded] = useState(false);

  const missingConfig = !hasSupabaseConfig();
  const userEmail = session?.user?.email ?? '';

  const loadForms = useCallback(async () => {
    const c = await loadPersistedConnectionSettings();
    setSupabaseUrlDraft(c.supabaseUrl);
    setSupabaseKeyDraft(c.supabaseAnonKey);
    setPersesUrlDraft(c.persesApiUrl);
    const p = await loadReaderPrefs();
    setReaderTheme(p.readerTheme);
    setFontSizePreset(p.fontSizePreset);
    setPrefsLoaded(true);
    setConnLoaded(true);
  }, []);

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

  useEffect(() => {
    let mounted = true;
    let authUnsub: { unsubscribe: () => void } | null = null;

    void (async () => {
      if (!hasSupabaseConfig()) return;
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
    })();

    if (hasSupabaseConfig()) {
      const supabase = getSupabase();
      const { data: sub } = supabase.auth.onAuthStateChange((_evt, next) => setSession(next));
      authUnsub = sub.subscription;
    }

    return () => {
      mounted = false;
      authUnsub?.unsubscribe();
    };
  }, [configEpoch]);

  async function sendOtp() {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@')) {
      Alert.alert('提示', '请输入邮箱');
      return;
    }
    if (missingConfig) {
      Alert.alert('未配置 Supabase', '请在本页「服务与接口」保存有效的项目 URL 与 anon key，或在 .env 中配置 EXPO_PUBLIC_*');
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabase();
      const emailRedirectTo = Linking.createURL('/profile');
      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo },
      });
      if (error) throw error;
      setStep('otp');
      Alert.alert('已发送', '若邮件里是验证码（OTP）请填入；若邮件里是 Magic Link，请点击后会回到 App 自动登录。');
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
      Alert.alert('未配置 Supabase', '请先在本页保存服务配置或配置 .env');
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
      Alert.alert(
        '同步完成',
        `推送 ${res.pushed} 条，拉取文章/划线/卡片：${res.pulled.articles}/${res.pulled.highlights}/${res.pulled.quick_cards}`
      );
    } catch (err: any) {
      Alert.alert('同步失败', err?.message ?? '请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  async function saveConnectionSettings() {
    const url = supabaseUrlDraft.trim();
    const key = supabaseKeyDraft.trim();
    const perses = persesUrlDraft.trim();

    if (url && !isSupabaseProjectUrl(url)) {
      Alert.alert(
        'URL 无效',
        'Supabase 项目地址应为 https://<项目 ref>.supabase.co，不要粘贴 Dashboard 或 Edge Functions 的链接。'
      );
      return;
    }
    if ((url && !key) || (!url && key)) {
      Alert.alert('提示', '若要在本机保存 Supabase 配置，请同时填写项目 URL 与 anon key；也可留空两项以使用 .env 中的默认值。');
      return;
    }

    setLoading(true);
    try {
      await savePersistedConnectionSettings({
        supabaseUrl: url,
        supabaseAnonKey: key,
        persesApiUrl: perses,
      });
      await hydrateSupabaseFromStorage();
      setConfigEpoch((n) => n + 1);
      Alert.alert('已保存', '服务配置已写入本机。修改 Supabase 地址后若登录态异常，请退出并重新登录。');
    } catch (err: any) {
      Alert.alert('保存失败', err?.message ?? '请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  async function persistReader(next: { readerTheme?: ReaderTheme; fontSizePreset?: FontSizePreset }) {
    const theme = next.readerTheme ?? readerTheme;
    const font = next.fontSizePreset ?? fontSizePreset;
    setReaderTheme(theme);
    setFontSizePreset(font);
    await saveReaderPrefs({ readerTheme: theme, fontSizePreset: font });
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>我的</Text>

      {missingConfig ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>未检测到完整 Supabase 配置</Text>
          <Text style={styles.warnText}>
            可在下方「服务与接口」填写项目 URL 与 anon key（仅保存在本机），或在 smark-app/.env 中配置 EXPO_PUBLIC_SUPABASE_URL 与
            EXPO_PUBLIC_SUPABASE_ANON_KEY 后重新构建 / 重启开发服务。
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>服务与接口</Text>
        <Text style={styles.cardText}>
          下列 Supabase 项若留空，则使用打包时的环境变量（如有）。Perses 直连地址留空时，可在登录后走云端 perses_proxy。
        </Text>

        <Text style={styles.label}>Supabase 项目 URL</Text>
        <TextInput
          value={supabaseUrlDraft}
          onChangeText={setSupabaseUrlDraft}
          placeholder="https://xxxx.supabase.co"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          editable={connLoaded}
        />

        <Text style={[styles.label, { marginTop: 12 }]}>Supabase anon public key</Text>
        <TextInput
          value={supabaseKeyDraft}
          onChangeText={setSupabaseKeyDraft}
          placeholder="eyJ…（anon public key）"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
          editable={connLoaded}
        />

        <Text style={[styles.label, { marginTop: 12 }]}>Perses API URL（可选，直连）</Text>
        <TextInput
          value={persesUrlDraft}
          onChangeText={setPersesUrlDraft}
          placeholder="例如：https://your-domain.com/perses"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          editable={connLoaded}
        />

        <Pressable
          onPress={() => void saveConnectionSettings()}
          disabled={loading || !connLoaded}
          style={[styles.btn, (loading || !connLoaded) && styles.btnDisabled]}
        >
          <Text style={styles.btnText}>{loading ? '处理中…' : '保存服务配置'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>阅读偏好</Text>
        <Text style={styles.cardText}>与阅读页顶栏一致，在此修改后打开任意文章即生效。</Text>

        <Text style={styles.label}>画面主题</Text>
        <View style={styles.chipRow}>
          {THEME_ORDER.map((t) => (
            <Pressable
              key={t}
              onPress={() => void persistReader({ readerTheme: t })}
              disabled={!prefsLoaded}
              style={[styles.chip, readerTheme === t && styles.chipOn, !prefsLoaded && styles.btnDisabled]}
            >
              <Text style={[styles.chipText, readerTheme === t && styles.chipTextOn]}>{THEME_LABEL[t]}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: 12 }]}>正文字号</Text>
        <View style={styles.chipRow}>
          {FONT_ORDER.map((f) => (
            <Pressable
              key={f}
              onPress={() => void persistReader({ fontSizePreset: f })}
              disabled={!prefsLoaded}
              style={[styles.chip, fontSizePreset === f && styles.chipOn, !prefsLoaded && styles.btnDisabled]}
            >
              <Text style={[styles.chipText, fontSizePreset === f && styles.chipTextOn]}>{FONT_LABEL[f]}</Text>
            </Pressable>
          ))}
        </View>
      </View>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { padding: 16, paddingBottom: 32 },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  chipOn: { borderColor: '#111827', backgroundColor: '#111827' },
  chipText: { fontWeight: '800', color: '#374151', fontSize: 13 },
  chipTextOn: { color: '#fff' },
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
