/**
 * 将 smark-app/.env 中的 Supabase 变量写入 EAS「preview」环境（不打日志泄露取值）。
 * 用法（在 smark-app 目录）：node scripts/sync-eas-supabase-env.mjs
 *
 * 依赖：已 eas login；已安装/可通过 npx 调用 eas-cli。
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envPath = join(root, '.env');

function parseDotEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq <= 0) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function runEas(args) {
  const r = spawnSync('npx', ['eas-cli', ...args], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!existsSync(envPath)) {
  console.error('缺少 smark-app/.env，请先复制 .env.example 并填入 Supabase。');
  process.exit(1);
}

const parsed = parseDotEnv(readFileSync(envPath, 'utf8'));
const url = (parsed.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const anon = (parsed.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!url || !anon) {
  console.error('.env 中需同时包含 EXPO_PUBLIC_SUPABASE_URL 与 EXPO_PUBLIC_SUPABASE_ANON_KEY（非空）。');
  process.exit(1);
}

const preview = ['--environment', 'preview', '--non-interactive', '--scope', 'project', '--force'];

runEas([
  'env:create',
  '--name',
  'EXPO_PUBLIC_SUPABASE_URL',
  '--value',
  url,
  '--visibility',
  'plaintext',
  ...preview,
]);

runEas([
  'env:create',
  '--name',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  '--value',
  anon,
  '--visibility',
  'sensitive',
  ...preview,
]);

console.log('已写入 EAS preview：EXPO_PUBLIC_SUPABASE_URL（plaintext）、EXPO_PUBLIC_SUPABASE_ANON_KEY（sensitive）。');
