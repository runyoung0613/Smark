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

export async function updateArticleContent(input: { id: string; content: string }) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  await db.runAsync(`UPDATE articles SET content = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, [
    input.content,
    ts,
    input.id,
  ]);
}

export async function softDeleteAllHighlightsForArticle(articleId: string) {
  await initDb();
  const db = await getDb();
  const ts = nowIso();
  await db.runAsync(
    `UPDATE highlights SET deleted_at = ?, updated_at = ? WHERE article_id = ? AND deleted_at IS NULL`,
    [ts, ts, articleId]
  );
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

