import { Stack, router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { createHighlight, DbHighlight, getArticle, listHighlights } from '../../services/db';
import {
  FontSizePreset,
  loadReaderPrefs,
  loadScrollPosition,
  ReaderTheme,
  saveReaderPrefs,
  saveScrollPosition,
} from '../../services/readerPrefs';

const FONT_PX: Record<FontSizePreset, number> = { sm: 15, md: 17, lg: 19 };

const THEME_VARS: Record<
  ReaderTheme,
  { bg: string; fg: string; hl: string; barBg: string; barBorder: string; barText: string; muted: string }
> = {
  light: {
    bg: '#ffffff',
    fg: '#111827',
    hl: 'rgba(250, 204, 21, 0.55)',
    barBg: '#ffffff',
    barBorder: '#e5e7eb',
    barText: '#111827',
    muted: '#6b7280',
  },
  eye: {
    bg: '#e8f2eb',
    fg: '#142018',
    hl: 'rgba(200, 180, 60, 0.42)',
    barBg: '#ddeee2',
    barBorder: '#b8d4c4',
    barText: '#142018',
    muted: '#3d5347',
  },
  dark: {
    bg: '#121212',
    fg: '#e8e8e8',
    hl: 'rgba(220, 180, 70, 0.4)',
    barBg: '#1a1a1a',
    barBorder: '#2d2d2d',
    barText: '#e8e8e8',
    muted: '#9ca3af',
  },
};

type SelectionMessage = {
  type: 'selection';
  quote: string;
  start: number;
  end: number;
};

type SelectionEmptyMessage = { type: 'selectionEmpty' };
type SelectionRectMessage = {
  type: 'selectionRect';
  rect: { top: number; left: number; width: number; height: number };
};
type ScrollMessage = { type: 'scroll'; y: number; h?: number; vh?: number };
type TapMessage = { type: 'tap' };
type WebToNativeMessage =
  | SelectionMessage
  | SelectionEmptyMessage
  | SelectionRectMessage
  | ScrollMessage
  | TapMessage;

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildHtml(
  content: string,
  highlights: DbHighlight[],
  opts: { theme: ReaderTheme; fontSize: FontSizePreset }
) {
  const active = highlights
    .filter((h) => h.deleted_at == null)
    .map((h) => ({ id: h.id, start: h.start, end: h.end }))
    .filter((h) => Number.isFinite(h.start) && Number.isFinite(h.end) && h.start >= 0 && h.end > h.start)
    .sort((a, b) => b.start - a.start);

  let raw = content;
  for (const h of active) {
    if (h.end > raw.length) continue;
    const before = raw.slice(0, h.start);
    const mid = raw.slice(h.start, h.end);
    const after = raw.slice(h.end);
    raw = before + `[[[H:${h.id}]]]${mid}[[[/H]]]` + after;
  }
  const htmlText = escapeHtml(raw)
    .replace(/\[\[\[H:([0-9a-f-]+)\]\]\]/gi, '<span class="hl" data-hl-id="$1">')
    .replace(/\[\[\[\/H\]\]\]/g, `</span>`);

  const t = THEME_VARS[opts.theme];
  const fs = FONT_PX[opts.fontSize];

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta charset="utf-8" />
  <style>
    * { -webkit-tap-highlight-color: transparent; }
    :root {
      --bg: ${t.bg};
      --fg: ${t.fg};
      --hl: ${t.hl};
      --fs: ${fs}px;
    }
    html, body { margin: 0; background: var(--bg); }
    body {
      font-family: -apple-system, Roboto, "Segoe UI", Arial, sans-serif;
      padding: 18px 16px;
      font-size: var(--fs);
      line-height: 1.85;
      color: var(--fg);
    }
    .hl { background: var(--hl); border-radius: 4px; padding: 0 2px; }
    #content {
      white-space: pre-wrap;
      word-break: break-word;
      -webkit-user-select: text;
      user-select: text;
    }
  </style>
</head>
<body>
  <div id="content">${htmlText}</div>
  <script>
    (function() {
      function isInsideHighlight(node) {
        var el = node && node.nodeType === 1 ? node : (node && node.parentElement ? node.parentElement : null);
        while (el) {
          if (el.classList && el.classList.contains('hl')) return true;
          el = el.parentElement;
        }
        return false;
      }

      function unwrapHighlightSpan(span) {
        if (!span || !span.parentNode) return;
        var parent = span.parentNode;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
        parent.normalize();
      }

      function findTextPosition(root, index) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var offset = 0;
        while (walker.nextNode()) {
          var node = walker.currentNode;
          var len = node.nodeValue ? node.nodeValue.length : 0;
          if (index <= offset + len) {
            return { node: node, offset: Math.max(0, index - offset) };
          }
          offset += len;
        }
        return null;
      }

      function applyHighlightByOffsets(id, start, end) {
        var root = document.getElementById('content');
        if (!root) return false;
        if (!id || typeof start !== 'number' || typeof end !== 'number') return false;
        if (start < 0 || end <= start) return false;
        // Avoid duplicates
        if (document.querySelector('[data-hl-id=\"' + id + '\"]')) return true;

        var a = findTextPosition(root, start);
        var b = findTextPosition(root, end);
        if (!a || !b) return false;
        if (!a.node || !b.node) return false;
        if (isInsideHighlight(a.node) || isInsideHighlight(b.node)) {
          // Overlap handling is complex; skip for MVP.
          return false;
        }

        try {
          var range = document.createRange();
          range.setStart(a.node, a.offset);
          range.setEnd(b.node, b.offset);

          var span = document.createElement('span');
          span.className = 'hl';
          span.setAttribute('data-hl-id', id);
          range.surroundContents(span);
          return true;
        } catch (e) {
          return false;
        }
      }

      function removeHighlightById(id) {
        var nodes = document.querySelectorAll('[data-hl-id=\"' + id + '\"]');
        if (!nodes || !nodes.length) return true;
        for (var i = 0; i < nodes.length; i++) {
          unwrapHighlightSpan(nodes[i]);
        }
        return true;
      }

      function setReaderStyle(vars) {
        try {
          if (!vars) return false;
          var root = document.documentElement;
          if (vars.bg) root.style.setProperty('--bg', vars.bg);
          if (vars.fg) root.style.setProperty('--fg', vars.fg);
          if (vars.hl) root.style.setProperty('--hl', vars.hl);
          if (vars.fs) root.style.setProperty('--fs', vars.fs);
          return true;
        } catch (e) {
          return false;
        }
      }

      function getOffsets(range) {
        var root = document.getElementById('content');
        if (!root) return { start: -1, end: -1 };
        var anc = range.commonAncestorContainer;
        if (anc !== root && !root.contains(anc)) return { start: -1, end: -1 };
        var preStart = document.createRange();
        preStart.setStart(root, 0);
        preStart.setEnd(range.startContainer, range.startOffset);
        var preEnd = document.createRange();
        preEnd.setStart(root, 0);
        preEnd.setEnd(range.endContainer, range.endOffset);
        return { start: preStart.toString().length, end: preEnd.toString().length };
      }

      function postSelection() {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selectionEmpty' }));
          return;
        }
        var range = sel.getRangeAt(0);
        if (range.collapsed) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selectionEmpty' }));
          return;
        }
        var quote = sel.toString();
        if (!quote || quote.trim().length === 0) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selectionEmpty' }));
          return;
        }
        try {
          var r = range.getBoundingClientRect();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'selectionRect',
            rect: { top: (r.top + (window.scrollY || 0)), left: r.left, width: r.width, height: r.height }
          }));
        } catch (e) {}
        var offsets = getOffsets(range);
        if (offsets.start < 0 || offsets.end <= offsets.start) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selectionEmpty' }));
          return;
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'selection',
          quote: quote,
          start: offsets.start,
          end: offsets.end
        }));
      }

      var scrollTimer = null;
      function reportScroll() {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
        var y = window.scrollY || window.pageYOffset || 0;
        var doc = document.documentElement;
        var h = doc ? doc.scrollHeight : 0;
        var vh = window.innerHeight || 0;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scroll', y: y, h: h, vh: vh }));
      }
      window.addEventListener('scroll', function() {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function() {
          scrollTimer = null;
          reportScroll();
        }, 220);
      }, { passive: true });

      var selTimer = null;
      document.addEventListener('selectionchange', function() {
        if (selTimer) clearTimeout(selTimer);
        selTimer = setTimeout(function() {
          selTimer = null;
          postSelection();
        }, 120);
      });

      document.addEventListener('click', function() {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap' }));
      }, { passive: true });

      window.__smarkPostSelection = postSelection;
      window.__smarkApplyHighlightByOffsets = applyHighlightByOffsets;
      window.__smarkRemoveHighlightById = removeHighlightById;
      window.__smarkSetReaderStyle = setReaderStyle;
    })();
  </script>
</body>
</html>`;
}

const INJECT_SAVE_SELECTION =
  '(function(){try{if(window.__smarkPostSelection)window.__smarkPostSelection();}catch(e){}})();true;';

function injectApplyHighlightByOffsets(id: string, start: number, end: number) {
  return `(function(){try{if(window.__smarkApplyHighlightByOffsets)window.__smarkApplyHighlightByOffsets(${JSON.stringify(
    id
  )}, ${start}, ${end});}catch(e){}})();true;`;
}

function injectRemoveHighlightById(id: string) {
  return `(function(){try{if(window.__smarkRemoveHighlightById)window.__smarkRemoveHighlightById(${JSON.stringify(
    id
  )});}catch(e){}})();true;`;
}

function injectSetReaderStyle(input: { bg: string; fg: string; hl: string; fs: string }) {
  return `(function(){try{if(window.__smarkSetReaderStyle)window.__smarkSetReaderStyle(${JSON.stringify(
    input
  )});}catch(e){}})();true;`;
}

const THEME_LABEL: Record<ReaderTheme, string> = {
  light: '常规',
  eye: '护眼',
  dark: '夜间',
};

const FONT_LABEL: Record<FontSizePreset, string> = { sm: '小', md: '中', lg: '大' };

export default function ReadScreen() {
  const { id, highlightId: highlightIdParam } = useLocalSearchParams<{
    id: string;
    highlightId?: string;
  }>();
  const articleId = String(id ?? '');
  const jumpHighlightId =
    typeof highlightIdParam === 'string'
      ? highlightIdParam
      : Array.isArray(highlightIdParam)
        ? highlightIdParam[0]
        : undefined;

  const [title, setTitle] = useState<string>('阅读');
  const [content, setContent] = useState<string>('');
  const [highlights, setHighlights] = useState<DbHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('light');
  const [fontSizePreset, setFontSizePreset] = useState<FontSizePreset>('md');
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const webRef = useRef<WebView>(null);
  const lastScrollYRef = useRef(0);
  const pendingRestoreYRef = useRef<number | undefined>(undefined);
  const knownHighlightIdsRef = useRef<Set<string>>(new Set());
  const lastScrollForUiRef = useRef(0);
  const pendingHighlightRequestRef = useRef(false);

  const [topBarVisible, setTopBarVisible] = useState(true);
  const [selectionRect, setSelectionRect] = useState<
    | { top: number; left: number; width: number; height: number }
    | null
  >(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    void (async () => {
      const p = await loadReaderPrefs();
      setReaderTheme(p.readerTheme);
      setFontSizePreset(p.fontSizePreset);
      setPrefsLoaded(true);
    })();
  }, []);

  async function persistPrefs(next: { readerTheme?: ReaderTheme; fontSizePreset?: FontSizePreset }) {
    const theme = next.readerTheme ?? readerTheme;
    const font = next.fontSizePreset ?? fontSizePreset;
    setReaderTheme(theme);
    setFontSizePreset(font);
    await saveReaderPrefs({ readerTheme: theme, fontSizePreset: font });
    const t = THEME_VARS[theme];
    const fs = FONT_PX[font];
    webRef.current?.injectJavaScript(
      injectSetReaderStyle({ bg: t.bg, fg: t.fg, hl: t.hl, fs: `${fs}px` })
    );
  }

  function cycleTheme() {
    const order: ReaderTheme[] = ['light', 'eye', 'dark'];
    const i = order.indexOf(readerTheme);
    void persistPrefs({ readerTheme: order[(i + 1) % order.length] });
  }

  function cycleFont() {
    const order: FontSizePreset[] = ['sm', 'md', 'lg'];
    const i = order.indexOf(fontSizePreset);
    void persistPrefs({ fontSizePreset: order[(i + 1) % order.length] });
  }

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
      knownHighlightIdsRef.current = new Set(hs.map((h) => h.id));
    } finally {
      setLoading(false);
    }
  }

  async function refreshHighlightsOnly() {
    const hs = await listHighlights(articleId);
    const nextIds = new Set(hs.map((h) => h.id));
    const prevIds = knownHighlightIdsRef.current;
    // Remove highlights that were deleted elsewhere (e.g. list page)
    for (const oldId of prevIds) {
      if (!nextIds.has(oldId)) {
        webRef.current?.injectJavaScript(injectRemoveHighlightById(oldId));
      }
    }
    knownHighlightIdsRef.current = nextIds;
    setHighlights(hs);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  // IMPORTANT: do NOT re-render WebView source for highlight changes (it causes flash).
  // Highlight add/remove is handled by DOM patching via injectJavaScript.
  const html = useMemo(
    () => buildHtml(content, highlights, { theme: readerTheme, fontSize: fontSizePreset }),
    // IMPORTANT: theme/font changes should NOT reload WebView (causes flash).
    // We patch CSS variables via injectJavaScript instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content]
  );

  const themeUi = THEME_VARS[readerTheme];

  const restoreScroll = useCallback(async () => {
    let y: number;
    if (pendingRestoreYRef.current !== undefined) {
      y = pendingRestoreYRef.current;
      pendingRestoreYRef.current = undefined;
    } else {
      y = await loadScrollPosition(articleId);
    }
    lastScrollYRef.current = y;
    const yy = Math.max(0, Math.floor(y));
    // Double-restore improves perceived stability on Android WebView.
    webRef.current?.injectJavaScript(`
      (function() {
        var y = ${yy};
        try { window.scrollTo(0, y); } catch (e) {}
        setTimeout(function() {
          try { window.scrollTo(0, y); } catch (e) {}
        }, 60);
        return true;
      })();
    `);
  }, [articleId]);

  const scrollToHighlightInWeb = useCallback((hid: string) => {
    const idJson = JSON.stringify(hid);
    webRef.current?.injectJavaScript(`
      (function(){
        var id = ${idJson};
        var el = document.querySelector('[data-hl-id="' + id + '"]');
        if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      })(); true;`);
  }, []);

  const onWebViewLoadEnd = useCallback(() => {
    void (async () => {
      await restoreScroll();
      // Ensure web styles match current prefs even when `html` isn't re-built.
      const t = THEME_VARS[readerTheme];
      const fs = FONT_PX[fontSizePreset];
      webRef.current?.injectJavaScript(
        injectSetReaderStyle({ bg: t.bg, fg: t.fg, hl: t.hl, fs: `${fs}px` })
      );
      if (jumpHighlightId) {
        setTimeout(() => scrollToHighlightInWeb(jumpHighlightId), 100);
      }
    })();
  }, [restoreScroll, jumpHighlightId, scrollToHighlightInWeb, readerTheme, fontSizePreset]);

  // When returning from highlights/edit pages, read/[id] stays mounted,
  // so we must refresh highlights on focus to reflect deletes immediately.
  useFocusEffect(
    useCallback(() => {
      pendingRestoreYRef.current = lastScrollYRef.current;
      void refreshHighlightsOnly();
      return () => {
        // no-op
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [articleId])
  );

  async function onMessage(event: { nativeEvent: { data: string } }) {
    try {
      const raw = event.nativeEvent?.data;
      if (typeof raw !== 'string') return;
      const msg = JSON.parse(raw) as WebToNativeMessage;

      if (msg.type === 'scroll') {
        lastScrollYRef.current = msg.y;
        await saveScrollPosition(articleId, msg.y);
        setSelectionRect(null);
        const h = typeof msg.h === 'number' ? msg.h : 0;
        const vh = typeof msg.vh === 'number' ? msg.vh : 0;
        const denom = Math.max(1, h - vh);
        setProgress(Math.max(0, Math.min(1, msg.y / denom)));

        const prev = lastScrollForUiRef.current;
        const dy = msg.y - prev;
        lastScrollForUiRef.current = msg.y;
        if (dy > 14) setTopBarVisible(false);
        if (dy < -14) setTopBarVisible(true);
        return;
      }

      if (msg.type === 'tap') {
        setTopBarVisible((v) => !v);
        setSelectionRect(null);
        return;
      }

      if (msg.type === 'selectionRect') {
        setSelectionRect(msg.rect);
        return;
      }

      if (msg.type === 'selectionEmpty') {
        // Only show hint when user explicitly tries to highlight.
        if (pendingHighlightRequestRef.current) {
          pendingHighlightRequestRef.current = false;
          if (Platform.OS === 'android') {
            ToastAndroid.show('请先选中文字，再点「划线」', ToastAndroid.SHORT);
          }
        }
        setSelectionRect(null);
        return;
      }

      if (msg.type !== 'selection') return;
      pendingHighlightRequestRef.current = false;

      const quote = msg.quote.trim();
      if (!quote) return;
      if (msg.start < 0 || msg.end <= msg.start) return;
      if (msg.end > content.length) return;

      const existing = await listHighlights(articleId);
      if (existing.some((h) => h.deleted_at == null && h.start === msg.start && h.end === msg.end)) {
        if (Platform.OS === 'android') {
          ToastAndroid.show('该句已划过线', ToastAndroid.SHORT);
        }
        return;
      }

      pendingRestoreYRef.current = lastScrollYRef.current;
      const newId = await createHighlight({ articleId, start: msg.start, end: msg.end, quote });
      // DOM patch first to avoid WebView reload flash.
      webRef.current?.injectJavaScript(injectApplyHighlightByOffsets(newId, msg.start, msg.end));
      const hs = await listHighlights(articleId);
      setHighlights(hs);
      knownHighlightIdsRef.current = new Set(hs.map((h) => h.id));

      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        /* optional on unsupported */
      }
      if (Platform.OS === 'android') {
        ToastAndroid.show('已保存划线', ToastAndroid.SHORT);
      }
    } catch {
      // ignore malformed messages
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: themeUi.barBg }]}>
      <Stack.Screen options={{ title }} />

      <View style={[styles.progressTrack, { backgroundColor: themeUi.barBorder }]}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: '#2563eb' }]} />
      </View>

      <View
        style={[
          styles.topBar,
          { backgroundColor: themeUi.barBg, borderBottomColor: themeUi.barBorder },
          !topBarVisible && styles.topBarHidden,
        ]}
      >
        <View style={styles.topBarRow}>
          <Pressable
            onPress={() => cycleTheme()}
            style={[styles.secondaryBtn, { borderColor: themeUi.barBorder }]}
            disabled={loading || !prefsLoaded}
          >
            <Text style={[styles.secondaryBtnText, { color: themeUi.barText }]}>
              {THEME_LABEL[readerTheme]}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => cycleFont()}
            style={[styles.secondaryBtn, styles.topBarBtnSpacing, { borderColor: themeUi.barBorder }]}
            disabled={loading || !prefsLoaded}
          >
            <Text style={[styles.secondaryBtnText, { color: themeUi.barText }]}>
              {FONT_LABEL[fontSizePreset]}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              pendingHighlightRequestRef.current = true;
              webRef.current?.injectJavaScript(INJECT_SAVE_SELECTION);
            }}
            style={[styles.secondaryBtn, styles.topBarBtnSpacing, { borderColor: themeUi.barBorder }]}
            disabled={loading}
          >
            <Text style={[styles.secondaryBtnText, { color: themeUi.barText }]}>划线</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              router.push({ pathname: '/highlights/[id]', params: { id: articleId } });
            }}
            style={[styles.secondaryBtn, styles.topBarBtnSpacing, { borderColor: themeUi.barBorder }]}
            disabled={loading}
          >
            <Text style={[styles.secondaryBtnText, { color: themeUi.barText }]}>列表</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              router.push({ pathname: '/edit/[id]', params: { id: articleId } });
            }}
            style={[styles.secondaryBtn, styles.topBarBtnSpacing, { borderColor: themeUi.barBorder }]}
            disabled={loading}
          >
            <Text style={[styles.secondaryBtnText, { color: themeUi.barText }]}>矫正</Text>
          </Pressable>
        </View>
      </View>

      {selectionRect ? (
        <View style={styles.selectionBar} pointerEvents="box-none">
          <View
            style={[
              styles.selectionBarInner,
              { top: Math.max(8, selectionRect.top - 44), left: 12 },
            ]}
          >
            <Pressable
              onPress={() => {
                pendingHighlightRequestRef.current = true;
                webRef.current?.injectJavaScript(INJECT_SAVE_SELECTION);
                setSelectionRect(null);
              }}
              style={styles.selectionBtn}
            >
              <Text style={styles.selectionBtnText}>划线</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://smark.local/' }}
        onMessage={onMessage}
        onLoadEnd={onWebViewLoadEnd}
        javaScriptEnabled
        domStorageEnabled
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressTrack: { height: 2, width: '100%' },
  progressFill: { height: 2 },
  topBar: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  topBarHidden: {
    height: 0,
    paddingTop: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  topBarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  topBarBtnSpacing: { marginRight: 8 },
  secondaryBtn: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  secondaryBtnText: { fontWeight: '700', fontSize: 13 },
  webview: { flex: 1 },
  selectionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  selectionBarInner: {
    position: 'absolute',
    backgroundColor: 'rgba(17, 24, 39, 0.96)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectionBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  selectionBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
});
