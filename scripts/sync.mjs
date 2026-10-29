#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { git, gitOutput, log, manifest, repoPath } from './lib/workspace.mjs';

const pull = process.argv.slice(2).includes('--pull');

let failed = 0;

for (const repo of manifest.repos) {
  const dir = repoPath(repo);
  if (!existsSync(join(dir, '.git'))) {
    log.warn(`${repo.dir}: missing; skipping (run pnpm bootstrap).`);
    continue;
  }

  log.step(`${repo.dir}`);

  if (repo.sync === false) {
    log.info('  local-only repo; skipping fetch (no upstream yet).');
    continue;
  }

  const fetch = git(repo, ['fetch', '--prune', 'origin'], { capture: true, allowFailure: true });
  if (fetch.status !== 0) {
    failed += 1;
    log.error(`${repo.dir}: git fetch failed.\n${String(fetch.stderr || '').trim()}`);
    continue;
  }

  const branch = gitOutput(repo, ['branch', '--show-current'], { allowFailure: true }) || '(detached)';
  const upstream = gitOutput(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], {
    allowFailure: true,
  });

  if (!upstream) {
    log.warn(`${repo.dir}: branch ${branch} has no upstream.`);
    continue;
  }

  const counts = gitOutput(repo, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`]);
  const [ahead, behind] = counts.split(/\s+/).map(Number);
  const dirty = gitOutput(repo, ['status', '--porcelain'], { allowFailure: true });
  const dirtyCount = dirty ? dirty.split('\n').filter(Boolean).length : 0;

  log.info(
    `  ${branch} -> ${upstream}  ahead ${ahead}, behind ${behind}` +
      (dirtyCount ? `, ${dirtyCount} uncommitted` : ', clean'),
  );

  if (!pull) continue;

  if (behind === 0) {
    log.ok(`${repo.dir}: up to date`);
    continue;
  }
  if (ahead > 0) {
    log.warn(`${repo.dir}: diverged (ahead ${ahead}); refusing to pull.`);
    continue;
  }
  if (dirtyCount > 0) {
    log.warn(`${repo.dir}: working tree is dirty; refusing to pull.`);
    continue;
  }
  if (branch !== repo.branch) {
    log.warn(`${repo.dir}: on ${branch}, expected ${repo.branch}; refusing to pull.`);
    continue;
  }

  const merge = git(repo, ['merge', '--ff-only', upstream], { capture: true, allowFailure: true });
  if (merge.status === 0) {
    log.ok(`${repo.dir}: fast-forwarded to ${upstream}`);
  } else {
    failed += 1;
    log.error(`${repo.dir}: fast-forward failed.\n${String(merge.stderr || '').trim()}`);
  }
}

if (failed > 0) {
  log.error(`\nSync finished with ${failed} error(s).`);
  process.exitCode = 1;
} else {
  log.ok('\nSync complete');
  if (!pull) log.info('Run pnpm sync:pull to fast-forward clean, behind-only repos.');
}
