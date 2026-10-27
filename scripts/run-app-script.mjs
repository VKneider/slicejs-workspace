#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { isWindows, readJson, repoByName, repoPath } from './lib/workspace.mjs';

const [repoName, scriptName, ...extraArgs] = process.argv.slice(2);

if (!repoName || !scriptName) {
  console.error('Usage: node scripts/run-app-script.mjs <repo-dir> <package-script> [-- args...]');
  process.exit(1);
}

const repo = repoByName(repoName);
const dir = repoPath(repo);
const pkg = readJson(join(dir, 'package.json'));
const script = pkg.scripts?.[scriptName];

if (!script) {
  console.error(`Package script "${scriptName}" not found in ${repo.dir}/package.json.`);
  console.error(`Available: ${Object.keys(pkg.scripts || {}).join(', ') || '(none)'}`);
  process.exit(1);
}

function quoteArg(arg) {
  if (!/[\s"&|<>^()]/.test(arg)) return arg;
  return isWindows ? `"${arg.replace(/"/g, '\\"')}"` : `'${arg.replace(/'/g, `'\\''`)}'`;
}

const commandLine = [script, ...extraArgs.map(quoteArg)].join(' ');
const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') || 'PATH';
const env = {
  ...process.env,
  // The Slice CLI resolves the project through INIT_CWD first. pnpm would reset
  // it to the invocation directory, so we run the package script directly and
  // pin INIT_CWD to the app that owns the script.
  INIT_CWD: dir,
  npm_lifecycle_event: scriptName,
  npm_package_name: pkg.name,
  [pathKey]: [join(dir, 'node_modules', '.bin'), process.env[pathKey]].filter(Boolean).join(delimiter),
};

if (!existsSync(join(dir, 'node_modules'))) {
  console.error(`${repo.dir}: node_modules is missing. Run pnpm install from the workspace root.`);
  process.exit(1);
}

const child = spawn(commandLine, {
  cwd: dir,
  env,
  stdio: 'inherit',
  shell: true,
  windowsHide: true,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (child.exitCode === null) child.kill(signal);
  });
}

child.on('error', (error) => {
  console.error(`${repo.dir}: failed to run "${commandLine}": ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`${repo.dir}: script "${scriptName}" terminated by ${signal}.`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
