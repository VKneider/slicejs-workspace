import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const isWindows = process.platform === 'win32';
export const manifestPath = join(ROOT, 'workspace.config.json');
export const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
export const reposRoot = join(ROOT, manifest.reposDir || 'repos');

export const log = {
  step: (message) => console.log(`\n==> ${message}`),
  info: (message) => console.log(message),
  ok: (message) => console.log(`[ok]   ${message}`),
  warn: (message) => console.log(`[warn] ${message}`),
  error: (message) => console.log(`[error] ${message}`),
};

export function repoByName(name) {
  const repo = manifest.repos.find((item) => item.dir === name || item.name === name);
  if (!repo) {
    throw new Error(`Unknown repo "${name}". Add it to workspace.config.json.`);
  }
  return repo;
}

export function repoPath(repoOrName) {
  const repo = typeof repoOrName === 'string' ? repoByName(repoOrName) : repoOrName;
  return join(reposRoot, repo.dir);
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function tryReadJson(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

export function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function realpathOrNull(filePath) {
  try {
    return realpathSync(filePath);
  } catch {
    return null;
  }
}

function quoteWindows(arg) {
  if (arg === '') return '""';
  if (!/[\s"&|<>^()]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

/**
 * Runs a command synchronously. On Windows we go through cmd.exe because
 * pnpm is a .cmd shim; POSIX runs are direct (no shell).
 */
export function run(command, args = [], options = {}) {
  const {
    cwd = ROOT,
    env = process.env,
    capture = false,
    allowFailure = false,
    quiet = false,
  } = options;

  const stdio = capture ? 'pipe' : quiet ? 'ignore' : 'inherit';
  const result = isWindows
    ? spawnSync([command, ...args].map(quoteWindows).join(' '), {
        cwd,
        env,
        encoding: 'utf8',
        stdio,
        shell: true,
        windowsHide: true,
      })
    : spawnSync(command, args, {
        cwd,
        env,
        encoding: 'utf8',
        stdio,
        windowsHide: true,
      });

  const rendered = [command, ...args].join(' ');
  if (result.error) {
    if (allowFailure) return result;
    throw new Error(`Could not run "${rendered}": ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`Command failed (${result.status}): ${rendered}${cwd ? `\n  cwd: ${cwd}` : ''}`);
  }
  return result;
}

export function git(repoOrPath, args, options = {}) {
  const repo = typeof repoOrPath === 'string' && manifest.repos.some((item) => item.dir === repoOrPath || item.name === repoOrPath)
    ? repoPath(repoOrPath)
    : typeof repoOrPath === 'string'
      ? repoOrPath
      : repoPath(repoOrPath);
  return run('git', ['-C', repo, ...args], { capture: true, ...options });
}

export function gitOutput(repo, args, options = {}) {
  const result = git(repo, args, options);
  return String(result.stdout || '').trim();
}

export function normalizeRemote(url) {
  return String(url || '')
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

export function resolveFrom(consumerDir, packageName) {
  const requireFromConsumer = createRequire(join(consumerDir, 'package.json'));
  return requireFromConsumer.resolve(packageName);
}

export function localPackageVersion(repo) {
  return tryReadJson(join(repoPath(repo), 'package.json'))?.version ?? 'unknown';
}

export function declaredSpec(consumerDir, packageName) {
  const pkg = tryReadJson(join(consumerDir, 'package.json'));
  if (!pkg) return null;
  return (
    pkg.dependencies?.[packageName] ??
    pkg.devDependencies?.[packageName] ??
    pkg.peerDependencies?.[packageName] ??
    null
  );
}

export function ensureDirLink(target, linkPath) {
  const absoluteTarget = resolve(target);
  mkdirSync(dirname(linkPath), { recursive: true });

  const stat = lstatSync(linkPath, { throwIfNoEntry: false });
  if (stat) {
    if (!stat.isSymbolicLink()) {
      throw new Error(
        `${linkPath} exists and is a real directory/file. Refusing to replace it. Remove it manually if it is safe.`,
      );
    }
    try {
      if (realpathSync(linkPath) === realpathSync(absoluteTarget)) {
        return { created: false };
      }
    } catch {
      // Broken link: remove and recreate below.
    }
    removeLink(linkPath);
  }

  symlinkSync(absoluteTarget, linkPath, isWindows ? 'junction' : 'dir');
  return { created: true };
}

export function removeLink(linkPath) {
  try {
    unlinkSync(linkPath);
  } catch {
    rmdirSync(linkPath);
  }
}

export function linkTarget(linkPath) {
  try {
    return readlinkSync(linkPath);
  } catch {
    return null;
  }
}

export async function findFreePort(host = '127.0.0.1') {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error('Could not allocate a free port.'));
        else resolvePort(port);
      });
    });
  });
}

export function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

export function formatSpec(localVersion, spec) {
  if (!spec) return `${localVersion} (not declared, transitive dependency)`;
  return `declared ${spec} -> local ${localVersion}`;
}

/**
 * Minimal semver range check for the ranges used in this ecosystem
 * (exact, ^, ~, >=, <=, >, <, =, *, ||, hyphen ranges). It intentionally
 * ignores prerelease semantics; doctor only needs to flag obvious skew.
 */
export function satisfiesRange(version, range) {
  if (!range || range === '*' || range === 'latest' || /^(workspace|link|file):/.test(range)) {
    return true;
  }
  return String(range)
    .split('||')
    .some((part) => satisfiesSingle(version, part.trim()));
}

function parseVersion(value) {
  const match = String(value).match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function satisfiesSingle(version, range) {
  const parsed = parseVersion(version);
  if (!parsed) return true;

  if (range.includes(' - ')) {
    const [from, to] = range.split(' - ').map((part) => parseVersion(part));
    return Boolean(from && to && compareVersions(parsed, from) >= 0 && compareVersions(parsed, to) <= 0);
  }

  const match = range.match(/^(?<op>\^|~|>=|<=|>|<|=)?\s*v?(?<major>\d+)(?:\.(?<minor>\d+|x|\*))?(?:\.(?<patch>\d+|x|\*))?/);
  if (!match?.groups) return true;

  const op = match.groups.op || '';
  const major = Number(match.groups.major);
  const minor = match.groups.minor === undefined || /[x*]/.test(match.groups.minor) ? null : Number(match.groups.minor);
  const patch = match.groups.patch === undefined || /[x*]/.test(match.groups.patch) ? null : Number(match.groups.patch);
  const base = [major, minor ?? 0, patch ?? 0];

  if (op === '^') {
    if (compareVersions(parsed, base) < 0) return false;
    if (major > 0) return parsed[0] === major;
    if ((minor ?? 0) > 0) return parsed[0] === 0 && parsed[1] === minor;
    return parsed[0] === 0 && parsed[1] === 0 && parsed[2] === (patch ?? 0);
  }
  if (op === '~') {
    if (compareVersions(parsed, base) < 0) return false;
    return parsed[0] === major && parsed[1] === (minor ?? 0);
  }
  if (op === '>=') return compareVersions(parsed, base) >= 0;
  if (op === '<=') return compareVersions(parsed, base) <= 0;
  if (op === '>') return compareVersions(parsed, base) > 0;
  if (op === '<') return compareVersions(parsed, base) < 0;

  if (minor === null) return parsed[0] === major;
  if (patch === null) return parsed[0] === major && parsed[1] === minor;
  return compareVersions(parsed, base) === 0;
}
