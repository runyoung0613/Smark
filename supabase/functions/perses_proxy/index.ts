// Supabase Edge Function: perses_proxy
// Request: { prompt: string }
// Response: { text: string }
//
// This function keeps upstream keys on server side.
// Configure env:
// - PERSES_UPSTREAM_URL: required
// - PERSES_UPSTREAM_AUTH_HEADER: optional (e.g. "Authorization: Bearer xxx")

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

  const upstreamUrl = Deno.env.get('PERSES_UPSTREAM_URL') ?? '';
  if (!upstreamUrl) return json(500, { error: 'Missing env: PERSES_UPSTREAM_URL' });

  let prompt = '';
  try {
    const body = await req.json();
    prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  prompt = prompt.trim();
  if (!prompt) return json(400, { error: 'Missing prompt' });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const extraHeader = (Deno.env.get('PERSES_UPSTREAM_AUTH_HEADER') ?? '').trim();
  if (extraHeader.includes(':')) {
    const idx = extraHeader.indexOf(':');
    const k = extraHeader.slice(0, idx).trim();
    const v = extraHeader.slice(idx + 1).trim();
    if (k && v) headers[k] = v;
  }

  try {
    const res = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return json(502, { error: `Upstream error: HTTP ${res.status}` });
    const data: any = await res.json().catch(() => null);
    const text = data?.text ?? data?.answer ?? data?.message ?? '';
    if (typeof text !== 'string' || !text.trim()) return json(502, { error: 'Upstream returned empty text' });
    return json(200, { text: text.trim() });
  } catch {
    return json(502, { error: 'Upstream request failed' });
  }
});

