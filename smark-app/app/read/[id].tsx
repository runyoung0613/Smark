import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { createHighlight, DbHighlight, getArticle, listHighlights } from '../../services/db';
import {
  DEFAULT_READER_PREFS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  loadReaderPrefs,
  loadScrollY,
  ReaderPrefs,
  ReaderTheme,
  saveReaderPrefs,
  saveScrollY,
} from '../../services/readerPrefs';

type SelectionMessage = {
  type: 'selection';
  quote: string;
  start: number;
  end: number;
};

type ScrollMessage = {
  type: 'scroll';
  y: number;
};

type WvMessage = SelectionMessage | ScrollMessage;

type BuildHtmlOptions = {
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
};

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function themeCssVars(theme: ReaderTheme): string {
  if (theme === 'dark') {
    return `
      --bg: #0f172a;
      --text: #e2e8f0;
      --hl-bg: rgba(250, 204, 21, 0.35);
      --hl-border: rgba(250, 204, 21, 0.45);
    `;
  }
  return `
    --bg: #ffffff;
    --text: #111827;
    --hl-bg: rgba(250, 204, 21, 0.55);
    --hl-border: rgba(234, 179, 8, 0.35);
  `;
}

function buildHtml(content: string, highlights: DbHighlight[], opts: BuildHtmlOptions) {
  const active = highlights
    .filter((h) => h.deleted_at == null)
    .map((h) => ({ start: h.start, end: h.end }))
    .filter((h) => Number.isFinite(h.start) && Number.isFinite(h.end) && h.start >= 0 && h.end > h.start)
    .sort((a, b) => b.start - a.start);

  let raw = content;
  for (const h of active) {
    if (h.end > raw.length) continue;
    const before = raw.slice(0, h.start);
    const mid = raw.slice(h.start, h.end);
    const after = raw.slice(h.end);
    raw = before + `[[[H]]]${mid}[[[/H]]]` + after;
  }
  const htmlText = escapeHtml(raw)
    .replace(/\[\[\[H\]\]\]/g, `<span class="hl">`)
    .replace(/\[\[\[\/H\]\]\]/g, `</span>`);

  const vars = themeCssVars(opts.theme);
  const fs = opts.fontSize;
  const lh = opts.lineHeight;

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
  <style>
    :root {
      ${vars}
      --font-size: ${fs}px;
      --line-height: ${lh};
    }
    html, body { margin: 0; padding: 0; background: var(--bg); }
    body {
      font-family: -apple-system, Roboto, "Segoe UI", Arial, sans-serif;
      padding: 16px;
      padding-bottom: 32px;
      font-size: var(--font-size);
      line-height: var(--line-height);
      color: var(--text);
      -webkit-text-size-adjust: 100%;
    }
    .hl {
      background: var(--hl-bg);
      border-radius: 4px;
      padding: 0 2px;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    #content {
      white-space: pre-wrap;
      max-width: 40rem;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <div id="content">${htmlText}</div>
  <script>
    (function() {
      function getOffsets(range) {
        const root = document.getElementById('content');
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let offset = 0;
        let start = -1;
        let end = -1;
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const len = node.nodeValue ? node.nodeValue.length : 0;
          if (node === range.startContainer) {
            start = offset + range.startOffset;
          }
          if (node === range.endContainer) {
            end = offset + range.endOffset;
          }
          offset += len;
        }
        return { start: start, end: end };
      }

      function postSelection() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const quote = sel.toString();
        if (!quote || quote.trim().length === 0) return;
        const offsets = getOffsets(range);
        if (offsets.start < 0 || offsets.end <= offsets.start) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'selection',
          quote: quote,
          start: offsets.start,
          end: offsets.end
        }));
      }

      var scrollTimer = null;
      function postScroll() {
        var y = window.scrollY || document.documentElement.scrollTop || 0;
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scroll', y: y }));
        }, 250);
      }

      window.addEventListener('scroll', postScroll, { passive: true });

      document.addEventListener('mouseup', function() { setTimeout(postSelection, 10); });
      document.addEventListener('touchend', function() { setTimeout(postSelection, 10); });
    })();
  </script>
</body>
</html>`;
}

export default function ReadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const articleId = String(id ?? '');
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const scrollYRef = useRef(0);
  const scrollPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [title, setTitle] = useState<string>('阅读');
  const [content, setContent] = useState<string>('');
  const [highlights, setHighlights] = useState<DbHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_READER_PREFS);
  const [immersive, setImmersive] = useState(false);

  const persistScrollToStorage = useCallback(
    (y: number) => {
      if (scrollPersistTimer.current) clearTimeout(scrollPersistTimer.current);
      scrollPersistTimer.current = setTimeout(() => {
        void saveScrollY(articleId, y);
      }, 400);
    },
    [articleId]
  );

  useEffect(() => {
    let cancelled = false;
    void loadReaderPrefs().then((p) => {
      if (!cancelled) setPrefs(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!articleId) return;
    let cancelled = false;
    void loadScrollY(articleId).then((y) => {
      if (!cancelled) scrollYRef.current = y;
    });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  async function refresh() {
    setLoading(true);
    try {
      const a = await getArticle(articleId);
      if (!a) {
        Alert.alert('未找到文章', '可能已被删除');
        return;
      }
      const hs = await listHighlights(articleId);
      setTitle(a.title);
      setContent(a.content);
      setHighlights(hs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const html = useMemo(
    () => buildHtml(content, highlights, prefs),
    [content, highlights, prefs]
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        webRef.current?.injectJavaScript(`
          (function(){
            var y = window.scrollY || document.documentElement.scrollTop || 0;
            window.ReactNativeWebView.postMessage(JSON.stringify({type:'scroll', y: y}));
          })(); true;
        `);
      };
    }, [])
  );

  function applyScrollRestore() {
    const y = Math.floor(scrollYRef.current);
    if (y <= 0) return;
    webRef.current?.injectJavaScript(`window.scrollTo(0, ${y}); true;`);
  }

  function bumpFontSize(delta: number) {
    setPrefs((p) => {
      const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, p.fontSize + delta));
      if (next === p.fontSize) return p;
      const merged = { ...p, fontSize: next };
      void saveReaderPrefs(merged);
      return merged;
    });
  }

  function toggleTheme() {
    setPrefs((p) => {
      const nextTheme: ReaderTheme = p.theme === 'light' ? 'dark' : 'light';
      const merged: ReaderPrefs = { ...p, theme: nextTheme };
      void saveReaderPrefs(merged);
      return merged;
    });
  }

  function toggleLineHeight() {
    setPrefs((p) => {
      const nextLoose = 1.9;
      const nextTight = 1.65;
      const next = p.lineHeight >= 1.85 ? nextTight : nextLoose;
      const merged = { ...p, lineHeight: next };
      void saveReaderPrefs(merged);
      return merged;
    });
  }

  async function onMessage(event: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as WvMessage;
      if (msg.type === 'scroll') {
        const y = Number(msg.y);
        if (!Number.isFinite(y) || y < 0) return;
        scrollYRef.current = y;
        persistScrollToStorage(y);
        return;
      }
      if (msg.type !== 'selection') return;
      const quote = msg.quote.trim();
      if (!quote) return;
      if (msg.start < 0 || msg.end <= msg.start) return;
      if (msg.end > content.length) return;
      await createHighlight({ articleId, start: msg.start, end: msg.end, quote });
      const hs = await listHighlights(articleId);
      setHighlights(hs);
    } catch {
      // ignore
    }
  }

  const openHighlights = useCallback(() => {
    router.push({ pathname: '/highlights/[id]', params: { id: articleId } });
  }, [articleId]);

  const headerTint = prefs.theme === 'dark' ? '#f8fafc' : '#111827';
  const headerBg = prefs.theme === 'dark' ? '#0f172a' : '#ffffff';

  const shellBg = prefs.theme === 'dark' ? '#0f172a' : '#fff';
  const topBarBorder = prefs.theme === 'dark' ? '#1e293b' : '#e5e7eb';

  return (
    <View style={[styles.container, { backgroundColor: shellBg }]}>
      <Stack.Screen
        options={{
          title,
          headerShown: !immersive,
          headerStyle: { backgroundColor: headerBg },
          headerTintColor: headerTint,
          headerTitleStyle: { color: headerTint },
          headerRight: immersive
            ? () => null
            : () => (
                <View style={styles.headerBtns}>
                  <Pressable onPress={() => bumpFontSize(-1)} style={styles.hdrBtn} hitSlop={6}>
                    <Text style={[styles.hdrBtnText, { color: headerTint }]}>A−</Text>
                  </Pressable>
                  <Pressable onPress={() => bumpFontSize(1)} style={styles.hdrBtn} hitSlop={6}>
                    <Text style={[styles.hdrBtnText, { color: headerTint }]}>A+</Text>
                  </Pressable>
                  <Pressable onPress={toggleLineHeight} style={styles.hdrBtn} hitSlop={6}>
                    <Text style={[styles.hdrBtnText, { color: headerTint }]}>行</Text>
                  </Pressable>
                  <Pressable onPress={toggleTheme} style={styles.hdrBtn} hitSlop={6}>
                    <Text style={[styles.hdrBtnText, { color: headerTint }]}>
                      {prefs.theme === 'dark' ? '日' : '夜'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setImmersive(true)} style={styles.hdrBtn} hitSlop={6}>
                    <Text style={[styles.hdrBtnText, { color: headerTint }]}>沉浸</Text>
                  </Pressable>
                  <Pressable onPress={openHighlights} style={styles.hdrBtn} hitSlop={6} disabled={loading}>
                    <Text style={[styles.hdrBtnText, { color: headerTint }]}>划线</Text>
                  </Pressable>
                </View>
              ),
        }}
      />

      {!immersive ? (
        <View style={[styles.topBar, { borderBottomColor: topBarBorder, backgroundColor: headerBg }]}>
          <Text style={[styles.topHint, { color: prefs.theme === 'dark' ? '#94a3b8' : '#6b7280' }]}>
            长按或划选文字即可高亮
          </Text>
          <Pressable
            onPress={openHighlights}
            style={[styles.secondaryBtn, { borderColor: topBarBorder }]}
            disabled={loading}
          >
            <Text style={[styles.secondaryBtnText, { color: headerTint }]}>划线列表</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={prefs.theme === 'dark' ? '#e2e8f0' : '#111827'} />
        </View>
      ) : (
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html }}
          onMessage={onMessage}
          onLoadEnd={applyScrollRestore}
          style={styles.webview}
        />
      )}

      {immersive && !loading ? (
        <View
          style={[
            styles.fabCol,
            {
              bottom: 16 + insets.bottom,
              right: 12 + insets.right,
            },
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={openHighlights}
            style={[styles.fab, { backgroundColor: prefs.theme === 'dark' ? '#334155' : '#111827' }]}
          >
            <Text style={styles.fabText}>划线</Text>
          </Pressable>
          <Pressable
            onPress={() => setImmersive(false)}
            style={[styles.fab, styles.fabSecondary, { borderColor: topBarBorder }]}
          >
            <Text style={[styles.fabTextSecondary, { color: headerTint }]}>退出沉浸</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  hdrBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginHorizontal: 2,
  },
  hdrBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  topBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  topHint: {
    flex: 1,
    fontSize: 12,
  },
  secondaryBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  secondaryBtnText: { fontWeight: '700' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabCol: {
    position: 'absolute',
    alignItems: 'flex-end',
    gap: 10,
  },
  fab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  fabSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    elevation: 0,
    shadowOpacity: 0,
  },
  fabText: { color: '#fff', fontWeight: '800' },
  fabTextSecondary: { fontWeight: '800' },
});
