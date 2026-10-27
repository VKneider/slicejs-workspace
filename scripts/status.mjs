#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, gitOutput, manifest, repoPath } from './lib/workspace.mjs';

function truncate(value, length) {
  const text = String(value ?? '');
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

function pad(value, length) {
  return String(value ?? '').padEnd(length, ' ');
}

function collect(repo) {
  const dir = repoPath(repo);
  if (!existsSync(join(dir, '.git'))) {
    return { name: repo.dir, branch: '-', state: 'missing', upstream: '-', last: '-' };
  }

  const branch = gitOutput(repo, ['branch', '--show-current'], { allowFailure: true }) || '(detached)';
  const dirty = gitOutput(repo, ['status', '--porcelain'], { allowFailure: true });
  const dirtyCount = dirty ? dirty.split('\n').filter(Boolean).length : 0;
  const counts = gitOutput(repo, ['rev-list', '--left-right', '--count', 'HEAD...@{u}'], {
    allowFailure: true,
  });
  const [ahead, behind] = counts ? counts.split(/\s+/).map(Number) : [null, null];
  const last = gitOutput(repo, ['log', '-1', '--format=%h %s'], { allowFailure: true });

  return {
    name: repo.dir,
    branch,
    state: dirtyCount === 0 ? 'clean' : `${dirtyCount} changed`,
    upstream: ahead === null ? 'no upstream' : `+${ahead}/-${behind}`,
    last,
  };
}

const rows = manifest.repos.map(collect);
const workspaceRow = (() => {
  if (!existsSync(join(ROOT, '.git'))) {
    return { name: '(workspace)', branch: '-', state: 'not a git repo', upstream: '-', last: '-' };
  }
  const dirty = gitOutput(ROOT, ['status', '--porcelain'], { allowFailure: true });
  const dirtyCount = dirty ? dirty.split('\n').filter(Boolean).length : 0;
  return {
    name: '(workspace)',
    branch: gitOutput(ROOT, ['branch', '--show-current'], { allowFailure: true }) || '(detached)',
    state: dirtyCount === 0 ? 'clean' : `${dirtyCount} changed`,
    upstream: '-',
    last: gitOutput(ROOT, ['log', '-1', '--format=%h %s'], { allowFailure: true }) || '-',
  };
})();
rows.push(workspaceRow);

const columns = [
  { key: 'name', label: 'repo', width: 30 },
  { key: 'branch', label: 'branch', width: 12 },
  { key: 'state', label: 'state', width: 12 },
  { key: 'upstream', label: 'ahead/behind', width: 13 },
  { key: 'last', label: 'last commit', width: 60 },
];

console.log(columns.map((column) => pad(column.label, column.width)).join(' '));
console.log(columns.map((column) => '-'.repeat(column.width)).join(' '));
for (const row of rows) {
  console.log(columns.map((column) => pad(truncate(row[column.key], column.width), column.width)).join(' '));
}

console.log('\nahead/behind is relative to the configured upstream; run pnpm sync to fetch first.');
