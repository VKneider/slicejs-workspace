import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  LIST_KEYS,
  collectFeatures,
  parseFrontMatter,
  stripFrontMatter,
  toListEntry,
} from '../lib/features.mjs';

function makeRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'slice-features-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeFeature(dir, name, content) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content, 'utf8');
}

test('parseFrontMatter handles quoted values, inline arrays and block lists', () => {
  const data = parseFrontMatter(`---
id: "0001"
title: "Composable server: mount middleware"
repo: "slice.js"
status: done
area: framework
priority: high
created: 2026-10-27
updated: 2026-10-27
target: "TBD"
owners: []
related:
  - "api/framework/server.js"
  - "slicejs-cli: commands/init"
---`);

  assert.equal(data.id, '0001');
  assert.equal(data.title, 'Composable server: mount middleware');
  assert.deepEqual(data.owners, []);
  assert.deepEqual(data.related, ['api/framework/server.js', 'slicejs-cli: commands/init']);
});

test('stripFrontMatter removes only the frontmatter block', () => {
  const body = stripFrontMatter('---\nid: "0001"\n---\n\n# Title\n\nBody\n');
  assert.equal(body, '\n# Title\n\nBody\n');
});

test('collectFeatures aggregates workspace and repo features with validation warnings', (t) => {
  const root = makeRoot(t);
  const today = new Date('2026-10-28T00:00:00Z');

  writeFeature(
    join(root, 'features'),
    '0001-workspace-dashboard.md',
    `---
id: "0001"
title: "Workspace dashboard"
repo: "workspace"
status: proposed
area: workspace
priority: medium
created: 2026-01-01
updated: 2026-01-01
---
Body`,
  );

  writeFeature(
    join(root, 'repos', 'slice.js', 'features'),
    '0001-alpha.md',
    `---
id: "0001"
title: "Alpha"
repo: "slice.js"
status: done
area: framework
priority: high
created: 2026-10-27
updated: 2026-10-27
target: "4.1"
---
# Alpha

Done.`,
  );

  writeFeature(
    join(root, 'repos', 'slice.js', 'features'),
    '0002-beta.md',
    '# Beta\n\nNo frontmatter here.',
  );

  writeFeature(
    join(root, 'repos', 'slice.js', 'features'),
    '0003-gamma.md',
    `---
id: "0099"
title: "Gamma"
repo: "slicejs-cli"
status: shipped
area: unknown-area
priority: urgent
created: 2026-10-28
updated: 2026-10-01
---
Body`,
  );

  const features = collectFeatures({
    root,
    repos: [{ dir: 'slice.js' }],
    reposDir: 'repos',
    today,
  });

  assert.equal(features.length, 4);
  assert.deepEqual(
    features.map((feature) => feature.docId),
    ['slice.js:0001', 'slice.js:0002', 'slicejs-cli:0099', 'workspace:0001'],
  );

  const [alpha, beta, gamma, dashboard] = features;

  assert.equal(alpha.body.trim(), '# Alpha\n\nDone.');
  assert.equal(alpha.relativePath, 'repos/slice.js/features/0001-alpha.md');
  assert.deepEqual(alpha.warnings, []);
  assert.equal(alpha.stale, false);

  assert.equal(beta.title, 'beta');
  assert.ok(beta.warnings.some((warning) => warning.code === 'frontmatter-missing'));
  assert.ok(beta.warnings.some((warning) => warning.code === 'title-missing'));

  const gammaCodes = gamma.warnings.map((warning) => warning.code);
  assert.ok(gammaCodes.includes('id-mismatch'));
  assert.ok(gammaCodes.includes('repo-mismatch'));
  assert.ok(gammaCodes.includes('status-invalid'));
  assert.ok(gammaCodes.includes('area-invalid'));
  assert.ok(gammaCodes.includes('priority-invalid'));
  assert.ok(gammaCodes.includes('updated-before-created'));

  assert.equal(dashboard.stale, true);
  assert.ok(dashboard.warnings.some((warning) => warning.code === 'stale'));
});

test('collectFeatures tolerates missing folders and keeps the list shape stable', (t) => {
  const root = makeRoot(t);
  const features = collectFeatures({
    root,
    repos: [{ dir: 'slice.js' }, { dir: 'portfolio' }],
    reposDir: 'repos',
  });

  assert.deepEqual(features, []);

  const entry = toListEntry({
    repo: 'slice.js',
    id: '0001',
    docId: 'slice.js:0001',
    title: 'Alpha',
    status: 'done',
    area: 'framework',
    priority: 'high',
    target: 'TBD',
    created: '',
    updated: '',
    owners: [],
    related: [],
    sourceRepo: 'slice.js',
    path: '',
    relativePath: '',
    body: '',
    warnings: [],
    stale: false,
    staleDays: null,
  });

  assert.deepEqual(Object.keys(entry), LIST_KEYS);
  assert.deepEqual(entry, {
    repo: 'slice.js',
    id: '0001',
    doc_id: 'slice.js:0001',
    title: 'Alpha',
    status: 'done',
    area: 'framework',
    priority: 'high',
    target: 'TBD',
  });
});

test('collectFeatures reads CRLF files and ignores non-feature markdown', (t) => {
  const root = makeRoot(t);
  writeFeature(
    join(root, 'features'),
    '0001-crlf.md',
    '---\r\nid: "0001"\r\ntitle: "CRLF"\r\nrepo: "workspace"\r\nstatus: planned\r\narea: ecosystem\r\npriority: low\r\ncreated: 2026-10-28\r\nupdated: 2026-10-28\r\n---\r\n\r\nBody\r\n',
  );
  writeFeature(join(root, 'features'), '_TEMPLATE.md', 'not a feature');

  const features = collectFeatures({ root, repos: [], reposDir: 'repos' });
  assert.equal(features.length, 1);
  assert.equal(features[0].title, 'CRLF');
  assert.equal(features[0].body.trim(), 'Body');
});

test('collectFeatures validates depends_on and blocks references and cycles', (t) => {
  const root = makeRoot(t);
  const today = new Date('2026-10-28T00:00:00Z');

  writeFeature(
    join(root, 'features'),
    '0001-a.md',
    `---
id: "0001"
title: "A"
repo: "workspace"
status: proposed
area: workspace
priority: medium
created: 2026-10-28
updated: 2026-10-28
depends_on:
  - "workspace:0002"
blocks:
  - "workspace:0003"
---
Body`,
  );
  writeFeature(
    join(root, 'features'),
    '0002-b.md',
    `---
id: "0002"
title: "B"
repo: "workspace"
status: proposed
area: workspace
priority: medium
created: 2026-10-28
updated: 2026-10-28
depends_on:
  - "workspace:0001"
---
Body`,
  );
  writeFeature(
    join(root, 'features'),
    '0003-c.md',
    `---
id: "0003"
title: "C"
repo: "workspace"
status: proposed
area: workspace
priority: medium
created: 2026-10-28
updated: 2026-10-28
depends_on:
  - "workspace:9999"
---
Body`,
  );
  writeFeature(
    join(root, 'features'),
    '0004-d.md',
    `---
id: "0004"
title: "D"
repo: "workspace"
status: proposed
area: workspace
priority: medium
created: 2026-10-28
updated: 2026-10-28
depends_on:
  - "workspace:0004"
---
Body`,
  );

  const features = collectFeatures({ root, repos: [], reposDir: 'repos', today });
  const byId = Object.fromEntries(features.map((feature) => [feature.id, feature]));

  assert.deepEqual(byId['0001'].dependsOn, ['workspace:0002']);
  assert.deepEqual(byId['0001'].blocks, ['workspace:0003']);
  assert.ok(byId['0001'].warnings.some((warning) => warning.code === 'dependency-cycle'));
  assert.ok(byId['0002'].warnings.some((warning) => warning.code === 'dependency-cycle'));
  assert.ok(byId['0003'].warnings.some((warning) => warning.code === 'dependency-unknown'));
  assert.ok(byId['0004'].warnings.some((warning) => warning.code === 'dependency-self'));
});
