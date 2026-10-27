#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ensureDirLink,
  log,
  repoByName,
  repoPath,
} from './lib/workspace.mjs';

const framework = repoByName('slice.js');
const cli = repoByName('slicejs-cli');
const frameworkDir = repoPath(framework);
const cliDir = repoPath(cli);
const cliEntry = join(cliDir, 'client.js');
const cliArgs = process.argv.slice(2);

if (cliArgs.length === 0) cliArgs.push('dev');

if (!existsSync(frameworkDir) || !existsSync(cliEntry)) {
  log.error('The framework or CLI checkout is missing. Run pnpm bootstrap.');
  process.exit(1);
}
if (!existsSync(join(frameworkDir, 'node_modules'))) {
  log.error('repos/slice.js/node_modules is missing. Run pnpm install from the workspace root.');
  process.exit(1);
}

// The framework repo's own dev script expects a local CLI and its server serves
// /Slice/Slice.js by reading node_modules/slicejs-web-framework. Neither exists
// in a plain checkout of the package itself, so add workspace-managed
// self-links (they live under the subrepo's gitignored node_modules).
try {
  const fwLink = ensureDirLink(frameworkDir, join(frameworkDir, 'node_modules', 'slicejs-web-framework'));
  if (fwLink.created) log.info('Created self-link: slice.js/node_modules/slicejs-web-framework -> repos/slice.js');
  const cliLink = ensureDirLink(cliDir, join(frameworkDir, 'node_modules', 'slicejs-cli'));
  if (cliLink.created) log.info('Created link: slice.js/node_modules/slicejs-cli -> repos/slicejs-cli');
} catch (error) {
  log.error(error.message);
  process.exit(1);
}

log.info(`Running: slice ${cliArgs.join(' ')} (cwd ${frameworkDir})`);

const child = spawn(process.execPath, [cliEntry, ...cliArgs], {
  cwd: frameworkDir,
  env: {
    ...process.env,
    INIT_CWD: frameworkDir,
    SLICE_NO_LOCAL_DELEGATION: '1',
  },
  stdio: 'inherit',
  windowsHide: true,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (child.exitCode === null) child.kill(signal);
  });
}

child.on('error', (error) => {
  log.error(`Failed to start the CLI: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    log.error(`CLI terminated by ${signal}.`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
