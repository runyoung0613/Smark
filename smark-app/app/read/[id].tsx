import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { createHighlight, DbHighlight, getArticle, listHighlights } from '../../services/db';

type SelectionMessage = {
  type: 'selection';
  quote: string;
  start: number;
  end: number;
};

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildHtml(content: string, highlights: DbHighlight[]) {
  // Insert spans by offsets. We assume `start/end` are offsets in `content`.
  const active = highlights
    .filter((h) => h.deleted_at == null)
    .map((h) => ({ start: h.start, end: h.end }))
    .filter((h) => Number.isFinite(h.start) && Number.isFinite(h.end) && h.start >= 0 && h.end > h.start)
    .sort((a, b) => b.start - a.start); // descending so offsets remain valid

  let htmlText = escapeHtml(content);

  // To keep mapping stable, we must operate on original string indices.
  // We therefore rebuild from original content each time.
  let raw = content;
  for (const h of active) {
    if (h.end > raw.length) continue;
    const before = raw.slice(0, h.start);
    const mid = raw.slice(h.start, h.end);
    const after = raw.slice(h.end);
    raw = before + `[[[H]]]${mid}[[[/H]]]` + after;
  }
  htmlText = escapeHtml(raw)
    .replace(/\[\[\[H\]\]\]/g, `<span class="hl">`)
    .replace(/\[\[\[\/H\]\]\]/g, `</span>`);

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, Roboto, "Segoe UI", Arial, sans-serif; padding: 16px; line-height: 1.7; color: #111827; }
    .hl { background: rgba(250, 204, 21, 0.55); border-radius: 4px; padding: 0 2px; }
    #content { white-space: pre-wrap; }
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

  const [title, setTitle] = useState<string>('阅读');
  const [content, setContent] = useState<string>('');
  const [highlights, setHighlights] = useState<DbHighlight[]>([]);
  const [loading, setLoading] = useState(true);

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

  const html = useMemo(() => buildHtml(content, highlights), [content, highlights]);

  async function onMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as SelectionMessage;
      if (msg.type !== 'selection') return;
      const quote = msg.quote.trim();
      if (!quote) return;
      if (msg.start < 0 || msg.end <= msg.start) return;
      // Guard: basic bounds within content
      if (msg.end > content.length) return;
      await createHighlight({ articleId, start: msg.start, end: msg.end, quote });
      const hs = await listHighlights(articleId);
      setHighlights(hs);
    } catch (e) {
      // ignore
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title }} />

      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            router.push({ pathname: '/highlights/[id]', params: { id: articleId } });
          }}
          style={styles.secondaryBtn}
          disabled={loading}
        >
          <Text style={styles.secondaryBtnText}>划线列表</Text>
        </Pressable>
      </View>

      <WebView
        originWhitelist={['*']}
        source={{ html }}
        onMessage={onMessage}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  secondaryBtnText: { color: '#111827', fontWeight: '700' },
  webview: { flex: 1 },
});

