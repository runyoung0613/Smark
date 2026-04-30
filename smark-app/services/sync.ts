import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase, hasSupabaseConfig } from './supabase';
import {
  listPendingOutbox,
  markOutboxError,
  markOutboxSent,
  upsertArticleFromCloud,
  upsertHighlightFromCloud,
  upsertQuickCardFromCloud,
} from './db';

const LAST_SYNC_KEY = 'smark_last_sync_at';

type OutboxChange = {
  id: string;
  table_name: string;
  op: string;
  record_id: string;
  payload: string;
};

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function loadLastSyncAt(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(LAST_SYNC_KEY);
    return v || null;
  } catch {
    return null;
  }
}

export async function saveLastSyncAt(iso: string) {
  await AsyncStorage.setItem(LAST_SYNC_KEY, iso);
}

export async function runSyncOnce(opts?: { outboxBatchSize?: number }) {
  if (!hasSupabaseConfig()) {
    throw new Error('未配置 Supabase：请在「我的」中填写项目地址与 anon key，或在 smark-app/.env 配置 EXPO_PUBLIC_*');
  }
  const supabase = getSupabase();
  const outboxBatchSize = opts?.outboxBatchSize ?? 100;
  const since = await loadLastSyncAt();

  const outbox = await listPendingOutbox(outboxBatchSize);
  const changes = (outbox as OutboxChange[]).map((o) => ({
    table: o.table_name,
    op: o.op,
    record: safeJsonParse(o.payload) ?? {},
    _outbox_id: o.id,
  }));

  const { data, error } = await supabase.functions.invoke('sync', {
    body: { since, changes: changes.map(({ table, op, record }) => ({ table, op, record })) },
  });

  if (error) {
    // 标记本批 outbox 为 error（保留待下次重试）
    for (const o of outbox) {
      await markOutboxError(o.id, String(error.message ?? error));
    }
    throw error;
  }

  const serverTime: string | undefined = data?.server_time;
  const pulled = data?.changes ?? {};
  const ack: string[] = Array.isArray(data?.ack) ? data.ack : [];

  // 1) apply pulls
  const arts: any[] = Array.isArray(pulled.articles) ? pulled.articles : [];
  const hls: any[] = Array.isArray(pulled.highlights) ? pulled.highlights : [];
  const qcs: any[] = Array.isArray(pulled.quick_cards) ? pulled.quick_cards : [];

  for (const a of arts) await upsertArticleFromCloud(a);
  for (const h of hls) await upsertHighlightFromCloud(h);
  for (const q of qcs) await upsertQuickCardFromCloud(q);

  // 2) mark outbox sent if server acked ids
  // ack items are formatted as `${table}:${recordId}`; we map them back to outbox rows by record_id+table.
  if (ack.length) {
    const ackSet = new Set(ack);
    const sentIds: string[] = [];
    for (const o of outbox) {
      const key = `${o.table_name}:${o.record_id}`;
      if (ackSet.has(key)) sentIds.push(o.id);
    }
    await markOutboxSent(sentIds);
  }

  if (serverTime) await saveLastSyncAt(serverTime);

  return {
    since,
    serverTime: serverTime ?? null,
    pushed: outbox.length,
    pulled: { articles: arts.length, highlights: hls.length, quick_cards: qcs.length },
  };
}

