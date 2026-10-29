import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  declaredSpec,
  formatSpec,
  gitOutput,
  isInside,
  localPackageVersion,
  realpathOrNull,
  repoPath,
  resolveFrom,
  satisfiesRange,
  tryReadJson,
} from './workspace.mjs';

function issue(severity, code, message) {
  return { severity, code, message };
}

function statusFromIssues(issues) {
  if (issues.some((item) => item.severity === 'error')) return 'error';
  if (issues.some((item) => item.severity === 'warn')) return 'warn';
  return 'ok';
}

/**
 * Read-only repository health for the dashboard. `pnpm doctor` remains the
 * authoritative check; this is the same information in a shape a UI can consume.
 */
export function collectRepoHealth(repo) {
  const dir = repoPath(repo);
  const exists = existsSync(dir);
  const isGit = exists ? existsSync(join(dir, '.git')) : false;
  const issues = [];

  let branch = '';
  let dirtyCount = 0;
  let ahead = null;
  let behind = null;
  let lastCommit = '';
  let pkg = null;

  if (!exists) {
    issues.push(issue('error', 'missing-repo', `Missing checkout at ${dir}. Run pnpm bootstrap.`));
  } else if (!isGit) {
    issues.push(issue('error', 'not-a-git-repo', `${dir} is not a Git checkout. Run pnpm bootstrap.`));
  } else {
    branch = gitOutput(repo, ['branch', '--show-current'], { allowFailure: true });
    dirtyCount = gitOutput(repo, ['status', '--porcelain'], { allowFailure: true })
      .split('\n')
      .filter(Boolean).length;
    const counts = gitOutput(repo, ['rev-list', '--left-right', '--count', 'HEAD...@{u}'], {
      allowFailure: true,
    });
    if (counts) {
      [ahead, behind] = counts.split(/\s+/).map(Number);
    }
    lastCommit = gitOutput(repo, ['log', '-1', '--format=%h %s'], { allowFailure: true });

    pkg = tryReadJson(join(dir, 'package.json'));

    if (repo.branch && branch !== repo.branch) {
      issues.push(
        issue('warn', 'branch-mismatch', `On "${branch || '(detached)'}", expected "${repo.branch}".`),
      );
    }
    if (!pkg) {
      issues.push(issue('error', 'package-missing', 'package.json is missing or invalid.'));
    } else if (repo.package && pkg.name !== repo.package) {
      issues.push(
        issue('error', 'package-name', `package name "${pkg.name}", expected "${repo.package}".`),
      );
    }
    if (dirtyCount > 0) {
      issues.push(issue('warn', 'dirty', `${dirtyCount} uncommitted file(s).`));
    }
    if (ahead === null) {
      issues.push(issue('info', 'no-upstream', 'No configured upstream; run pnpm sync to compare.'));
    } else {
      if (ahead > 0) issues.push(issue('info', 'ahead', `${ahead} commit(s) ahead of upstream.`));
      if (behind > 0) issues.push(issue('info', 'behind', `${behind} commit(s) behind upstream.`));
    }
  }

  return {
    dir: repo.dir,
    name: repo.name,
    package: pkg?.name || repo.package || null,
    version: pkg?.version || 'unknown',
    role: repo.role || 'unknown',
    required: Boolean(repo.required),
    remote: repo.remote || null,
    branch: branch || '',
    expectedBranch: repo.branch || '',
    exists,
    isGit,
    dirtyCount,
    ahead,
    behind,
    lastCommit,
    status: statusFromIssues(issues),
    issues,
  };
}

/**
 * Link and version health for every consumer declared in the manifest.
 * Mirrors `scripts/doctor.mjs`; if the rules change, change both.
 */
export function collectLinkHealth(manifest) {
  const findings = [];

  for (const consumerName of manifest.consumers) {
    const consumer = manifest.repos.find((repo) => repo.dir === consumerName || repo.name === consumerName);
    if (!consumer) {
      findings.push({
        consumer: consumerName,
        package: null,
        status: 'skipped',
        resolved: null,
        expectedRoot: null,
        localVersion: null,
        declaredSpec: null,
        inRange: null,
        message: `Consumer "${consumerName}" is not in workspace.config.json.`,
      });
      continue;
    }

    const consumerPath = repoPath(consumer);
    if (!existsSync(consumerPath)) {
      findings.push({
        consumer: consumer.dir,
        package: null,
        status: 'skipped',
        resolved: null,
        expectedRoot: null,
        localVersion: null,
        declaredSpec: null,
        inRange: null,
        message: 'Repo is not cloned; run pnpm bootstrap.',
      });
      continue;
    }

    const hasNodeModules = existsSync(join(consumerPath, 'node_modules'));

    for (const link of manifest.links) {
      if (link.dir === consumer.dir) continue;

      if (!hasNodeModules) {
        findings.push({
          consumer: consumer.dir,
          package: link.package,
          status: 'error',
          resolved: null,
          expectedRoot: repoPath(link.dir),
          localVersion: null,
          declaredSpec: null,
          inRange: null,
          message: 'node_modules is missing; run pnpm install from the workspace root.',
        });
        continue;
      }

      const expectedRoot = repoPath(link.dir);
      let resolved = null;
      try {
        resolved = resolveFrom(consumerPath, link.package);
      } catch (error) {
        findings.push({
          consumer: consumer.dir,
          package: link.package,
          status: 'error',
          resolved: null,
          expectedRoot,
          localVersion: null,
          declaredSpec: null,
          inRange: null,
          message: `Cannot resolve ${link.package}: ${error.message}`,
        });
        continue;
      }

      const resolvedReal = realpathOrNull(resolved) ?? resolved;
      const inside = isInside(expectedRoot, resolvedReal);
      const localVersion = localPackageVersion(link.dir);
      const spec = declaredSpec(consumerPath, link.package);
      const inRange = spec ? satisfiesRange(localVersion, spec) : null;
      const issues = [];

      if (!inside) {
        issues.push(
          `Resolves outside the local source (expected under ${expectedRoot}, got ${resolvedReal}).\n` +
            'Fix: run "pnpm install" from the workspace root, never inside the subrepo.',
        );
      } else {
        const direct = join(consumerPath, 'node_modules', link.package);
        if (existsSync(direct)) {
          const directReal = realpathOrNull(direct) ?? direct;
          if (!isInside(expectedRoot, directReal)) {
            issues.push(`node_modules/${link.package} points outside the local source (${directReal}).`);
          }
        }
      }

      if (spec && inRange === false) {
        issues.push(
          `Override out of declared range — ${formatSpec(localVersion, spec)}. ` +
            'Expected for known skew; confirm compatibility before releasing.',
        );
      }

      findings.push({
        consumer: consumer.dir,
        package: link.package,
        status: issues.length === 0 ? 'ok' : issues.some((item) => item.includes('outside')) ? 'error' : 'warn',
        resolved: resolvedReal,
        expectedRoot,
        localVersion,
        declaredSpec: spec,
        inRange,
        message: issues.join(' '),
      });
    }
  }

  return findings;
}

export function summarizeHealth(repos, links) {
  const count = (items) =>
    items.reduce((accumulator, item) => {
      accumulator[item.status] = (accumulator[item.status] || 0) + 1;
      return accumulator;
    }, {});

  return {
    repos: { total: repos.length, ...count(repos) },
    links: { total: links.length, ...count(links) },
  };
}
