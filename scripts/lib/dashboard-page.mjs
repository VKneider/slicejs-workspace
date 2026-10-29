import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DASHBOARD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'dashboard');
const TEMPLATE_PATH = join(DASHBOARD_DIR, 'index.html');

export const DASHBOARD_ASSETS = Object.freeze({
  '/app.css': 'app.css',
  '/app.js': 'app.js',
});

export function readDashboardAsset(name) {
  const file = DASHBOARD_ASSETS[name];
  if (!file) return null;
  return readFileSync(join(DASHBOARD_DIR, file), 'utf8');
}

function assetPrefix(value) {
  if (!value) return '';
  return value.endsWith('/') ? value : `${value}/`;
}

/** Serializes the payload for an inline `<script>` without allowing `</script>`. */
export function serializeData(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function renderDocument(data, { prefix = '/' } = {}) {
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  return template
    .split('__ASSET_PREFIX__')
    .join(assetPrefix(prefix))
    .replace('__DATA__', serializeData(data));
}
