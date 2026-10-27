#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { isWindows, repoByName, repoPath } from './lib/workspace.mjs';

const [repoName, command, ...args] = process.argv.slice(2);

if (!repoName || !command) {
  console.error('Usage: node scripts/run-in-repo.mjs <repo-dir> <command> [args...]');
  process.exit(1);
}

const repo = repoByName(repoName);
const dir = repoPath(repo);

if (!existsSync(dir)) {
  console.error(`${repo.dir} is missing. Run pnpm bootstrap.`);
  process.exit(1);
}

const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') || 'PATH';
const env = {
  ...process.env,
  INIT_CWD: dir,
  [pathKey]: [join(dir, 'node_modules', '.bin'), process.env[pathKey]].filter(Boolean).join(delimiter),
};

const useShell = isWindows && /\.(cmd|bat)$/i.test(command);
const child = spawn(command, args, {
  cwd: dir,
  env,
  stdio: 'inherit',
  shell: useShell,
  windowsHide: true,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (child.exitCode === null) child.kill(signal);
  });
}

child.on('error', (error) => {
  console.error(`${repo.dir}: failed to run ${command}: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`${repo.dir}: ${command} terminated by ${signal}.`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
