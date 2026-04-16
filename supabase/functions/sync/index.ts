// Supabase Edge Function: sync
// Request: { since: string | null, changes: Change[] }
// Change: { table: 'articles'|'highlights'|'quick_cards', op: 'upsert'|'delete', record: any }
// Response: { server_time: string, changes: { articles: any[], highlights: any[], quick_cards: any[] }, ack: string[] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

type TableName = 'articles' | 'highlights' | 'quick_cards';
type ChangeOp = 'upsert' | 'delete';

type Change = {
  table: TableName;
  op: ChangeOp;
  record: Record<string, unknown>;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function asIso(v: unknown) {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function pickClientUpdatedAt(record: Record<string, unknown>) {
  const cu = asIso(record.client_updated_at);
  if (cu) return cu;
  const uu = asIso(record.updated_at);
  return uu;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: 'Missing env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return json(401, { error: 'Missing Authorization bearer token' });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json(401, { error: 'Invalid token' });
  const userId = userData.user.id;

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const since = typeof payload?.since === 'string' ? asIso(payload.since) : null;
  const changes: Change[] = Array.isArray(payload?.changes) ? payload.changes : [];

  const ack: string[] = [];

  // Apply incoming changes (push)
  for (const ch of changes) {
    if (!ch || (ch.table !== 'articles' && ch.table !== 'highlights' && ch.table !== 'quick_cards')) continue;
    if (ch.op !== 'upsert' && ch.op !== 'delete') continue;
    const record = (ch.record ?? {}) as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : null;
    if (!id) continue;

    // Fetch current server record to resolve conflict.
    const { data: current, error: curErr } = await admin
      .from(ch.table)
      .select('id,user_id,updated_at,client_updated_at,deleted_at')
      .eq('id', id)
      .maybeSingle();

    if (curErr) continue;
    if (current && current.user_id !== userId) continue;

    const incomingCU = pickClientUpdatedAt(record);
    const serverCU = current ? (asIso((current as any).client_updated_at) ?? asIso((current as any).updated_at)) : null;

    const shouldApply = !current || (incomingCU && serverCU ? incomingCU > serverCU : Boolean(incomingCU));
    if (!shouldApply) continue;

    const now = new Date().toISOString();

    if (ch.op === 'delete') {
      const delAt = asIso(record.deleted_at) ?? now;
      const { error: upErr } = await admin
        .from(ch.table)
        .upsert(
          {
            id,
            user_id: userId,
            updated_at: now,
            client_updated_at: incomingCU ?? null,
            deleted_at: delAt,
          },
          { onConflict: 'id' },
        );
      if (!upErr) ack.push(`${ch.table}:${id}`);
    } else {
      // upsert full record; enforce user_id & updated_at server-side.
      const next = { ...(record as any) };
      next.id = id;
      next.user_id = userId;
      next.updated_at = now;
      next.client_updated_at = incomingCU ?? null;

      const { error: upErr } = await admin.from(ch.table).upsert(next, { onConflict: 'id' });
      if (!upErr) ack.push(`${ch.table}:${id}`);
    }
  }

  // Pull changes since last sync
  const serverTime = new Date().toISOString();
  const sinceTs = since ?? '1970-01-01T00:00:00.000Z';

  async function pull(table: TableName) {
    const { data, error } = await admin
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .gt('updated_at', sinceTs)
      .order('updated_at', { ascending: true });
    if (error) return [];
    return data ?? [];
  }

  const [arts, hls, qcs] = await Promise.all([pull('articles'), pull('highlights'), pull('quick_cards')]);

  return json(200, {
    server_time: serverTime,
    changes: { articles: arts, highlights: hls, quick_cards: qcs },
    ack,
  });
});

