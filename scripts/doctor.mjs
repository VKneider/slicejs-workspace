#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT,
  declaredSpec,
  formatSpec,
  gitOutput,
  isInside,
  linkTarget,
  log,
  localPackageVersion,
  manifest,
  normalizeRemote,
  realpathOrNull,
  repoByName,
  repoPath,
  reposRoot,
  resolveFrom,
  run,
  satisfiesRange,
  tryReadJson,
} from './lib/workspace.mjs';

let errors = 0;
let warnings = 0;

function ok(message) {
  log.ok(message);
}

function warn(message) {
  warnings += 1;
  log.warn(message);
}

function error(message) {
  errors += 1;
  log.error(message);
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function parseSkillVersion(filePath) {
  try {
    const text = readFileSync(filePath, 'utf8');
    const version = text.match(/^version:\s*(.+)$/m)?.[1]?.trim();
    const targets = text.match(/^targets:\s*(.+)$/m)?.[1]?.trim();
    return { version, targets };
  } catch {
    return null;
  }
}

function majorOf(value) {
  const match = String(value || '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function checkEnvironment() {
  log.step('Environment');

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor >= 20) ok(`Node ${process.versions.node}`);
  else error(`Node ${process.versions.node} is too old; the ecosystem requires >= 20.`);

  const pnpm = run('pnpm', ['--version'], { capture: true, allowFailure: true });
  const pnpmVersion = String(pnpm.stdout || '').trim();
  if (pnpm.status === 0 && pnpmVersion) {
    const major = Number(pnpmVersion.split('.')[0]);
    if (major >= 10) ok(`pnpm ${pnpmVersion}`);
    else warn(`pnpm ${pnpmVersion}; pnpm 11.x is recommended (pnpm 10+ required for allowBuilds).`);
  } else {
    warn('Could not determine the pnpm version (is pnpm on PATH?).');
  }

  if (existsSync(join(ROOT, 'pnpm-lock.yaml'))) ok('Root pnpm-lock.yaml present');
  else warn('Root pnpm-lock.yaml missing; run pnpm install from the workspace root.');

  if (existsSync(join(ROOT, 'node_modules'))) ok('Root node_modules present');
  else warn('Root node_modules missing; run pnpm install from the workspace root.');

  if (process.platform === 'win32') {
    const query = run(
      'reg',
      [
        'query',
        'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock',
        '/v',
        'AllowDevelopmentWithoutDevLicense',
      ],
      { capture: true, allowFailure: true },
    );
    const output = `${query.stdout || ''}${query.stderr || ''}`;
    if (/AllowDevelopmentWithoutDevLicense\s+REG_DWORD\s+0x1/i.test(output)) {
      ok('Windows Developer Mode enabled (symlink privilege available)');
    } else {
      warn(
        'Windows Developer Mode is off. slicejs-cli tests that create directory symlinks fail with EPERM ' +
          '(36 failures on this suite). Enable Developer Mode or run the suite elevated.',
      );
    }
  }
}

function checkRepos() {
  log.step('Repositories');

  for (const repo of manifest.repos) {
    const dir = repoPath(repo);
    const isGit = existsSync(join(dir, '.git'));

    if (!isGit) {
      const message = `${repo.dir} is missing or is not a Git checkout. Run pnpm bootstrap.`;
      if (repo.required) error(message);
      else warn(message);
      continue;
    }

    const remote = gitOutput(repo, ['remote', 'get-url', 'origin'], { allowFailure: true });
    if (normalizeRemote(remote) !== normalizeRemote(repo.remote)) {
      error(
        `${repo.dir}: origin mismatch.\n        expected: ${repo.remote}\n        actual:   ${remote || '(no origin)'}`,
      );
    }

    const branch = gitOutput(repo, ['branch', '--show-current'], { allowFailure: true });
    if (branch !== repo.branch) {
      warn(`${repo.dir}: on "${branch || '(detached)'}", expected "${repo.branch}".`);
    }

    const pkg = tryReadJson(join(dir, 'package.json'));
    if (!pkg) {
      error(`${repo.dir}: package.json is missing or invalid.`);
      continue;
    }
    if (repo.package && pkg.name !== repo.package) {
      error(`${repo.dir}: package name "${pkg.name}", expected "${repo.package}".`);
    }

    const dirty = gitOutput(repo, ['status', '--porcelain'], { allowFailure: true });
    const dirtyCount = dirty ? dirty.split('\n').filter(Boolean).length : 0;
    const state = dirtyCount === 0 ? 'clean' : `${dirtyCount} uncommitted file(s)`;
    ok(`${repo.dir} — ${pkg.name}@${pkg.version} @ ${branch || '(detached)'} (${state})`);
  }

  const knownDirs = new Set(manifest.repos.map((repo) => repo.dir));
  if (existsSync(reposRoot)) {
    const extraDirs = readdirSync(reposRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !knownDirs.has(entry.name))
      .map((entry) => entry.name);
    if (extraDirs.length > 0) {
      warn(`Directories in repos/ that are not in the manifest: ${extraDirs.join(', ')}`);
    }
  }

  if (existsSync(join(ROOT, '.git'))) {
    const ignored = run('git', ['-C', ROOT, 'check-ignore', '-q', 'repos/slice.js'], {
      capture: true,
      allowFailure: true,
    });
    if (ignored.status === 0) ok('repos/ is ignored by Git');
    else warn('repos/ is not ignored by Git; it must never be committed.');
  }
}

function checkLinks() {
  log.step('Local links');

  for (const consumerName of manifest.consumers) {
    const consumer = repoByName(consumerName);
    const consumerPath = repoPath(consumer);
    if (!existsSync(consumerPath)) {
      warn(`Skipping links for ${consumer.dir}: repo is missing.`);
      continue;
    }
    if (!existsSync(join(consumerPath, 'node_modules'))) {
      error(`${consumer.dir}: node_modules is missing. Run pnpm install from the workspace root.`);
      continue;
    }

    for (const link of manifest.links) {
      if (link.dir === consumer.dir) continue;

      const expectedRoot = repoPath(link.dir);
      let resolved;
      try {
        resolved = resolveFrom(consumerPath, link.package);
      } catch (resolveError) {
        error(
          `${consumer.dir}: cannot resolve ${link.package} (${resolveError.message}). Run pnpm install from the workspace root.`,
        );
        continue;
      }

      const resolvedReal = realpathOrNull(resolved) ?? resolved;
      if (!isInside(expectedRoot, resolvedReal)) {
        error(
          `${consumer.dir}: ${link.package} resolves outside the local source.\n        expected under: ${expectedRoot}\n        resolved:       ${resolvedReal}\n        Fix: run "pnpm install" from ${ROOT} (never inside the subrepo).`,
        );
        continue;
      }

      const direct = join(consumerPath, 'node_modules', link.package);
      if (existsSync(direct)) {
        const directReal = realpathOrNull(direct) ?? direct;
        if (!isInside(expectedRoot, directReal)) {
          error(
            `${consumer.dir}: node_modules/${link.package} points outside the local source (${directReal}).`,
          );
          continue;
        }
      }

      ok(`${consumer.dir} -> ${link.package} (${resolvedReal})`);

      const localVersion = localPackageVersion(link.dir);
      const spec = declaredSpec(consumerPath, link.package);
      if (spec && !satisfiesRange(localVersion, spec)) {
        warn(
          `${consumer.dir}: override out of declared range — ${formatSpec(localVersion, spec)}. ` +
            'Expected for known skew; confirm compatibility before releasing.',
        );
      } else if (spec) {
        ok(`${consumer.dir}: ${formatSpec(localVersion, spec)}`);
      }
    }
  }
}

function checkStaleBuilds() {
  log.step('Production build copies');

  const runtime = join(repoPath('slice.js'), 'Slice', 'Slice.js');
  if (!existsSync(runtime)) {
    error(`Local runtime not found: ${runtime}`);
    return;
  }
  const runtimeHash = sha256(runtime);

  for (const consumerName of ['conclave', 'slicejs-components']) {
    const distRuntime = join(repoPath(consumerName), 'dist', 'Slice', 'Slice.js');
    if (!existsSync(distRuntime)) {
      log.info(`[info] ${consumerName}: no dist/Slice/Slice.js (not built).`);
      continue;
    }
    const distHash = sha256(distRuntime);
    if (distHash === runtimeHash) {
      ok(`${consumerName}: dist/Slice/Slice.js matches the local runtime`);
    } else {
      warn(`${consumerName}: dist/Slice/Slice.js is stale. Rebuild before serving production mode.`);
    }
  }
}

function checkSelfLinks() {
  log.step('Framework demo self-links');
  const frameworkRoot = repoPath('slice.js');
  const links = [
    { name: 'slicejs-web-framework', expected: frameworkRoot, path: join(frameworkRoot, 'node_modules', 'slicejs-web-framework') },
    { name: 'slicejs-cli', expected: repoPath('slicejs-cli'), path: join(frameworkRoot, 'node_modules', 'slicejs-cli') },
  ];

  for (const link of links) {
    const target = linkTarget(link.path);
    if (!target) {
      log.info(`[info] ${link.name}: self-link not created (pnpm dev:framework creates it on demand).`);
      continue;
    }
    const real = realpathOrNull(link.path);
    if (real && isInside(link.expected, real)) {
      ok(`slice.js/${link.name} -> ${real}`);
    } else {
      warn(`slice.js/${link.name} points outside ${link.expected} (${real || target}); pnpm dev:framework will fix it.`);
    }
  }
}

function checkSkill() {
  log.step('Slice.js developer skill');

  const vendoredDir = join(ROOT, '.opencode', 'skills', 'slice-js-developer');
  const vendoredPath = join(vendoredDir, 'VERSION');
  if (!existsSync(join(vendoredDir, 'SKILL.md')) || !existsSync(vendoredPath)) {
    error(
      `.opencode/skills/slice-js-developer is missing SKILL.md or VERSION. Run pnpm sync:skill (the vendored copy is required).`,
    );
    return;
  }

  const vendored = parseSkillVersion(vendoredPath);
  if (!vendored?.version) {
    error(`Cannot read the vendored skill version from ${vendoredPath}.`);
    return;
  }
  ok(`vendored skill v${vendored.version}${vendored.targets ? ` (targets ${vendored.targets})` : ''}`);

  const fwVersion = localPackageVersion('slice.js');
  const targetMajor = majorOf(vendored.targets);
  const frameworkMajor = majorOf(fwVersion);
  if (targetMajor !== null && frameworkMajor !== null && targetMajor !== frameworkMajor) {
    warn(
      `vendored skill targets ${vendored.targets}, but the local framework is ${fwVersion}. ` +
        'Expect guidance drift; update the skill for the new major.',
    );
  }

  const docsSkillDir = join(repoPath('slice.js_docs'), 'skill', 'slice-js-developer');
  if (!existsSync(docsSkillDir)) {
    warn('the docs checkout is missing; cannot compare the vendored skill with its canonical source.');
    return;
  }

  const source = parseSkillVersion(join(docsSkillDir, 'VERSION'));
  if (source?.version && source.version !== vendored.version) {
    warn(
      `vendored skill v${vendored.version}, docs skill v${source.version}. Run pnpm sync:skill before committing.`,
    );
  } else if (source?.version) {
    ok(`matches the docs skill version (v${source.version})`);
  }

  const manifest = tryReadJson(join(repoPath('slice.js_docs'), 'skill', 'manifest.json'));
  if (Array.isArray(manifest?.files)) {
    const drifted = manifest.files.filter((file) => {
      const sourceFile = join(docsSkillDir, file);
      const targetFile = join(vendoredDir, file);
      if (!existsSync(sourceFile) || !existsSync(targetFile)) return true;
      return !readFileSync(sourceFile).equals(readFileSync(targetFile));
    });
    if (drifted.length > 0) {
      warn(
        `${drifted.length} skill file(s) differ from the docs source (${drifted.slice(0, 4).join(', ')}` +
          `${drifted.length > 4 ? ', …' : ''}). Run pnpm sync:skill.`,
      );
    } else {
      ok('skill files match the docs source');
    }
  }
}

checkEnvironment();
checkRepos();
checkLinks();
checkStaleBuilds();
checkSelfLinks();
checkSkill();

log.step('Result');
if (errors === 0) {
  log.ok(`${errors} error(s), ${warnings} warning(s)`);
} else {
  log.error(`${errors} error(s), ${warnings} warning(s)`);
  process.exitCode = 1;
}
