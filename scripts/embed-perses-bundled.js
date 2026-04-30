/**
 * Regenerates smark-app/services/persesBundled.ts from docs/perses markdown.
 * Run from repo root: node scripts/embed-perses-bundled.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outFile = path.join(root, 'smark-app', 'services', 'persesBundled.ts');

function readDoc(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
}

function q(s) {
  return JSON.stringify(s);
}

const lines = [
  '/** Synced from docs/perses — run: `node scripts/embed-perses-bundled.js` (repo root) */',
  'export const DEFAULT_SOUL_MD = ' + q(readDoc('docs/perses/memory/SOUL.md')) + ';',
  'export const DEFAULT_USER_MD = ' + q(readDoc('docs/perses/memory/USER.md')) + ';',
  'export const DEFAULT_MEMORY_MD = ' + q(readDoc('docs/perses/memory/MEMORY.md')) + ';',
  'export const PERSES_RUNTIME_SYSTEM_ZH = ' + q(readDoc('docs/perses/PERSES_RUNTIME_SYSTEM.zh.md')) + ';',
];

fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
console.log('Wrote', outFile);
