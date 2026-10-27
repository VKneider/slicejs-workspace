#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT,
  gitOutput,
  log,
  manifest,
  normalizeRemote,
  repoPath,
  reposRoot,
  run,
} from './lib/workspace.mjs';

const args = new Set(process.argv.slice(2));
const noInstall = args.has('--no-install');
const pull = args.has('--pull');

if (args.has('--help') || args.has('-h')) {
  console.log(`Usage: pnpm bootstrap [--no-install] [--pull]

  --no-install  Clone/verify the repos but skip pnpm install.
  --pull        Fetch and fast-forward clean repos that are on the expected branch.`);
  process.exit(0);
}

let failures = 0;
const cloned = [];
const skipped = [];

function fail(message) {
  failures += 1;
  log.error(message);
}

function ensureReposRoot() {
  mkdirSync(reposRoot, { recursive: true });
  log.step(`Repositories in ${reposRoot}`);
}

function verifyExisting(repo) {
  const dir = repoPath(repo);
  if (!existsSync(join(dir, '.git'))) {
    if (existsSync(dir)) {
      fail(
        `${repo.dir} exists but is not a Git repository. Move it or delete it before continuing (nothing is touched automatically).`,
      );
    }
    return false;
  }

  const remote = gitOutput(repo, ['remote', 'get-url', 'origin'], { allowFailure: true });
  if (normalizeRemote(remote) !== normalizeRemote(repo.remote)) {
    fail(
      `${repo.dir}: origin mismatch.\n        expected: ${repo.remote}\n        actual:   ${remote || '(no origin)'}`,
    );
    return false;
  }

  const branch = gitOutput(repo, ['branch', '--show-current'], { allowFailure: true });
  if (branch !== repo.branch) {
    log.warn(
      `${repo.dir}: current branch "${branch || '(detached)'}", expected "${repo.branch}" (not switched automatically).`,
    );
  }

  const dirty = gitOutput(repo, ['status', '--porcelain'], { allowFailure: true });
  if (dirty) {
    const count = dirty.split('\n').filter(Boolean).length;
    log.warn(`${repo.dir}: ${count} file(s) with local changes; left untouched.`);
  }

  return true;
}

function maybePull(repo) {
  if (!pull) return;

  const branch = gitOutput(repo, ['branch', '--show-current'], { allowFailure: true });
  if (branch !== repo.branch) {
    skipped.push(`${repo.dir}: not on ${repo.branch}`);
    return;
  }
  if (gitOutput(repo, ['status', '--porcelain'], { allowFailure: true })) {
    skipped.push(`${repo.dir}: working tree is dirty`);
    return;
  }
  if (!gitOutput(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { allowFailure: true })) {
    skipped.push(`${repo.dir}: no upstream configured`);
    return;
  }

  log.info(`  fetch ${repo.dir}`);
  const fetched = run('git', ['-C', repoPath(repo), 'fetch', '--prune', 'origin'], {
    cwd: ROOT,
    allowFailure: true,
    capture: true,
  });
  if (fetched.status !== 0) {
    skipped.push(`${repo.dir}: fetch failed`);
    return;
  }

  const merged = run('git', ['-C', repoPath(repo), 'merge', '--ff-only', `origin/${repo.branch}`], {
    cwd: ROOT,
    allowFailure: true,
    capture: true,
  });
  if (merged.status !== 0) {
    skipped.push(`${repo.dir}: fast-forward not possible`);
    log.warn(`${repo.dir}: fast-forward not possible (local commits or diverged history?).`);
  }
}

function cloneRepo(repo) {
  log.info(`  cloning ${repo.dir} (${repo.branch}) ...`);
  const result = run(
    'git',
    ['clone', '--branch', repo.branch, '--single-branch', repo.remote, repoPath(repo)],
    { cwd: ROOT, allowFailure: true, capture: true },
  );
  if (result.status === 0) {
    cloned.push(repo.dir);
    return true;
  }
  fail(
    `${repo.dir}: git clone failed.\n${String(result.stderr || result.stdout || '').trim() || '(no output)'}`,
  );
  return false;
}

ensureReposRoot();

for (const repo of manifest.repos) {
  log.step(`${repo.name} — ${repo.remote}`);
  const dir = repoPath(repo);

  if (existsSync(join(dir, '.git'))) {
    const valid = verifyExisting(repo);
    if (valid) {
      maybePull(repo);
      log.ok(`${repo.dir} present`);
    }
    continue;
  }

  if (existsSync(dir)) {
    fail(
      `${repo.dir} exists but is not a Git repository. Move it or delete it before continuing (nothing is touched automatically).`,
    );
    continue;
  }

  if (cloneRepo(repo)) {
    log.ok(`${repo.dir} cloned`);
  }
}

const knownDirs = new Set(manifest.repos.map((repo) => repo.dir));
const extraDirs = readdirSync(reposRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !knownDirs.has(entry.name))
  .map((entry) => entry.name);
if (extraDirs.length > 0) {
  log.warn(`Directories in repos/ that are not in the manifest: ${extraDirs.join(', ')}`);
}

if (skipped.length > 0) {
  log.info('\nSkipped by --pull:');
  for (const item of skipped) log.info(`  - ${item}`);
}

if (failures > 0) {
  log.error(`\nBootstrap finished with ${failures} error(s).`);
  process.exitCode = 1;
} else if (!noInstall) {
  log.step('pnpm install (workspace root)');
  const install = run('pnpm', ['install'], { cwd: ROOT, allowFailure: true });
  if (install.status !== 0) {
    log.error('pnpm install failed. Review the output above.');
    log.info('Suggestions: pnpm install --force, or delete the root node_modules and retry.');
    process.exitCode = 1;
  } else {
    log.ok('Dependencies installed');
  }
}

if (!noInstall && failures === 0) {
  log.info('\nNext steps:');
  log.info('  pnpm doctor');
  log.info('  pnpm verify:conclave');
}
