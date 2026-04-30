// Supabase Edge Function: perses_proxy
// Request: { prompt: string; soulMd?, userMd?, memoryMd?, runtimeSystemZh? }
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

function assemblePersesPrompt(parts: {
  userMessage: string;
  runtime?: string;
  soul?: string;
  user?: string;
  memory?: string;
}): string {
  const sections: string[] = [];
  if (parts.runtime?.trim()) sections.push(`[运行时规则]\n${parts.runtime.trim()}`);
  if (parts.soul?.trim()) sections.push(`[SOUL.md]\n${parts.soul.trim()}`);
  if (parts.user?.trim()) sections.push(`[USER.md]\n${parts.user.trim()}`);
  if (parts.memory?.trim()) sections.push(`[MEMORY.md]\n${parts.memory.trim()}`);
  sections.push(`[用户本轮]\n${parts.userMessage.trim()}`);
  return sections.join('\n\n---\n\n');
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
  let soulMd = '';
  let userMd = '';
  let memoryMd = '';
  let runtimeSystemZh = '';
  try {
    const body = await req.json();
    prompt = typeof body?.prompt === 'string' ? body.prompt : '';
    soulMd = typeof body?.soulMd === 'string' ? body.soulMd : '';
    userMd = typeof body?.userMd === 'string' ? body.userMd : '';
    memoryMd = typeof body?.memoryMd === 'string' ? body.memoryMd : '';
    runtimeSystemZh = typeof body?.runtimeSystemZh === 'string' ? body.runtimeSystemZh : '';
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  prompt = prompt.trim();
  if (!prompt) return json(400, { error: 'Missing prompt' });

  const upstreamPrompt = assemblePersesPrompt({
    userMessage: prompt,
    runtime: runtimeSystemZh,
    soul: soulMd,
    user: userMd,
    memory: memoryMd,
  });

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
      body: JSON.stringify({ prompt: upstreamPrompt }),
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

