import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { TabScreenHeader } from '../../components/TabScreenChrome';
import {
  getLearningActivityFeed,
  getLearningOverview,
  type ActivityFeedItem,
  type LearningOverview,
} from '../../services/db';
import { loadPersistedConnectionSettings, savePersistedConnectionSettings } from '../../services/appSettings';
import {
  DASHSCOPE_CHAT_MODEL_PRESETS,
  getDashScopeCompatibleModel,
  isDashScopeOpenAICompatibleUrl,
} from '../../services/persesMemory';
import { loadLastSyncAt, runSyncOnce } from '../../services/sync';
import { getSupabase, hasSupabaseConfig } from '../../services/supabase';

type MainTab = 'activity' | 'mine';

function formatActivityTime(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return d.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

function oneLine(text: string, max = 56) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function formatLastSyncDisplay(iso: string | null) {
  if (!iso) return '尚未同步';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '尚未同步';
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function ProfileScreen() {
  const [mainTab, setMainTab] = useState<MainTab>('mine');
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);

  const [persesKeyDraft, setPersesKeyDraft] = useState('');
  /** 与 Key 配对使用的 HTTPS 接入地址；留空则仅用构建变量 EXPO_PUBLIC_PERSES_HTTP_URL */
  const [persesUrlDraft, setPersesUrlDraft] = useState('');
  const [connLoaded, setConnLoaded] = useState(false);

  const [persesModelDraft, setPersesModelDraft] = useState('');
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [modelCustomDraft, setModelCustomDraft] = useState('');

  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const [activityOverview, setActivityOverview] = useState<LearningOverview | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const missingConfig = !hasSupabaseConfig();
  const userEmail = session?.user?.email ?? '';

  const refreshLastSync = useCallback(async () => {
    const v = await loadLastSyncAt();
    setLastSyncAt(v);
  }, []);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const [o, f] = await Promise.all([getLearningOverview(), getLearningActivityFeed(14)]);
      setActivityOverview(o);
      setActivityFeed(f);
    } catch {
      setActivityOverview(null);
      setActivityFeed([]);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshLastSync();
    }, [refreshLastSync])
  );

  useFocusEffect(
    useCallback(() => {
      if (mainTab !== 'activity') return;
      void loadActivity();
    }, [mainTab, loadActivity])
  );

  useEffect(() => {
    if (mainTab !== 'activity') return;
    void loadActivity();
  }, [mainTab, loadActivity]);

  const loadForms = useCallback(async () => {
    const c = await loadPersistedConnectionSettings();
    setPersesKeyDraft(c.persesApiKey);
    setPersesUrlDraft(c.persesApiUrl);
    setPersesModelDraft(c.persesDashScopeModel ?? '');
    setConnLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (mainTab !== 'mine') return;
      void loadForms();
    }, [mainTab, loadForms])
  );

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
  }, []);

  async function sendOtp() {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@')) {
      Alert.alert('提示', '请输入邮箱');
      return;
    }
    if (missingConfig) {
      Alert.alert(
        '未配置云服务',
        '登录与同步需要在构建时配置 EXPO_PUBLIC_SUPABASE_URL 与 EXPO_PUBLIC_SUPABASE_ANON_KEY（由开发者提供），或使用已预配置的安装包。'
      );
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
      Alert.alert(
        '未配置云服务',
        '登录与同步需要在构建时配置 EXPO_PUBLIC_SUPABASE_*（由开发者提供），或使用已预配置的安装包。'
      );
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
      await refreshLastSync();
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

  async function savePersesSettings() {
    const url = persesUrlDraft.trim();
    if (url && !/^https:\/\//i.test(url)) {
      Alert.alert('提示', '接入地址需为以 https:// 开头的完整 URL。');
      return;
    }
    setLoading(true);
    try {
      const cur = await loadPersistedConnectionSettings();
      await savePersistedConnectionSettings({
        ...cur,
        persesApiKey: persesKeyDraft.trim(),
        persesApiUrl: url,
        persesDashScopeModel: persesModelDraft.trim(),
      });
      Alert.alert('已保存', 'Perses 接入配置已写入本机，可在 Perses 页发起对话。');
    } catch (err: any) {
      Alert.alert('保存失败', err?.message ?? '请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  async function applyPersesModelChoice(id: string) {
    const t = id.trim();
    if (!t) {
      Alert.alert('提示', '请输入或选择模型 ID');
      return;
    }
    setPersesModelDraft(t);
    setModelCustomDraft('');
    setModelModalOpen(false);
    try {
      const cur = await loadPersistedConnectionSettings();
      await savePersistedConnectionSettings({ ...cur, persesDashScopeModel: t });
    } catch (err: any) {
      Alert.alert('保存失败', err?.message ?? '请稍后重试');
    }
  }

  async function clearPersesModelChoice() {
    setPersesModelDraft('');
    setModelCustomDraft('');
    setModelModalOpen(false);
    try {
      const cur = await loadPersistedConnectionSettings();
      await savePersistedConnectionSettings({ ...cur, persesDashScopeModel: '' });
    } catch (err: any) {
      Alert.alert('保存失败', err?.message ?? '请稍后重试');
    }
  }

  function openFeedItem(item: ActivityFeedItem) {
    if (item.kind === 'article') {
      router.push({ pathname: '/read/[id]', params: { id: item.id } });
      return;
    }
    if (item.kind === 'highlight') {
      router.push({
        pathname: '/read/[id]',
        params: { id: item.articleId, highlightId: item.id },
      });
      return;
    }
    router.push('/quick-cards');
  }

  const showDashModelPicker = isDashScopeOpenAICompatibleUrl(persesUrlDraft.trim());

  return (
    <View style={styles.screen}>
      <TabScreenHeader
        left={
          <View style={styles.segmentOuter}>
            <Pressable
              onPress={() => setMainTab('activity')}
              style={[styles.segmentCell, mainTab === 'activity' && styles.segmentCellActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: mainTab === 'activity' }}
            >
              <Text style={[styles.segmentLabel, mainTab === 'activity' && styles.segmentLabelActive]} numberOfLines={1}>
                学习动态
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMainTab('mine')}
              style={[styles.segmentCell, mainTab === 'mine' && styles.segmentCellActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: mainTab === 'mine' }}
            >
              <Text style={[styles.segmentLabel, mainTab === 'mine' && styles.segmentLabelActive]} numberOfLines={1}>
                个人中心
              </Text>
            </Pressable>
          </View>
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {mainTab === 'activity' ? (
          <View style={styles.activityRoot}>
            <Text style={styles.activityIntro}>本地阅读与复习摘要；统计不含已删除内容。</Text>
            {activityLoading && !activityOverview ? (
              <View style={styles.activityLoadingWrap}>
                <ActivityIndicator size="small" color="#6b7280" />
                <Text style={styles.activityLoadingText}>加载中…</Text>
              </View>
            ) : activityOverview ? (
              <View style={styles.heroShell}>
                <View style={styles.heroCard}>
                  <Text style={styles.heroEyebrow}>复习随机池 · 合计</Text>
                  <Text style={styles.heroValue}>{activityOverview.reviewPoolTotal}</Text>
                  <Text style={styles.heroCaption}>加入复习的划线 + Quick Card</Text>
                  <View style={styles.heroDivider} />
                  <View style={styles.heroGridRow}>
                    <View style={styles.heroCell}>
                      <Text style={styles.heroCellVal}>{activityOverview.articles}</Text>
                      <Text style={styles.heroCellLbl}>文章</Text>
                    </View>
                    <View style={[styles.heroCell, styles.heroCellSep]}>
                      <Text style={styles.heroCellVal}>{activityOverview.highlights}</Text>
                      <Text style={styles.heroCellLbl}>划线</Text>
                    </View>
                  </View>
                  <View style={[styles.heroGridRow, styles.heroGridRowSecond]}>
                    <View style={styles.heroCell}>
                      <Text style={styles.heroCellVal}>{activityOverview.quickCards}</Text>
                      <Text style={styles.heroCellLbl}>Quick Card</Text>
                    </View>
                    <View style={[styles.heroCell, styles.heroCellSep]}>
                      <Text style={styles.heroCellVal}>{activityOverview.highlightsInReview}</Text>
                      <Text style={styles.heroCellLbl}>加入复习</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.weekStrip}>
                  <View style={styles.weekChip}>
                    <Text style={styles.weekChipVal}>{activityOverview.last7d.newHighlights}</Text>
                    <Text style={styles.weekChipLbl}>7日新划线</Text>
                  </View>
                  <View style={styles.weekChip}>
                    <Text style={styles.weekChipVal}>{activityOverview.last7d.articlesTouched}</Text>
                    <Text style={styles.weekChipLbl}>7日文章更新</Text>
                  </View>
                  <View style={styles.weekChip}>
                    <Text style={styles.weekChipVal}>{activityOverview.last7d.quickCardsTouched}</Text>
                    <Text style={styles.weekChipLbl}>7日卡片变动</Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={styles.feedEmpty}>暂时无法读取本地学习数据。</Text>
            )}

            <Text style={[styles.activitySectionTitle, styles.activitySectionTitleSpaced]}>最近动态</Text>
            <Text style={styles.activityHint}>按更新时间排序；点按进入阅读或 Quick Card 管理。</Text>
            {!activityFeed.length && !activityLoading ? (
              <Text style={styles.feedEmpty}>暂无记录。导入文章、划线或添加 Quick Card 后会出现在这里。</Text>
            ) : null}
            {activityFeed.map((item) => {
              const iconName =
                item.kind === 'article'
                  ? ('document-text-outline' as const)
                  : item.kind === 'highlight'
                    ? ('bookmark-outline' as const)
                    : ('albums-outline' as const);
              return (
                <Pressable
                  key={`${item.kind}-${item.id}`}
                  onPress={() => openFeedItem(item)}
                  style={({ pressed }) => [styles.feedRow, pressed && styles.feedRowPressed]}
                  accessibilityRole="button"
                >
                  <View style={styles.feedRowMain}>
                    <View style={styles.feedIconCircle}>
                      <Ionicons name={iconName} size={20} color="#4b5563" />
                    </View>
                    <View style={styles.feedBody}>
                      <View style={styles.feedRowTop}>
                        <Text style={styles.feedKind}>
                          {item.kind === 'article' ? '文章' : item.kind === 'highlight' ? '划线' : 'Quick Card'}
                        </Text>
                        <Text style={styles.feedTime}>{formatActivityTime(item.time)}</Text>
                      </View>
                      {item.kind === 'article' ? (
                        <Text style={styles.feedTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                      ) : null}
                      {item.kind === 'highlight' ? (
                        <>
                          <Text style={styles.feedTitle} numberOfLines={2}>
                            {oneLine(item.quote, 88)}
                          </Text>
                          <Text style={styles.feedSub} numberOfLines={1}>
                            {item.articleTitle}
                          </Text>
                        </>
                      ) : null}
                      {item.kind === 'quick_card' ? (
                        <Text style={styles.feedTitle} numberOfLines={2}>
                          {oneLine(item.front, 88)}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#d1d5db" style={styles.feedChevron} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <>
            {missingConfig ? (
              <View style={styles.warnBox}>
                <Text style={styles.warnTitle}>未检测到云服务配置</Text>
                <Text style={styles.warnText}>
                  登录与同步依赖 Supabase，需在构建应用时写入 EXPO_PUBLIC_SUPABASE_URL 与 EXPO_PUBLIC_SUPABASE_ANON_KEY（开发者维护）；终端用户无需在此填写。
                </Text>
              </View>
            ) : null}

            {!session ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>登录 / 注册</Text>
                <Text style={styles.cardText}>使用邮箱验证码登录，用于多设备同步。</Text>

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
                    <Pressable onPress={verifyOtp} disabled={loading} style={[styles.btnSolid, loading && styles.btnDisabled]}>
                      <Text style={styles.btnSolidText}>{loading ? '验证中…' : '完成登录'}</Text>
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
                  <Pressable onPress={sendOtp} disabled={loading} style={[styles.btnSolid, loading && styles.btnDisabled]}>
                    <Text style={styles.btnSolidText}>{loading ? '发送中…' : '发送验证码'}</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>账号</Text>
                <Text style={styles.cardMetaLine}>邮箱：{userEmail || '（未知）'}</Text>
                <Text style={styles.syncMeta}>上次同步：{formatLastSyncDisplay(lastSyncAt)}</Text>
                <Pressable onPress={syncNow} disabled={loading} style={[styles.btnOutline, loading && styles.btnDisabled]}>
                  <Text style={styles.btnOutlineText}>{loading ? '处理中…' : '立即同步'}</Text>
                </Pressable>
                <Pressable onPress={() => void signOut()} disabled={loading} style={[styles.btnSolid, loading && styles.btnDisabled]}>
                  <Text style={styles.btnSolidText}>{loading ? '处理中…' : '退出登录'}</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.serviceCard}>
              <Text style={styles.serviceCardTitle}>Perses API Key</Text>
              <TextInput
                value={persesKeyDraft}
                onChangeText={setPersesKeyDraft}
                placeholder="SK-"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.serviceInput}
                editable={connLoaded}
              />
              <Text style={[styles.serviceFieldLabel, styles.serviceFieldLabelSpaced]}>Perses 接入地址（可选）</Text>
              <TextInput
                value={persesUrlDraft}
                onChangeText={setPersesUrlDraft}
                placeholder="https://example.com/v1/perses"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.serviceInput}
                editable={connLoaded}
              />
              {showDashModelPicker ? (
                <>
                  <Text style={[styles.serviceFieldLabel, styles.serviceFieldLabelSpaced]}>对话模型（百炼兼容）</Text>
                  <Pressable
                    onPress={() => {
                      setModelCustomDraft('');
                      setModelModalOpen(true);
                    }}
                    disabled={!connLoaded || loading}
                    style={[styles.modelPickerRow, (!connLoaded || loading) && styles.btnDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel="选择对话模型"
                  >
                    <View style={styles.modelPickerTextCol}>
                      <Text style={styles.modelPickerValue}>{getDashScopeCompatibleModel(persesModelDraft)}</Text>
                      <Text style={styles.modelPickerHint}>点按选择预设或自定义模型 ID</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                  </Pressable>
                </>
              ) : null}
              <Text style={styles.serviceHint}>
                使用 Key 时请填写 HTTPS 接入地址（与个人 Key 配对）；若留空地址，需安装包已内置 EXPO_PUBLIC_PERSES_HTTP_URL。
                {'\n'}
                若使用阿里云百炼「OpenAI 兼容」Base（…/compatible-mode/v1），填写 Base URL 后会出现「对话模型」入口；未单独设置时优先
                EXPO_PUBLIC_PERSES_DASHSCOPE_MODEL，否则为 qwen-turbo。
              </Text>
              <Pressable
                onPress={() => void savePersesSettings()}
                disabled={loading || !connLoaded}
                style={[styles.serviceSaveBtn, (loading || !connLoaded) && styles.btnDisabled]}
              >
                <Text style={styles.serviceSaveBtnText}>{loading ? '处理中…' : '保存服务配置'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={modelModalOpen} transparent animationType="fade" onRequestClose={() => setModelModalOpen(false)}>
        <View style={styles.modelModalRoot}>
          <Pressable style={styles.modelModalBackdrop} onPress={() => setModelModalOpen(false)} accessibilityLabel="关闭" />
          <View style={styles.modelModalCard}>
            <Text style={styles.modelModalTitle}>选择对话模型</Text>
            <Text style={styles.modelModalSub}>用于百炼 OpenAI 兼容接口的 model 参数，选择后即写入本机。</Text>
            <ScrollView
              style={styles.modelModalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {DASHSCOPE_CHAT_MODEL_PRESETS.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => void applyPersesModelChoice(m.id)}
                  style={[styles.modelModalRow, persesModelDraft === m.id && styles.modelModalRowSelected]}
                >
                  <Text style={styles.modelModalRowTitle}>{m.title}</Text>
                  <Text style={styles.modelModalRowSub}>{m.subtitle}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => void clearPersesModelChoice()} style={styles.modelModalRowMuted}>
                <Text style={styles.modelModalRowTitle}>使用默认</Text>
                <Text style={styles.modelModalRowSub}>清除本机模型名；将使用环境变量或 qwen-turbo</Text>
              </Pressable>
              <Text style={[styles.serviceFieldLabel, styles.serviceFieldLabelSpaced]}>自定义模型 ID</Text>
              <TextInput
                value={modelCustomDraft}
                onChangeText={setModelCustomDraft}
                placeholder="例如 qwen-vl-plus"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.serviceInput}
              />
              <Pressable onPress={() => void applyPersesModelChoice(modelCustomDraft)} style={styles.modelModalCustomBtn}>
                <Text style={styles.modelModalCustomBtnText}>使用自定义 ID</Text>
              </Pressable>
            </ScrollView>
            <Pressable onPress={() => setModelModalOpen(false)} style={styles.modelModalDismiss}>
              <Text style={styles.modelModalDismissText}>关 闭</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, flexGrow: 1, backgroundColor: '#fff' },
  segmentOuter: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    backgroundColor: '#eceef2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    alignSelf: 'stretch',
  },
  segmentCell: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentCellActive: { backgroundColor: '#111827' },
  segmentLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  segmentLabelActive: { color: '#fff' },
  activityRoot: { paddingBottom: 8 },
  activityIntro: {
    fontSize: 13,
    lineHeight: 20,
    color: '#6b7280',
    marginBottom: 4,
  },
  activitySectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 4 },
  activitySectionTitleSpaced: { marginTop: 22 },
  activityHint: { marginTop: 6, fontSize: 12, color: '#9ca3af', lineHeight: 18 },
  activityLoadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  activityLoadingText: { fontSize: 14, color: '#6b7280' },
  heroShell: { marginTop: 8, gap: 12 },
  heroCard: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e8eaee',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 2 },
    }),
  },
  heroEyebrow: { fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 0.2 },
  heroValue: {
    marginTop: 6,
    fontSize: 40,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -1,
  },
  heroCaption: { marginTop: 4, fontSize: 13, color: '#9ca3af', lineHeight: 18 },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginTop: 16,
    marginBottom: 4,
  },
  heroGridRow: { flexDirection: 'row', marginTop: 12 },
  heroGridRowSecond: { marginTop: 0, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eef0f3' },
  heroCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  heroCellSep: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#eef0f3',
  },
  heroCellVal: { fontSize: 20, fontWeight: '800', color: '#1f2937' },
  heroCellLbl: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#6b7280' },
  weekStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekChip: {
    flexGrow: 1,
    minWidth: 96,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  weekChipVal: { fontSize: 18, fontWeight: '800', color: '#111827' },
  weekChipLbl: { marginTop: 4, fontSize: 10, fontWeight: '700', color: '#6b7280', textAlign: 'center' },
  feedEmpty: {
    marginTop: 12,
    fontSize: 14,
    color: '#9ca3af',
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  feedRow: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8eaee',
    backgroundColor: '#fff',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  feedRowPressed: { opacity: 0.9, backgroundColor: '#fafbfc' },
  feedRowMain: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, gap: 12 },
  feedIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedBody: { flex: 1, minWidth: 0 },
  feedChevron: { marginLeft: 4 },
  feedRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  feedKind: { fontSize: 11, fontWeight: '800', color: '#2563eb', letterSpacing: 0.3 },
  feedTime: { fontSize: 11, color: '#9ca3af' },
  feedTitle: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: '#111827' },
  feedSub: { marginTop: 4, fontSize: 12, color: '#6b7280' },
  card: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#fff',
    gap: 10,
  },
  serviceCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 15,
    backgroundColor: '#fff',
  },
  serviceCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  serviceFieldLabel: { fontSize: 13, fontWeight: '800', color: '#111827' },
  serviceFieldLabelSpaced: { marginTop: 14 },
  serviceHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#6b7280',
  },
  serviceInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  serviceSaveBtn: {
    marginTop: 14,
    backgroundColor: '#111827',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  serviceSaveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modelPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
  },
  modelPickerTextCol: { flex: 1, paddingRight: 8 },
  modelPickerValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  modelPickerHint: { marginTop: 2, fontSize: 12, color: '#6b7280' },
  modelModalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modelModalBackdrop: { ...StyleSheet.absoluteFillObject },
  modelModalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
    maxHeight: '82%',
  },
  modelModalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  modelModalSub: { marginTop: 4, fontSize: 13, color: '#6b7280', lineHeight: 18 },
  modelModalScroll: { marginTop: 14, maxHeight: 400 },
  modelModalRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  modelModalRowSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  modelModalRowMuted: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#fafafa',
  },
  modelModalRowTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  modelModalRowSub: { marginTop: 2, fontSize: 12, color: '#6b7280' },
  modelModalCustomBtn: {
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  modelModalCustomBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modelModalDismiss: { marginTop: 4, paddingVertical: 12, alignItems: 'center' },
  modelModalDismissText: { fontSize: 15, fontWeight: '700', color: '#6b7280' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  cardText: { color: '#6b7280', lineHeight: 20, fontSize: 14 },
  cardMetaLine: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  syncMeta: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  label: { fontSize: 13, fontWeight: '800', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#111827',
    backgroundColor: '#fff',
  },
  btnSolid: {
    marginTop: 4,
    backgroundColor: '#111827',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnSolidText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnOutline: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnOutlineText: { color: '#111827', fontWeight: '800', fontSize: 15 },
  btnDisabled: { opacity: 0.55 },
  linkBtn: { alignSelf: 'flex-start', marginTop: 4 },
  linkBtnText: { color: '#2563eb', fontWeight: '800' },
  warnBox: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
  },
  warnTitle: { fontWeight: '900', color: '#9a3412' },
  warnText: { marginTop: 6, color: '#9a3412', lineHeight: 18, fontSize: 12 },
});
