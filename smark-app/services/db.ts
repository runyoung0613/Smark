import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let initPromise: Promise<void> | null = null;

export type DbArticle = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DbHighlight = {
  id: string;
  article_id: string;
  start: number;
  end: number;
  quote: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** 1 = 进入划线复习池；新建默认为 0 */
  in_review: number;
};

export type DbQuickCard = {
  id: string;
  front: string;
  back: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type OutboxOp = 'upsert' | 'delete';
type OutboxTable = 'articles' | 'highlights' | 'quick_cards';

export type DbOutbox = {
  id: string;
  table_name: OutboxTable;
  op: OutboxOp;
  record_id: string;
  payload: string;
  created_at: string;
  sent_at: string | null;
  error: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  // Good enough for MVP local IDs.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('smark.db');
  }
  return dbPromise;
}

export async function initDb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const db = await getDb();
    await db.execAsync(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS highlights (
        id TEXT PRIMARY KEY NOT NULL,
        article_id TEXT NOT NULL,
        start INTEGER NOT NULL,
        end INTEGER NOT NULL,
        quote TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        in_review INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS highlights_article_id_idx ON highlights(article_id);

      CREATE TABLE IF NOT EXISTS quick_cards (
        id TEXT PRIMARY KEY NOT NULL,
        front TEXT NOT NULL,
        back TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        table_name TEXT NOT NULL,
        op TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sent_at TEXT,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS outbox_sent_at_idx ON outbox(sent_at);
    `);
    await migrateHighlightsInReviewColumn(db);
  })();
  return initPromise;
}

async function migrateHighlightsInReviewColumn(db: SQLite.SQLiteDatabase) {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(highlights)`);
  if (!cols.some((c) => c.name === 'in_review')) {
    await db.execAsync(
      `ALTER TABLE highlights ADD COLUMN in_review INTEGER NOT NULL DEFAULT 0`
    );
  }
}

async function enqueueOutbox(input: {
  table: OutboxTable;
  op: OutboxOp;
  recordId: string;
  payload: unknown;
  ts: string;
}) {
  const db = await getDb();
  const id = uuid();
  await db.runAsync(
    `INSERT INTO outbox (id, table_name, op, record_id, payload, created_at, sent_at, error)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [id, input.table, input.op, input.recordId, JSON.stringify(input.payload ?? null), input.ts]
  );
}

export async function listPendingOutbox(limit = 100): Promise<DbOutbox[]> {
  await initDb();
  const db = await getDb();
  const rows = await db.getAllAsync<DbOutbox>(
    `SELECT * FROM outbox WHERE sent_at IS NULL ORDER BY created_at ASC LIMIT ?`,
    [limit]
  );
  return rows;
}

export async function markOutboxSent(ids: string[]) {
  if (!ids.length) return;
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  for (const id of ids) {
    await db.runAsync(`UPDATE outbox SET sent_at = ?, error = NULL WHERE id = ?`, [ts, id]);
  }
}

export async function markOutboxError(id: string, error: string) {
  await initDb();
  const db = await getDb();
  await db.runAsync(`UPDATE outbox SET error = ? WHERE id = ?`, [error.slice(0, 500), id]);
}

export async function createArticle(input: { title: string; content: string }) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  const id = uuid();
  await db.runAsync(
    `INSERT INTO articles (id, title, content, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [id, input.title.trim(), input.content, ts, ts]
  );
  await enqueueOutbox({
    table: 'articles',
    op: 'upsert',
    recordId: id,
    payload: { id, title: input.title.trim(), content: input.content, created_at: ts, updated_at: ts, deleted_at: null },
    ts,
  });
  return id;
}

export async function listArticles(): Promise<DbArticle[]> {
  await initDb();
  const db = await getDb();
  const rows = await db.getAllAsync<DbArticle>(
    `SELECT * FROM articles WHERE deleted_at IS NULL ORDER BY updated_at DESC`
  );
  return rows;
}

export async function getArticle(id: string): Promise<DbArticle | null> {
  await initDb();
  const db = await getDb();
  const row = await db.getFirstAsync<DbArticle>(
    `SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  return row ?? null;
}

/** 更新文章标题与正文（矫正页保存）。 */
export async function updateArticle(input: { id: string; title: string; content: string }) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  const title = input.title.trim();
  await db.runAsync(
    `UPDATE articles SET title = ?, content = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
    [title, input.content, ts, input.id]
  );
  const row = await db.getFirstAsync<DbArticle>(
    `SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL`,
    [input.id]
  );
  if (row) {
    await enqueueOutbox({ table: 'articles', op: 'upsert', recordId: row.id, payload: row, ts });
  }
}

/** 软删除文章及其下全部划线（复习池、列表等不再出现）。 */
export async function softDeleteArticle(articleId: string) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  await db.runAsync(
    `UPDATE highlights SET deleted_at = ?, updated_at = ? WHERE article_id = ? AND deleted_at IS NULL`,
    [ts, ts, articleId]
  );
  await db.runAsync(`UPDATE articles SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, [
    ts,
    ts,
    articleId,
  ]);
  await enqueueOutbox({
    table: 'articles',
    op: 'delete',
    recordId: articleId,
    payload: { id: articleId, deleted_at: ts, updated_at: ts },
    ts,
  });
  const hls = await db.getAllAsync<DbHighlight>(`SELECT * FROM highlights WHERE article_id = ?`, [articleId]);
  for (const h of hls) {
    await enqueueOutbox({
      table: 'highlights',
      op: 'delete',
      recordId: h.id,
      payload: { id: h.id, article_id: h.article_id, deleted_at: ts, updated_at: ts },
      ts,
    });
  }
}

export async function softDeleteAllHighlightsForArticle(articleId: string) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  await db.runAsync(
    `UPDATE highlights SET deleted_at = ?, updated_at = ? WHERE article_id = ? AND deleted_at IS NULL`,
    [ts, ts, articleId]
  );
  const hls = await db.getAllAsync<DbHighlight>(`SELECT * FROM highlights WHERE article_id = ?`, [articleId]);
  for (const h of hls) {
    await enqueueOutbox({
      table: 'highlights',
      op: 'delete',
      recordId: h.id,
      payload: { id: h.id, article_id: h.article_id, deleted_at: ts, updated_at: ts },
      ts,
    });
  }
}

export async function listHighlights(articleId: string): Promise<DbHighlight[]> {
  await initDb();
  const db = await getDb();
  const rows = await db.getAllAsync<DbHighlight>(
    `SELECT * FROM highlights
     WHERE article_id = ? AND deleted_at IS NULL
     ORDER BY start ASC`,
    [articleId]
  );
  return rows.map(normalizeHighlightRow);
}

function normalizeHighlightRow(row: DbHighlight): DbHighlight {
  const v = row.in_review as unknown;
  const ir = v === 1 || v === true ? 1 : 0;
  return { ...row, in_review: ir };
}

export async function listReviewHighlights(): Promise<DbHighlight[]> {
  await initDb();
  const db = await getDb();
  const rows = await db.getAllAsync<DbHighlight>(
    `SELECT * FROM highlights
     WHERE deleted_at IS NULL AND in_review = 1
     ORDER BY updated_at DESC`
  );
  return rows.map(normalizeHighlightRow);
}

export async function createHighlight(input: {
  articleId: string;
  start: number;
  end: number;
  quote: string;
}) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  const id = uuid();
  await db.runAsync(
    `INSERT INTO highlights
      (id, article_id, start, end, quote, note, created_at, updated_at, deleted_at, in_review)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, 0)`,
    [id, input.articleId, input.start, input.end, input.quote, ts, ts]
  );
  const payload: DbHighlight = {
    id,
    article_id: input.articleId,
    start: input.start,
    end: input.end,
    quote: input.quote,
    note: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    in_review: 0,
  };
  await enqueueOutbox({ table: 'highlights', op: 'upsert', recordId: id, payload, ts });
  return id;
}

export async function updateHighlightInReview(input: { id: string; inReview: boolean }) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  await db.runAsync(`UPDATE highlights SET in_review = ?, updated_at = ? WHERE id = ?`, [
    input.inReview ? 1 : 0,
    ts,
    input.id,
  ]);
  const row = await db.getFirstAsync<DbHighlight>(`SELECT * FROM highlights WHERE id = ?`, [input.id]);
  if (row) {
    await enqueueOutbox({
      table: 'highlights',
      op: 'upsert',
      recordId: row.id,
      payload: normalizeHighlightRow(row),
      ts,
    });
  }
}

export async function updateHighlightNote(input: { id: string; note: string }) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  await db.runAsync(`UPDATE highlights SET note = ?, updated_at = ? WHERE id = ?`, [
    input.note,
    ts,
    input.id,
  ]);
  const row = await db.getFirstAsync<DbHighlight>(`SELECT * FROM highlights WHERE id = ?`, [input.id]);
  if (row) {
    await enqueueOutbox({
      table: 'highlights',
      op: 'upsert',
      recordId: row.id,
      payload: normalizeHighlightRow(row),
      ts,
    });
  }
}

export async function deleteHighlight(id: string) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  await db.runAsync(`UPDATE highlights SET deleted_at = ?, updated_at = ? WHERE id = ?`, [
    ts,
    ts,
    id,
  ]);
  const row = await db.getFirstAsync<DbHighlight>(`SELECT * FROM highlights WHERE id = ?`, [id]);
  await enqueueOutbox({
    table: 'highlights',
    op: 'delete',
    recordId: id,
    payload: { id, article_id: row?.article_id ?? null, deleted_at: ts, updated_at: ts },
    ts,
  });
}

export async function createQuickCard(input: { front: string; back?: string | null }) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  const id = uuid();
  await db.runAsync(
    `INSERT INTO quick_cards (id, front, back, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [id, input.front.trim(), input.back ?? null, ts, ts]
  );
  const payload: DbQuickCard = {
    id,
    front: input.front.trim(),
    back: input.back ?? null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  await enqueueOutbox({ table: 'quick_cards', op: 'upsert', recordId: id, payload, ts });
  return id;
}

export async function listQuickCards(): Promise<DbQuickCard[]> {
  await initDb();
  const db = await getDb();
  const rows = await db.getAllAsync<DbQuickCard>(
    `SELECT * FROM quick_cards WHERE deleted_at IS NULL ORDER BY updated_at DESC`
  );
  return rows;
}

/** 学习动态：总量与近 7 日粗指标（本地库，不含已软删）。 */
export type LearningOverview = {
  articles: number;
  highlights: number;
  highlightsInReview: number;
  quickCards: number;
  reviewPoolTotal: number;
  last7d: {
    articlesTouched: number;
    newHighlights: number;
    quickCardsTouched: number;
  };
};

function rolling7dIso() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

export async function getLearningOverview(): Promise<LearningOverview> {
  await initDb();
  const db = await getDb();
  const since = rolling7dIso();

  const articles = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM articles WHERE deleted_at IS NULL`
  );
  const highlights = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM highlights WHERE deleted_at IS NULL`
  );
  const highlightsInReview = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM highlights WHERE deleted_at IS NULL AND in_review = 1`
  );
  const quickCards = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM quick_cards WHERE deleted_at IS NULL`
  );

  const last7dArticles = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM articles WHERE deleted_at IS NULL AND updated_at >= ?`,
    [since]
  );
  const last7dHighlights = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM highlights WHERE deleted_at IS NULL AND created_at >= ?`,
    [since]
  );
  const last7dQuicks = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM quick_cards WHERE deleted_at IS NULL AND updated_at >= ?`,
    [since]
  );

  const hir = highlightsInReview?.n ?? 0;
  const qc = quickCards?.n ?? 0;

  return {
    articles: articles?.n ?? 0,
    highlights: highlights?.n ?? 0,
    highlightsInReview: hir,
    quickCards: qc,
    reviewPoolTotal: hir + qc,
    last7d: {
      articlesTouched: last7dArticles?.n ?? 0,
      newHighlights: last7dHighlights?.n ?? 0,
      quickCardsTouched: last7dQuicks?.n ?? 0,
    },
  };
}

export type ActivityFeedItem =
  | { kind: 'article'; id: string; title: string; time: string }
  | {
      kind: 'highlight';
      id: string;
      articleId: string;
      quote: string;
      articleTitle: string;
      time: string;
    }
  | { kind: 'quick_card'; id: string; front: string; time: string };

/** 学习动态：按更新时间混排最近若干条（文章 / 划线 / Quick Card）。 */
export async function getLearningActivityFeed(limit = 14): Promise<ActivityFeedItem[]> {
  await initDb();
  const db = await getDb();
  const per = Math.min(24, Math.max(limit, 8));

  const arts = await db.getAllAsync<{ id: string; title: string; updated_at: string }>(
    `SELECT id, title, updated_at FROM articles WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
    [per]
  );

  const hls = await db.getAllAsync<{
    id: string;
    article_id: string;
    quote: string;
    updated_at: string;
    article_title: string;
  }>(
    `SELECT h.id, h.article_id, h.quote, h.updated_at, a.title AS article_title
     FROM highlights h
     INNER JOIN articles a ON a.id = h.article_id AND a.deleted_at IS NULL
     WHERE h.deleted_at IS NULL
     ORDER BY h.updated_at DESC
     LIMIT ?`,
    [per]
  );

  const cards = await db.getAllAsync<{ id: string; front: string; updated_at: string }>(
    `SELECT id, front, updated_at FROM quick_cards WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
    [per]
  );

  type Merged = { t: number; item: ActivityFeedItem };
  const merged: Merged[] = [];
  for (const r of arts) {
    const t = Date.parse(r.updated_at);
    merged.push({
      t: Number.isNaN(t) ? 0 : t,
      item: { kind: 'article', id: r.id, title: r.title, time: r.updated_at },
    });
  }
  for (const r of hls) {
    const t = Date.parse(r.updated_at);
    merged.push({
      t: Number.isNaN(t) ? 0 : t,
      item: {
        kind: 'highlight',
        id: r.id,
        articleId: r.article_id,
        quote: r.quote,
        articleTitle: r.article_title,
        time: r.updated_at,
      },
    });
  }
  for (const r of cards) {
    const t = Date.parse(r.updated_at);
    merged.push({
      t: Number.isNaN(t) ? 0 : t,
      item: { kind: 'quick_card', id: r.id, front: r.front, time: r.updated_at },
    });
  }
  merged.sort((a, b) => b.t - a.t);
  return merged.slice(0, limit).map((m) => m.item);
}

export async function updateQuickCard(id: string, input: { front: string; back?: string | null }) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  const front = input.front.trim();
  if (!front) return false;
  const back =
    input.back === undefined ? undefined : input.back === null ? null : input.back.trim() || null;

  const prev = await db.getFirstAsync<DbQuickCard>(
    `SELECT * FROM quick_cards WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (!prev) return false;

  const nextBack = back !== undefined ? back : prev.back;
  await db.runAsync(`UPDATE quick_cards SET front = ?, back = ?, updated_at = ? WHERE id = ?`, [
    front,
    nextBack,
    ts,
    id,
  ]);
  const row = await db.getFirstAsync<DbQuickCard>(`SELECT * FROM quick_cards WHERE id = ?`, [id]);
  if (row) {
    await enqueueOutbox({
      table: 'quick_cards',
      op: 'upsert',
      recordId: id,
      payload: row,
      ts,
    });
  }
  return true;
}

export async function deleteQuickCard(id: string) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  await db.runAsync(`UPDATE quick_cards SET deleted_at = ?, updated_at = ? WHERE id = ?`, [ts, ts, id]);
  await enqueueOutbox({
    table: 'quick_cards',
    op: 'delete',
    recordId: id,
    payload: { id, deleted_at: ts, updated_at: ts },
    ts,
  });
}

// Apply cloud changes to local SQLite (for sync pull)
export async function upsertArticleFromCloud(row: any) {
  await initDb();
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO articles (id, title, content, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title,
       content=excluded.content,
       updated_at=excluded.updated_at,
       deleted_at=excluded.deleted_at`,
    [
      String(row.id),
      String(row.title ?? ''),
      String(row.content ?? ''),
      String(row.created_at ?? nowIso()),
      String(row.updated_at ?? nowIso()),
      row.deleted_at ? String(row.deleted_at) : null,
    ]
  );
}

export async function upsertHighlightFromCloud(row: any) {
  await initDb();
  const db = await getDb();
  const inReview = row.in_review === true || row.in_review === 1 ? 1 : 0;
  await db.runAsync(
    `INSERT INTO highlights (id, article_id, start, end, quote, note, created_at, updated_at, deleted_at, in_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       article_id=excluded.article_id,
       start=excluded.start,
       end=excluded.end,
       quote=excluded.quote,
       note=excluded.note,
       updated_at=excluded.updated_at,
       deleted_at=excluded.deleted_at,
       in_review=excluded.in_review`,
    [
      String(row.id),
      String(row.article_id),
      Number(row.start ?? 0),
      Number(row.end ?? 0),
      String(row.quote ?? ''),
      row.note == null ? null : String(row.note),
      String(row.created_at ?? nowIso()),
      String(row.updated_at ?? nowIso()),
      row.deleted_at ? String(row.deleted_at) : null,
      inReview,
    ]
  );
}

export async function upsertQuickCardFromCloud(row: any) {
  await initDb();
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO quick_cards (id, front, back, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       front=excluded.front,
       back=excluded.back,
       updated_at=excluded.updated_at,
       deleted_at=excluded.deleted_at`,
    [
      String(row.id),
      String(row.front ?? ''),
      row.back == null ? null : String(row.back),
      String(row.created_at ?? nowIso()),
      String(row.updated_at ?? nowIso()),
      row.deleted_at ? String(row.deleted_at) : null,
    ]
  );
}

