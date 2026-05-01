/**
 * 从文章 URL 拉取 HTML 并尽量解析为纯文本（导入页使用）。
 * 许多站点会拦截非浏览器 UA 或正文在 JSON-LD / meta 中，故做多策略回退。
 */

const BROWSER_HEADERS: Record<string, string> = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
};

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (all, n) => {
      const code = Number(n);
      if (!Number.isFinite(code)) return all;
      try {
        return String.fromCodePoint(code);
      } catch {
        return all;
      }
    });
}

function extractTitle(html: string) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m?.[1]) {
    const t = decodeHtmlEntities(
      m[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
    if (t) return t;
  }
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
  if (og?.[1]) return decodeHtmlEntities(og[1].replace(/\s+/g, ' ').trim());
  const og2 = html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
  if (og2?.[1]) return decodeHtmlEntities(og2[1].replace(/\s+/g, ' ').trim());
  return '';
}

function extractOgDescription(html: string) {
  const m = html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
  if (m?.[1]) return decodeHtmlEntities(m[1].replace(/\s+/g, ' ').trim());
  const m2 = html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i);
  if (m2?.[1]) return decodeHtmlEntities(m2[1].replace(/\s+/g, ' ').trim());
  return '';
}

function extractJsonLdArticleBody(html: string): string {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] ?? '').trim();
    if (!raw) continue;
    try {
      const j = JSON.parse(raw) as unknown;
      const candidates: unknown[] = [];
      if (Array.isArray(j)) candidates.push(...j);
      else if (j && typeof j === 'object' && '@graph' in (j as object)) {
        const g = (j as Record<string, unknown>)['@graph'];
        if (Array.isArray(g)) candidates.push(...g);
        else candidates.push(j);
      } else candidates.push(j);

      for (const item of candidates) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const type = o['@type'];
        const types = Array.isArray(type) ? type : [type];
        const isArticle = types.some((t) => t === 'Article' || t === 'NewsArticle' || t === 'BlogPosting');
        if (!isArticle) continue;
        const body = o.articleBody;
        if (typeof body === 'string' && body.trim()) return body.trim();
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return '';
}

/** 取最可能含正文的 HTML 片段（仍含标签） */
function pickHtmlFragment(html: string): string {
  const tryArticle = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  if (tryArticle && tryArticle.length > 60) return tryArticle;

  const tryMain = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (tryMain && tryMain.length > 60) return tryMain;

  // 微信公众号等常见容器（仅取第一层闭合，复杂嵌套可能截断，后续仍可 htmlToPlainText）
  const tryJs = html.match(/<div\b[^>]*\bid=["']js_content["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
  if (tryJs && tryJs.length > 80) return tryJs;

  const tryBody = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if (tryBody) return tryBody;

  return html;
}

function htmlToPlainText(html: string) {
  let h = pickHtmlFragment(html);
  h = h.replace(/<!--([\s\S]*?)-->/g, ' ');
  h = h.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  h = h.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  h = h.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  h = h.replace(/<(br|br\/)\s*>/gi, '\n');
  h = h.replace(/<\/(p|div|section|article|header|footer|main|aside|li|h[1-6]|blockquote|pre|tr)>/gi, '\n');
  h = h.replace(/<(p|div|section|article|header|footer|main|aside|li|h[1-6]|blockquote|pre|tr)[^>]*>/gi, '\n');
  h = h.replace(/<[^>]+>/g, ' ');

  h = decodeHtmlEntities(h);
  h = h.replace(/\r/g, '');
  h = h.replace(/[ \t]+\n/g, '\n');
  h = h.replace(/\n{3,}/g, '\n\n');
  return h.trim();
}

export type FetchArticleFromUrlResult = {
  title: string;
  content: string;
  finalUrl: string;
  httpStatus: number;
};

export async function fetchArticleFromUrl(
  normalizedUrl: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<FetchArticleFromUrlResult> {
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const controller = new AbortController();
  const outerSignal = opts?.signal;
  const onAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    let referer = '';
    try {
      referer = new URL(normalizedUrl).origin + '/';
    } catch {
      // ignore
    }
    res = await fetch(normalizedUrl, {
      method: 'GET',
      headers: {
        ...BROWSER_HEADERS,
        ...(referer ? { Referer: referer } : {}),
      },
      signal: controller.signal,
    });
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    if (err?.name === 'AbortError') {
      throw new Error('请求超时或已取消');
    }
    throw new Error(err?.message ? `网络错误：${err.message}` : '网络错误：请检查链接与网络');
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener('abort', onAbort);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
  }

  const html = await res.text();
  const finalUrl = res.url || normalizedUrl;

  let title = extractTitle(html);
  let content = htmlToPlainText(html);

  if (!content || content.length < 40) {
    const ld = extractJsonLdArticleBody(html);
    if (ld.length > content.length) content = ld;
  }

  if (!content || content.length < 20) {
    const og = extractOgDescription(html);
    if (og) content = og;
  }

  if (!title && content) {
    const line = content.split('\n').find((l) => l.trim().length > 0);
    if (line && line.length <= 120) title = line.trim();
  }

  return { title, content, finalUrl, httpStatus: res.status };
}
