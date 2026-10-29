import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDocument, serializeData } from '../lib/dashboard-page.mjs';
import { summarizeHealth } from '../lib/health.mjs';

const sample = {
  generatedAt: '2026-10-28T00:00:00.000Z',
  root: 'C:/workspace',
  summary: {
    features: { total: 0, byStatus: {}, byArea: {}, byPriority: {}, stale: 0, warnings: 0 },
    repos: { total: 0 },
    links: { total: 0 },
  },
  features: [],
  repos: [],
  links: [],
};

test('serializeData cannot break out of the inline script', () => {
  const json = serializeData({ title: '</script><script>alert(1)</script>', amp: 'a&b' });
  assert.ok(!json.includes('</script>'));
  assert.ok(json.includes('\\u003c/script\\u003e'));
  assert.ok(json.includes('a\\u0026b'));
});

test('renderDocument embeds data and uses the asset prefix', () => {
  const html = renderDocument(sample, { prefix: '/' });
  assert.ok(html.includes('href="/app.css"'));
  assert.ok(html.includes('src="/app.js"'));
  assert.ok(html.includes('window.__DASHBOARD_DATA__ = {'));

  const staticHtml = renderDocument(sample, { prefix: '' });
  assert.ok(staticHtml.includes('href="app.css"'));
  assert.ok(staticHtml.includes('src="app.js"'));
});

test('summarizeHealth counts statuses without dropping totals', () => {
  const summary = summarizeHealth(
    [
      { status: 'ok' },
      { status: 'warn' },
      { status: 'ok' },
    ],
    [
      { status: 'ok' },
      { status: 'error' },
      { status: 'skipped' },
    ],
  );

  assert.equal(summary.repos.total, 3);
  assert.equal(summary.repos.ok, 2);
  assert.equal(summary.repos.warn, 1);
  assert.equal(summary.links.total, 3);
  assert.equal(summary.links.error, 1);
  assert.equal(summary.links.skipped, 1);
});
